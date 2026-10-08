import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import type { User as RemoteUser } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { nowIso } from '../../lib/id';
import { supabase } from '../../lib/supabase';
import { bumpRevision, db } from '../client';
import { meta, user } from '../schema';
import type { Account } from '../schema';
import { clearLocalUserData, syncNow } from './cloud';

/*
 * Compte en ligne (Supabase Auth, lot S0 du spec social).
 *
 * Le compte suit la personne sur tous ses appareils : on se connecte avec son
 * e-mail et son mot de passe, puis la sync ramène son historique. Il faut du
 * réseau pour se connecter ; ensuite la session reste ouverte et l'app marche
 * hors ligne comme avant.
 *
 * La table locale `user` garde le compte connecté sur cet appareil, rattaché à
 * son `auth.uid()` (`remote_id`). Les comptes locaux d'avant S0 n'ont pas de
 * `remote_id` : à leur prochaine connexion, leur mot de passe local est vérifié
 * une dernière fois et sert à créer le compte en ligne, avec tout l'historique.
 */

const SIGNED_IN_KEY = 'signed_in_user_id';
export const MIN_PASSWORD_LENGTH = 8;

/** Erreur dont le message peut être montré tel quel à l'utilisateur. */
export class AuthError extends Error {}

/** « Connecté » ou « vérifie ta boîte mail » quand Supabase exige la confirmation de l'adresse. */
export type AuthResult = 'signed-in' | 'confirm-email';

const accountColumns = {
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  remoteId: user.remoteId,
  createdAt: user.createdAt,
};

/** Le dernier compte connu sur cet appareil, connecté ou non. Null sur un appareil neuf. */
export function getLocalAccount(): Account | null {
  return db.select(accountColumns).from(user).where(isNull(user.deletedAt)).limit(1).get() ?? null;
}

/**
 * Le compte connecté. Il doit être rattaché à un compte en ligne : un compte
 * local d'avant S0 repasse par la connexion pour être mis en ligne.
 * La connexion persiste jusqu'à la déconnexion explicite.
 */
export function getSignedInAccount(): Account | null {
  const row = db.select().from(meta).where(eq(meta.key, SIGNED_IN_KEY)).get();
  if (!row) return null;
  return (
    db
      .select(accountColumns)
      .from(user)
      .where(and(eq(user.id, row.value), isNotNull(user.remoteId), isNull(user.deletedAt)))
      .get() ?? null
  );
}

export async function signUp(input: { displayName: string; email: string; password: string }): Promise<AuthResult> {
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  if (!displayName) throw new AuthError('Choisis un pseudo.');
  validate(email, input.password);

  const { data, error } = await call(() =>
    supabase().auth.signUp({
      email,
      password: input.password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectUrl() },
    }),
  );
  if (error) throw translate(error);
  // Avec la confirmation par e-mail, Supabase ne dit pas qu'une adresse est
  // prise (pour ne pas la révéler) : il renvoie un utilisateur sans identité.
  if (data.user && data.user.identities?.length === 0) {
    throw new AuthError('Un compte existe déjà avec cette adresse : connecte-toi.');
  }
  if (!data.session || !data.user) return 'confirm-email';
  bindAccount(data.user);
  return 'signed-in';
}

export async function signIn(emailInput: string, password: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) throw new AuthError('E-mail ou mot de passe incorrect.');

  const { data, error } = await call(() => supabase().auth.signInWithPassword({ email, password }));
  if (!error) {
    bindAccount(data.user);
    return 'signed-in';
  }

  // Pas de compte en ligne, mais peut-être un compte local d'avant S0 avec ce
  // mot de passe : on le met en ligne au passage, historique compris.
  if (error.code === 'invalid_credentials') {
    const local = db
      .select()
      .from(user)
      .where(and(eq(user.email, email), isNull(user.remoteId), isNull(user.deletedAt)))
      .get();
    if (local?.passwordHash && local.passwordSalt && (await hashPassword(password, local.passwordSalt)) === local.passwordHash) {
      return goOnline(local.email, local.displayName, password);
    }
  }
  throw translate(error);
}

async function goOnline(email: string, displayName: string, password: string): Promise<AuthResult> {
  const { data, error } = await call(() =>
    supabase().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectUrl() },
    }),
  );
  if (error) throw translate(error);
  // Un compte en ligne existe déjà pour cette adresse, avec un autre mot de passe.
  if (data.user && data.user.identities?.length === 0) throw new AuthError('E-mail ou mot de passe incorrect.');
  if (!data.session || !data.user) return 'confirm-email';
  bindAccount(data.user);
  return 'signed-in';
}

/** Renvoie l'e-mail de confirmation d'inscription. */
export async function resendConfirmation(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const { error } = await call(() =>
    supabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl() } }),
  );
  if (error) throw translate(error);
}

