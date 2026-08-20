#!/usr/bin/env node
/**
 * Correctif expo-sqlite 57.0.1 — support web.
 *
 * `web/WorkerChannel.ts` renvoie les résultats des appels synchrones dans un
 * SharedArrayBuffer, précédés de leur longueur sur 4 octets. La longueur est
 * écrite ainsi :
 *
 *     resultArray.set(new Uint32Array([length]), 0);   // resultArray: Uint8Array
 *
 * `Uint8Array.prototype.set` convertit chaque élément source vers le type de la
 * cible : seul `length % 256` est écrit, dans l'octet 0. La lecture, elle, fait
 * bien `new Uint32Array(buffer, 0, 1)[0]`. Conséquence : tout résultat de 256
 * octets ou plus est tronqué et `JSON.parse` échoue sur « Unterminated string ».
 * Autrement dit, aucune lecture SQLite synchrone non triviale ne fonctionne sur
 * le web — et c'est l'API que drizzle/expo-sqlite utilise.
 *
 * On écrit la longueur via une vue Uint32Array sur le même buffer, exactement
 * symétrique de la lecture. À retirer dès que le correctif est publié en amont.
 *
 * Lancé par `npm run postinstall`. Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'expo-sqlite',
  'web',
  'WorkerChannel.ts',
);

const BROKEN = 'resultArray.set(new Uint32Array([length]), 0);';
const FIXED = 'new Uint32Array(resultBuffer, 0, 1)[0] = length;';

let source;
try {
  source = readFileSync(FILE, 'utf8');
} catch {
  console.log('patch-expo-sqlite : expo-sqlite absent, rien à faire.');
  process.exit(0);
}

if (source.includes(FIXED)) {
  console.log('patch-expo-sqlite : déjà appliqué.');
  process.exit(0);
}

if (!source.includes(BROKEN)) {
  console.warn(
    'patch-expo-sqlite : la ligne attendue est introuvable — expo-sqlite a sans doute ' +
      'corrigé le bug ou changé son implémentation. Vérifier avant de retirer ce script.',
  );
  process.exit(0);
}

writeFileSync(FILE, source.replace(BROKEN, FIXED));
console.log('patch-expo-sqlite : longueur des résultats synchrones corrigée (web).');
