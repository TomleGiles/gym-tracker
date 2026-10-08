import { isNotNull, isNull, and, like, inArray, eq, lte, max } from 'drizzle-orm';
import { useSyncExternalStore } from 'react';

import { supabase } from '../../lib/supabase';
import { nowIso } from '../../lib/id';
import { bumpRevision, db, rawDatabase } from '../client';
import { meta, syncQueue, user } from '../schema';
import { recomputeExerciseStats } from './sessions';

/*
 * Synchronisation avec Supabase (lot S0, §3 du spec social).
 *
 * Push puis pull, table par table, dans l'ordre parents → enfants :
 *
 * - Push : on relit dans chaque table les lignes modifiées depuis le dernier
 *   envoi (curseur sur `updated_at`), et on les envoie en upserts. Le serveur
 *   tranche en last-write-wins sur `updated_at` (trigger, voir
 *   supabase/migrations). On ne rejoue pas `sync_queue` : certaines écritures
 *   n'y passent pas ligne à ligne (copie du modèle au démarrage d'une séance,
 *   suppressions en cascade, réordonnancement), alors que toutes avancent
 *   `updated_at`. La file sert de signal et se vide après chaque envoi.
 *
 * - Pull : on récupère ce que le serveur a reçu depuis le dernier passage
 *   (curseur sur `server_updated_at`, horloge serveur), et on l'applique avec
 *   la même règle, sans alimenter `sync_queue`.
 *
 * Rien de tout ça n'est sur le chemin de la saisie d'une série : la sync tourne
 * à la connexion, à l'ouverture de l'app, au retour au premier plan et en fin
 * de séance, et l'app ne l'attend jamais.
 */

const TABLES = {
  routine: ['id', 'name', 'color', 'notes', 'archived_at', 'created_at', 'updated_at', 'deleted_at'],
  routine_item: [
    'id', 'routine_id', 'exercise_id', 'position', 'target_sets', 'target_reps',
    'rest_seconds', 'superset_key', 'notes', 'updated_at', 'deleted_at',
  ],
  session: [
    'id', 'routine_id', 'routine_name', 'started_at', 'ended_at', 'bodyweight_kg', 'notes', 'updated_at', 'deleted_at',
  ],
  session_exercise: [
    'id', 'session_id', 'exercise_id', 'position', 'target_sets', 'target_reps',
    'rest_seconds', 'superset_key', 'notes', 'updated_at', 'deleted_at',
  ],
  set_log: [
    'id', 'session_id', 'exercise_id', 'set_index', 'weight_kg', 'reps', 'rir',
    'set_type', 'is_pr', 'logged_at', 'updated_at', 'deleted_at',
  ],
  cardio_log: [
    'id', 'session_id', 'activity_id', 'position', 'duration_sec', 'distance_m',
    'calories', 'level', 'logged_at', 'updated_at', 'deleted_at',
  ],
} as const;

type Table = keyof typeof TABLES;
type Row = Record<string, unknown> & { id: string; updated_at: string };

/** Ordre parents → enfants : une série arrive après sa séance, côté serveur comme en local. */
const ORDER = Object.keys(TABLES) as Table[];

/** Le premier envoi après un passage en ligne peut compter des mois d'historique (§11, piège 9). */
const BATCH = 500;

/**
 * Le pull reprend un peu avant son curseur : une écriture serveur peut être
 * validée après une autre, plus récente, déjà lue. Réappliquer est sans effet.
 */
const PULL_OVERLAP_MS = 10_000;

const PUSH_KEY = (t: Table) => `sync:push:${t}`;
const PULL_KEY = (t: Table) => `sync:pull:${t}`;
const LAST_SYNC_KEY = 'sync:last_at';

/* ------------------------------------------------------------------ *
 * État affiché par l'UI (Profil)
 * ------------------------------------------------------------------ */

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error';
  /** Dernière sync réussie, ISO. */
  lastAt: string | null;
  error: string | null;
};