/** Envoie le lien « mot de passe oublié ». Répond pareil que l'adresse existe ou non. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  if (!isPlausibleEmail(email)) throw new AuthError("Cette adresse e-mail n'a pas l'air valide.");
  const { error } = await call(() =>
    supabase().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('reset-password') }),
  );
  if (error) throw translate(error);
}

/** Depuis le lien du mail : la session de récupération est déjà ouverte, on fixe le nouveau mot de passe. */
export async function completePasswordReset(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  const { data, error } = await call(() => supabase().auth.updateUser({ password }));
  if (error) throw translate(error);
  bindAccount(data.user);
}

/**
 * Déconnexion : on tente un dernier envoi (court), puis on ferme la session.
 * Les données restent sur l'appareil, rattachées au compte, pour la prochaine
 * connexion ; un autre compte les remplacera.
 */
export async function signOut(): Promise<void> {
  await Promise.race([syncNow(), new Promise((resolve) => setTimeout(resolve, 4000))]);
  try {
    await supabase().auth.signOut({ scope: 'local' });
  } catch {
    // Hors ligne : la session locale est effacée quand même.
  }
  forgetSignedIn();
}

/** La session en ligne a disparu (révoquée, expirée) : on repasse par l'écran de connexion. */
export function forgetSignedIn(): void {
  db.delete(meta).where(eq(meta.key, SIGNED_IN_KEY)).run();
  bumpRevision();
}

/**
 * Rattache l'appareil au compte en ligne qui vient de se connecter. Si la base
 * locale appartenait à quelqu'un d'autre, elle est vidée d'abord ; la sync
 * ramène ensuite les données du compte.
 */
function bindAccount(remote: RemoteUser): void {
  const email = normalizeEmail(remote.email ?? '');
  const metaName = remote.user_metadata?.display_name;
  const remoteName = typeof metaName === 'string' ? metaName.trim() : '';
  const ts = nowIso();

  const current = db.select().from(user).where(isNull(user.deletedAt)).get();
  const same = !!current && (current.remoteId === remote.id || (!current.remoteId && current.email === email));
  if (current && !same) {
    clearLocalUserData();
    db.delete(user).run();
  }

  let localId: string;
  if (current && same) {
    localId = current.id;
    db.update(user)
      .set({ remoteId: remote.id, email, displayName: remoteName || current.displayName, updatedAt: ts })
      .where(eq(user.id, current.id))
      .run();
  } else {
    localId = remote.id;
    db.insert(user)
      .values({
        id: localId,
        email,
        displayName: remoteName || email.split('@')[0],
        remoteId: remote.id,
        createdAt: remote.created_at ?? ts,
        updatedAt: ts,
      })
      .run();
  }

  db.insert(meta)
    .values({ key: SIGNED_IN_KEY, value: localId })
    .onConflictDoUpdate({ target: meta.key, set: { value: localId } })
    .run();
  bumpRevision();
  void syncNow();
}

/* ------------------------------------------------------------------ */

type SupabaseAuthError = { code?: string; status?: number; name?: string; message: string };

/** Les appels Supabase peuvent aussi lever (réseau coupé avant même la requête). */
async function call<T extends { error: SupabaseAuthError | null }>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw translate({ name: 'AuthRetryableFetchError', message: e instanceof Error ? e.message : String(e) });
  }
}

function translate(error: SupabaseAuthError): AuthError {
  switch (error.code) {
    case 'invalid_credentials':
      return new AuthError('E-mail ou mot de passe incorrect.');
    case 'email_not_confirmed':
      return new AuthError("Confirme d'abord ton adresse : ouvre le lien reçu par e-mail, puis reconnecte-toi.");
    case 'user_already_exists':
    case 'email_exists':
      return new AuthError('Un compte existe déjà avec cette adresse : connecte-toi.');
    case 'weak_password':
      return new AuthError(`Mot de passe trop faible : au moins ${MIN_PASSWORD_LENGTH} caractères, et évite les plus courants.`);
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new AuthError('Trop de tentatives : réessaie dans quelques minutes.');
    case 'signup_disabled':
      return new AuthError('Les inscriptions sont fermées pour le moment.');
    case 'same_password':
      return new AuthError("C'est déjà ton mot de passe actuel : choisis-en un autre.");
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(error.message)) {
    return new AuthError('Pas de connexion : il faut Internet pour se connecter.');
  }
  return new AuthError(error.message || 'Une erreur inattendue est survenue.');
}

function validate(email: string, password: string): void {
  if (!isPlausibleEmail(email)) throw new AuthError("Cette adresse e-mail n'a pas l'air valide.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
}

/** Où reviennent les liens des e-mails (confirmation, mot de passe oublié). */
function redirectUrl(path = ''): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/${path}`;
  return Linking.createURL(path);
}

/** Uniquement pour vérifier le mot de passe d'un compte local d'avant S0. */
function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** Volontairement laxiste : Supabase vérifie vraiment, par l'e-mail de confirmation. */
const isPlausibleEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
