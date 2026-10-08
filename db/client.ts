import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import * as schema from './schema';

export const DATABASE_NAME = 'muscu.db';

export type Database = ExpoSQLiteDatabase<typeof schema>;

/*
 * Les poignées vivent sur `globalThis` et pas dans des variables de module :
 * en dev, le rechargement à chaud réévalue ce fichier dès qu'une de ses
 * dépendances change (le schéma, typiquement). Une variable de module
 * repartirait à null pendant que l'app tourne encore — les écritures suivantes
 * échouaient alors en plein milieu d'une transaction (« Failed to run the
 * query 'rollback' »). Une seule connexion par page, quoi qu'il arrive.
 */
type Handles = { sqlite: SQLite.SQLiteDatabase | null; drizzle: Database | null };
const handles: Handles = ((globalThis as { __muscuDb?: Handles }).__muscuDb ??= { sqlite: null, drizzle: null });

/**
 * Ouvre la base. À appeler **une fois**, avant tout accès (voir app/_layout.tsx).
 *
 * Pourquoi ce n'est pas juste `openDatabaseSync` au chargement du module :
 * sur le web, l'API synchrone d'expo-sqlite fait tourner le thread principal
 * en boucle d'attente (`Atomics.pause`) pendant qu'un worker répond. Au tout
 * premier appel, ce worker n'a pas encore instancié son WASM — et comme le
 * thread principal ne rend jamais la main, la boucle atteint sa limite et
 * lève « Sync operation timeout ». Un `openDatabaseAsync` préalable laisse le
 * worker démarrer ; les appels synchrones répondent ensuite immédiatement.
 */
export async function initDatabase(): Promise<Database> {
  if (handles.drizzle) return handles.drizzle;

  let sqlite: SQLite.SQLiteDatabase;
  try {
    if (Platform.OS === 'web') await warmUpWorker();
    sqlite = SQLite.openDatabaseSync(DATABASE_NAME);
  } catch (e) {
    // Sur le web, un échec ici est définitif pour cette page : on repart à neuf.
    if (recoverByReloading()) return new Promise<never>(() => {});
    throw e;
  }

  try {
    sqlite.execSync('PRAGMA journal_mode = WAL;');
  } catch {
    // Le VFS OPFS du build web ne connaît pas le WAL : sans importance ici.
  }
  sqlite.execSync('PRAGMA foreign_keys = ON;');

  handles.sqlite = sqlite;
  handles.drizzle = drizzle(sqlite, { schema });
  clearRecoveryFlag();
  return handles.drizzle;
}

/**
 * Réveille le worker WASM via une ouverture asynchrone sur `:memory:`, qui
 * passe par MemoryVFS et ne crée aucun fichier OPFS. Sans ce préchauffage, le
 * tout premier appel synchrone part en boucle d'attente avant même que le
 * worker ait instancié son WASM et abandonne sur « Sync operation timeout ».
 *
 * L'échec est ignoré volontairement : s'il échoue, c'est que le worker répond
 * déjà — ce qui est précisément le but.
 */
async function warmUpWorker(): Promise<void> {
  try {
    const warm = await SQLite.openDatabaseAsync(':memory:');
    await warm.closeAsync();
  } catch {
    /* voir ci-dessus */
  }
}

/*
 * Récupération après un échec d'ouverture sur le web.
 *
 * expo-sqlite utilise AccessHandlePoolVFS : au démarrage de son worker, celui-ci
 * prend un « sync access handle » OPFS sur *tous* les fichiers de son répertoire
 * et ne les rend qu'à sa propre destruction. Juste après un F5, le worker de la
 * page sortante détient donc encore le pool, et l'initialisation échoue avec
 * NoModificationAllowedError.
 *
 * Réessayer dans la même page est inutile : quand `AccessHandlePoolVFS.create()`
 * échoue, `maybeInitAsync()` a déjà affecté `_sqlite3` mais laisse `_vfs` à null.
 * La garde `if (!_sqlite3)` empêche toute nouvelle tentative, et tous les appels
 * suivants échouent sur « Invalid VFS state ». Le worker est mort, et l'API
 * n'offre aucun moyen de le recréer.
 *
 * Le seul retour possible est donc un worker neuf, c'est-à-dire un rechargement
 * de la page — le temps que le worker précédent soit détruit. On plafonne les
 * tentatives pour ne jamais boucler, et l'utilisateur ne voit que l'écran de
 * chargement.
 */
const RECOVERY_KEY = 'muscu:db-recovery';
const MAX_RECOVERY_RELOADS = 3;

function recoverByReloading(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  let attempt = 0;
  try {
    attempt = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? '0');
  } catch {
    return false; // sessionStorage indisponible : on ne peut pas compter, donc on n'insiste pas.
  }
  if (attempt >= MAX_RECOVERY_RELOADS) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_KEY, String(attempt + 1));
  } catch {
    return false;
  }
  // Laisse au worker de la page précédente le temps de mourir avant de repartir.
  window.setTimeout(() => window.location.reload(), 250 * (attempt + 1));
  return true;
}

function clearRecoveryFlag(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* sans conséquence */
  }
}

/**
 * Accès à la base. C'est un proxy vers la poignée ouverte par `initDatabase`,
 * pour que les modules de db/queries puissent faire `import { db }` sans se
 * soucier du moment de l'initialisation.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const handle = handles.drizzle;
    if (!handle) {
      throw new Error("La base n'est pas ouverte : initDatabase() doit être awaité d'abord.");
    }
    const value = Reflect.get(handle, prop, receiver);
    return typeof value === 'function' ? value.bind(handle) : value;
  },
});

/**
 * Poignée expo-sqlite brute. Réservée à la sync (db/queries/sync.ts), qui
 * déplace des lignes entières entre SQLite et Postgres sans passer par les
 * types Drizzle.
 */
export function rawDatabase(): SQLite.SQLiteDatabase {
  if (!handles.sqlite) throw new Error("La base n'est pas ouverte : initDatabase() doit être awaité d'abord.");
  return handles.sqlite;
}

/* ------------------------------------------------------------------ *
 * Réactivité.
 *
 * On n'utilise pas `useLiveQuery` de drizzle : il s'appuie sur
 * `addDatabaseChangeListener`, absent du portage web d'expo-sqlite. À la place,
 * un compteur global que les mutations incrémentent — les écritures passent
 * toutes par db/queries, donc l'invalidation reste centralisée.
 * ------------------------------------------------------------------ */

let revision = 0;
const listeners = new Set<() => void>();

/** À appeler après toute écriture. Réexécute les `useQuery` montés. */
export function bumpRevision(): void {
  revision += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getRevision = () => revision;

export function useRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}

/**
 * Lecture synchrone réexécutée à chaque mutation.
 * `deps` suit les mêmes règles qu'un useMemo : tout ce que `select` capture.
 * Les lectures SQLite locales coûtent quelques centaines de microsecondes, on
 * peut donc se permettre de les refaire pendant le rendu.
 */
export function useQuery<T>(select: () => T, deps: readonly unknown[]): T {
  const rev = useRevision();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(select, [rev, ...deps]);
}
