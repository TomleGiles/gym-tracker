import * as Crypto from 'expo-crypto';

/**
 * UUID v7 : 48 bits de timestamp ms + 74 bits d'aléa.
 * Généré côté client (§7 du spec) — pas d'auto-increment, donc pas de collision
 * à la fusion lors de la sync V2 ; et l'ordre lexicographique = l'ordre temporel,
 * ce qui rend les index SQLite sur les PK utiles.
 */
export function uuidv7(): string {
  const ts = Date.now();
  const bytes = new Uint8Array(16);

  // 48 bits de timestamp, big-endian.
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  const rand = Crypto.getRandomBytes(10);
  bytes.set(rand, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Horodatage de référence : ISO 8601, UTC, millisecondes (§11 « fuseaux »). */
export const nowIso = (): string => new Date().toISOString();
