# Muscu Tracker

Suivi d'entraînement en salle. Une seule codebase pour iOS, Android et le web.
Implémentation de [`spec-muscu-tracker.md`](./spec-muscu-tracker.md).

Tout est local : SQLite est la source de vérité, aucun appel réseau n'est fait
pendant une séance.

## Démarrer

```bash
npm install          # applique aussi le correctif expo-sqlite, voir plus bas
npm run web          # http://localhost:8081
npm run ios          # nécessite un Mac
npm run android
```

Scripts utiles :

| Commande | Effet |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | régénère les migrations Drizzle depuis `db/schema.ts` |
| `npm run bodymap:build` | régénère `paths.generated.ts` depuis les deux SVG |
| `npm run build:web` | site statique dans `dist/` |

## Déployer le web

Le build est statique, mais **l'hébergeur doit envoyer deux en-têtes** :

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Sans elles, pas de `SharedArrayBuffer`, donc pas de SQLite WASM, donc pas d'app.
Elles sont déjà déclarées pour EAS Hosting dans `app.json` et servies par le dev
server via `metro.config.js`. Sur un Ingress nginx :

```yaml
nginx.ingress.kubernetes.io/configuration-snippet: |
  more_set_headers "Cross-Origin-Opener-Policy: same-origin";
  more_set_headers "Cross-Origin-Embedder-Policy: credentialless";
```

Un service worker (`public/sw.js`) et un manifeste rendent l'app installable et
démarrable hors ligne.

## Ce qui est fait

Les 8 premiers lots du §10 du spec. La sync serveur (lot 9) n'est pas
implémentée, mais le schéma la prépare : UUID v7 côté client, `updated_at` /
`deleted_at` sur chaque table utilisateur, et une table `sync_queue` alimentée
par toutes les mutations.

| Écran | Route |
|---|---|
| Accueil, reprise de séance, couverture musculaire | `/` |
| Catalogue de séances | `/routines`, `/routines/new`, `/routines/[id]` |
| Bibliothèque (120 exercices, 27 muscles) | `/exercises`, `/exercises/[id]` |
| Historique, export JSON | `/history`, `/history/[id]` |
| Volume hebdo par muscle | `/history/volume` |
| **Mode séance** | `/session/[id]` |

## Arborescence

```
app/                    routes expo-router
components/
  BodyMap/              body-front.svg, body-back.svg, extracteur, composant
  SetRow.tsx            la ligne de série
  NumPad.tsx            pavé numérique custom
  RestTimer.tsx         chrono de repos
  ProgressChart.tsx     courbes et barres
db/
  schema.ts             Drizzle
  migrations/           générées
  queries/              une fonction par cas d'usage
  seed/exercises.json   le référentiel livré avec l'app
lib/                    strength, volume, format, notifications, backup, theme
stores/activeSession.ts état UI de la séance (Zustand)
scripts/                génération du BodyMap, correctif expo-sqlite
```

## Écarts par rapport au spec, et pourquoi

**Une table `session_exercise` en plus.** La liste des exercices d'une séance en
cours est mutable (on ajoute un exercice parce que le rack est pris) et doit
survivre à un kill de l'app. `routine_item` est un modèle partagé qu'on ne veut
pas modifier en pleine séance, et `set_log` ne connaît que les exercices déjà
loggés. La composition est donc figée au démarrage de la séance, exactement
comme `session.routine_name`. `set_log` reste attaché à `exercise_id`, sans FK
vers cette table : la décision 2 du §3 est préservée.

**Le BodyMap n'utilise pas `react-native-svg-transformer`.** Le transformer
produit un composant opaque : impossible de repeindre un `<path>` par son id
depuis l'extérieur, ce qui est précisément la fonction du composant. Les deux
SVG restent la source de vérité ; `scripts/svg-to-paths.mjs` en extrait la
géométrie vers `components/BodyMap/paths.generated.ts`, et `BodyMap.tsx`
construit les `<Path>` lui-même. Bénéfice annexe : le piège « transformer sur le
web » du §11 disparaît.

**Pas de victory-native / Skia pour les courbes.** `@shopify/react-native-skia`
tire un CanvasKit WASM de plusieurs Mo sur le web. `ProgressChart.tsx` fait la
courbe de charge en `react-native-svg` : même code partout, aucun poids ajouté.

**Le seed groupe les muscles par rôle** (`"primary": [...]`, `"secondary": [...]`)
plutôt qu'un objet par muscle. À 120 exercices c'est nettement plus court à
relire ; `db/seed/index.ts` aplatit vers `exercise_muscle`.

**`useQuery` maison plutôt que `useLiveQuery` de Drizzle.** Ce dernier repose sur
`addDatabaseChangeListener`, absent du portage web d'expo-sqlite. À la place, un
compteur de révision global qu'incrémentent les mutations — toutes les écritures
passent par `db/queries`, donc l'invalidation reste centralisée.

## Correctif expo-sqlite (web)

`npm install` lance `scripts/patch-expo-sqlite.mjs`, qui corrige un bug d'expo-sqlite
57.0.1 : le canal synchrone du portage web écrit la longueur du résultat avec
`Uint8Array.set(new Uint32Array([length]))`, ce qui n'écrit qu'un octet. Tout
résultat de 256 octets ou plus était tronqué et `JSON.parse` échouait. Autrement
dit, aucune lecture SQLite non triviale ne fonctionnait sur le web — et c'est
l'API qu'utilise Drizzle. Le script est idempotent et signale si la ligne
attendue disparaît (correctif publié en amont → script à retirer).

Deux autres particularités du web sont gérées dans `db/client.ts`, commentées sur
place : le préchauffage du worker WASM avant le premier appel synchrone, et la
récupération après un rechargement pendant que le worker précédent détient encore
le pool de handles OPFS.

## Limites connues

- **Le natif n'a pas été exécuté.** Tout a été vérifié sur le build web (base,
  séance, PR, historique, volume, export). Le code natif est le même à
  l'exception d'`expo-notifications`, dont le chemin permission + notification
  programmée demande un vrai appareil.
- **Support web d'expo-sqlite en alpha**, d'où le correctif ci-dessus.
- Pas de superset dans l'UI : la colonne `superset_key` existe, l'écran de
  séance ne l'exploite pas encore.
- Pas d'import de sauvegarde : l'export JSON existe, la relecture non.