let status: SyncStatus = { state: 'idle', lastAt: null, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

let running: Promise<boolean> | null = null;

/**
 * Lance une sync, ou rejoint celle qui tourne déjà. Renvoie true si elle a
 * abouti. Ne lève jamais : un échec (hors ligne, session expirée) est rangé
 * dans le statut et la prochaine sync reprendra là où celle-ci s'est arrêtée.
 */
export function syncNow(): Promise<boolean> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<boolean> {
  const owner = boundRemoteId();
  if (!owner) return false;

  setStatus({ state: 'syncing', lastAt: status.lastAt ?? readMeta(LAST_SYNC_KEY) });
  try {
    const sb = supabase();
    const { data } = await sb.auth.getSession();
    // Session absente ou d'un autre compte : on n'envoie rien sous la mauvaise identité.
    if (!data.session || data.session.user.id !== owner) throw new Error('Session expirée : reconnecte-toi.');

    const queued = db.select({ id: max(syncQueue.id) }).from(syncQueue).get()?.id ?? null;
    for (const t of ORDER) await pushTable(t);
    // Seulement ce qui était en file au départ : une écriture faite pendant l'envoi reste signalée.
    if (queued !== null) db.delete(syncQueue).where(lte(syncQueue.id, queued)).run();

    let changed = false;
    const touchedExercises = new Set<string>();
    for (const t of ORDER) changed = (await pullTable(t, touchedExercises)) || changed;

    // `exercise_stats` n'est pas synchronisé : il se recalcule à partir des séries reçues.
    for (const exerciseId of touchedExercises) recomputeExerciseStats(exerciseId);

    const at = nowIso();
    writeMeta(LAST_SYNC_KEY, at);
    setStatus({ state: 'idle', lastAt: at, error: null });
    if (changed) bumpRevision();
    return true;
  } catch (e) {
    console.warn('[muscu] sync', e);
    setStatus({ state: 'error', error: describeError(e) });
    return false;
  }
}

async function pushTable(t: Table): Promise<void> {
  const columns = TABLES[t].join(', ');
  // Curseur composite (updated_at, id) : le démarrage d'une séance écrit plusieurs
  // lignes au même instant, et une page peut s'arrêter au milieu.
  let cursor = parseCursor(readMeta(PUSH_KEY(t)));
  for (;;) {
    const rows = rawDatabase().getAllSync<Row>(
      `SELECT ${columns} FROM ${t}
       WHERE updated_at > ? OR (updated_at = ? AND id > ?)
       ORDER BY updated_at, id LIMIT ${BATCH}`,
      [cursor.at, cursor.at, cursor.id],
    );
    if (!rows.length) return;

    const { error } = await supabase().from(t).upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    const last = rows[rows.length - 1];
    cursor = { at: last.updated_at, id: last.id };
    writeMeta(PUSH_KEY(t), JSON.stringify(cursor));
    if (rows.length < BATCH) return;
  }
}

/** Renvoie true si au moins une ligne locale a changé. */
async function pullTable(t: Table, touchedExercises: Set<string>): Promise<boolean> {
  const columns = TABLES[t];
  const stored = readMeta(PULL_KEY(t));
  // Postgres renvoie des microsecondes, que tous les moteurs JS ne savent pas lire.
  const storedMs = stored ? Date.parse(stored) : NaN;
  const since = !stored
    ? '1970-01-01T00:00:00Z'
    : Number.isFinite(storedMs)
      ? new Date(storedMs - PULL_OVERLAP_MS).toISOString()
      : stored;
  const upsert = `INSERT INTO ${t} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}
    WHERE excluded.updated_at > ${t}.updated_at`;

  let page: { at: string; id: string } | null = null;
  let changed = false;
  for (;;) {
    let query = supabase()
      .from(t)
      .select([...columns, 'server_updated_at'].join(','))
      .order('server_updated_at')
      .order('id')
      .limit(BATCH);
    query = page
      ? query.or(`server_updated_at.gt."${page.at}",and(server_updated_at.eq."${page.at}",id.gt."${page.id}")`)
      : query.gt('server_updated_at', since);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as (Row & { server_updated_at: string })[];
    if (!rows.length) break;

    const sqlite = rawDatabase();
    sqlite.withTransactionSync(() => {
      for (const row of rows) {
        try {
          const result = sqlite.runSync(upsert, columns.map((c) => (row[c] ?? null) as string | number | null));
          if (result.changes > 0) {
            changed = true;
            if (t === 'set_log') touchedExercises.add(String(row.exercise_id));
          }
        } catch (e) {
          // Une ligne qui référence un exercice inconnu (version d'app plus récente
          // ailleurs) ne doit pas bloquer tout le reste.
          console.warn(`[muscu] sync : ligne ${t}/${row.id} ignorée`, e);
        }
      }
    });

    const last = rows[rows.length - 1];
    page = { at: last.server_updated_at, id: last.id };
    writeMeta(PULL_KEY(t), last.server_updated_at);
    if (rows.length < BATCH) break;
  }
  return changed;
}

/** Nombre de lignes modifiées localement et pas encore envoyées. */
export function pendingChanges(): number {
  let total = 0;
  for (const t of ORDER) {
    const cursor = parseCursor(readMeta(PUSH_KEY(t)));
    const row = rawDatabase().getFirstSync<{ n: number }>(
      `SELECT count(*) AS n FROM ${t} WHERE updated_at > ? OR (updated_at = ? AND id > ?)`,
      [cursor.at, cursor.at, cursor.id],
    );
    total += row?.n ?? 0;
  }
  return total;
}

/**
 * Vide les données de l'utilisateur sur cet appareil, avant d'y connecter un
 * autre compte : la base locale n'appartient qu'à une personne. Ce n'est pas
 * une suppression de données utilisateur (elles vivent sur le serveur) mais
 * l'éviction d'un cache, d'où le DELETE plutôt qu'un soft delete.
 */
export function clearLocalUserData(): void {
  const sqlite = rawDatabase();
  sqlite.withTransactionSync(() => {
    for (const t of [...ORDER].reverse()) sqlite.runSync(`DELETE FROM ${t}`);
    sqlite.runSync('DELETE FROM exercise_stats');
    sqlite.runSync('DELETE FROM sync_queue');
  });
  db.delete(meta).where(like(meta.key, 'sync:%')).run();
  db.delete(meta).where(inArray(meta.key, ['weekly_goal', 'cardio_timer'])).run();
  setStatus({ state: 'idle', lastAt: null, error: null });
  bumpRevision();
}

/* ------------------------------------------------------------------ */

/** Le compte Supabase auquel la base locale est rattachée. */
function boundRemoteId(): string | null {
  return (
    db
      .select({ remoteId: user.remoteId })
      .from(user)
      .where(and(isNotNull(user.remoteId), isNull(user.deletedAt)))
      .get()?.remoteId ?? null
  );
}

function readMeta(key: string): string | null {
  return db.select().from(meta).where(eq(meta.key, key)).get()?.value ?? null;
}

function writeMeta(key: string, value: string): void {
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
}

function parseCursor(raw: string | null): { at: string; id: string } {
  if (!raw) return { at: '', id: '' };
  try {
    return JSON.parse(raw) as { at: string; id: string };
  } catch {
    return { at: '', id: '' };
  }
}

function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : '';
  if (/fetch|network|Failed to fetch|NetworkError/i.test(message)) return 'Pas de connexion : la sync reprendra toute seule.';
  return message || 'La synchronisation a échoué.';
}
