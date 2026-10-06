import { and, eq, isNull } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { nowIso, uuidv7 } from '../../lib/id';
import { bumpRevision, db } from '../client';
import { meta, user } from '../schema';
import type { Account } from '../schema';

/*
 * Compte local.
 *
 * Il n'y a pas encore de serveur : le mot de passe verrouille l'accès à l'app
 * sur cet appareil, rien de plus. La base SQLite elle-même n'est pas chiffrée,
 * donc un hash salé SHA-256 suffit — pas la peine d'un KDF coûteux pour garder
 * une porte dont le mur est en carton. La vraie authentification (et sa
 * récupération de mot de passe) arrivera avec la sync, côté serveur.
 *
 * Rien n'est poussé dans `sync_queue` : le compte distant se créera par son
 * propre flux d'inscription, et le hash local n'a pas à quitter l'appareil.
 */

const SIGNED_IN_KEY = 'signed_in_user_id';
export const MIN_PASSWORD_LENGTH = 8;

/** Erreur dont le message peut être montré tel quel à l'utilisateur. */
export class AuthError extends Error {}

const accountColumns = {
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  createdAt: user.createdAt,
};

/** Le compte de cet appareil, connecté ou non. Null au tout premier lancement. */
export function getLocalAccount(): Account | null {
  return db.select(accountColumns).from(user).where(isNull(user.deletedAt)).limit(1).get() ?? null;
}

/**
 * Le compte connecté. La connexion persiste jusqu'à la déconnexion explicite :
 * on ne redemande pas le mot de passe à chaque ouverture en salle.
 */
export function getSignedInAccount(): Account | null {
  const row = db.select().from(meta).where(eq(meta.key, SIGNED_IN_KEY)).get();
  if (!row) return null;
  return (
    db
      .select(accountColumns)
      .from(user)
      .where(and(eq(user.id, row.value), isNull(user.deletedAt)))
      .get() ?? null
  );
}

export async function signUp(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<Account> {
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);

  if (getLocalAccount()) throw new AuthError('Un compte existe déjà sur cet appareil.');
  if (!displayName) throw new AuthError('Choisis un pseudo.');
  if (!isPlausibleEmail(email)) throw new AuthError("Cette adresse e-mail n'a pas l'air valide.");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }

  const id = uuidv7();
  const ts = nowIso();
  const salt = toHex(Crypto.getRandomBytes(16));
  const passwordHash = await hashPassword(input.password, salt);

  db.transaction((tx) => {
    tx.insert(user)
      .values({ id, email, displayName, passwordHash, passwordSalt: salt, createdAt: ts, updatedAt: ts })
      .run();
    tx.insert(meta)
      .values({ key: SIGNED_IN_KEY, value: id })
      .onConflictDoUpdate({ target: meta.key, set: { value: id } })
      .run();
  });
  bumpRevision();
  return { id, email, displayName, createdAt: ts };
}

export async function signIn(emailInput: string, password: string): Promise<Account> {
  const email = normalizeEmail(emailInput);
  const row = db
    .select()
    .from(user)
    .where(and(eq(user.email, email), isNull(user.deletedAt)))
    .get();
  // Même message dans les deux cas : on ne révèle pas quel champ est faux.
  const invalid = new AuthError('E-mail ou mot de passe incorrect.');
  if (!row) throw invalid;
  if ((await hashPassword(password, row.passwordSalt)) !== row.passwordHash) throw invalid;

  db.insert(meta)
    .values({ key: SIGNED_IN_KEY, value: row.id })
    .onConflictDoUpdate({ target: meta.key, set: { value: row.id } })
    .run();
  bumpRevision();
  return { id: row.id, email: row.email, displayName: row.displayName, createdAt: row.createdAt };
}

/** Ne touche à aucune donnée : la séance en cours, s'il y en a une, attend la reconnexion. */
export function signOut(): void {
  db.delete(meta).where(eq(meta.key, SIGNED_IN_KEY)).run();
  bumpRevision();
}

function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** Volontairement laxiste : le serveur vérifiera vraiment, par un e-mail de confirmation. */
const isPlausibleEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
