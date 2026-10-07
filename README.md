# Muscu Tracker

Suivi d'entraînement en salle. Une seule codebase pour iOS, Android et le web.
Implémentation de [`spec-muscu-tracker.md`](./spec-muscu-tracker.md).

Tout est local : SQLite est la source de vérité, aucun appel réseau n'est fait
pendant une séance. Un compte local protège l'accès ; le volet social (partager
ses séances avec ses partenaires de salle) viendra avec la synchronisation.

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

Les 8 premiers lots du §10 du spec, plus le cardio (lot 10), un compte local et
une couche de rétention (voir plus bas). La sync serveur (lot 9) n'est pas implémentée, mais
le schéma la prépare : UUID v7 côté client, `updated_at` / `deleted_at` sur
chaque table utilisateur, et une table `sync_queue` alimentée par toutes les
mutations.

| Écran | Route |
|---|---|
| Connexion / création de compte | `/login` |
| Accueil : prochaine séance, objectif de la semaine, records récents | `/` |
| Catalogue de séances, programmes de départ | `/routines`, `/routines/new`, `/routines/[id]` |
| Bibliothèque : 120 exercices, 27 muscles (bonhomme cliquable), 10 activités cardio | `/exercises`, `/exercises/[id]` |
| Progrès : historique, export JSON | `/history`, `/history/[id]` |
| Volume hebdo par muscle | `/history/volume` |
| Profil : stats depuis le début, objectif hebdo, déconnexion | `/profile` |
| **Mode séance** | `/session/[id]` |
| Bilan de fin de séance | `/session/recap/[id]` |

## Compte

Un compte **local**, un seul par appareil : il verrouille l'accès et prépare le
volet social (partage de séances entre partenaires), qui arrivera avec la sync.
Toutes les routes sauf `/login` sont derrière un `Stack.Protected` dans
`app/_layout.tsx`. La connexion persiste (clé `signed_in_user_id` de `meta`)
jusqu'à la déconnexion explicite. Le mot de passe est haché (SHA-256 salé) ; il
n'y a pas de récupération possible tant qu'il n'y a pas de serveur.

## Rétention

Ce qui donne une raison de revenir, toute la logique est dans
`db/queries/engagement.ts` :

- **Prochaine séance.** L'accueil met en avant le modèle fait il y a le plus
  longtemps (ou jamais fait). Sur un split Push / Pull / Legs, c'est exactement
  la rotation, sans avoir à déclarer de programme. À égalité, l'ordre de
  création.
- **Objectif de la semaine.** Un nombre de séances (3 par défaut, 1 à 7, réglable
  dans le Profil, rangé dans `meta.weekly_goal`), un anneau qui se remplit et les
  sept jours de lundi à dimanche, en heure locale. Plus le nombre de semaines
  d'affilée avec au moins une séance.
- **Records.** Un record = un exercice dont l'e1RM bat le meilleur d'avant,
  **compté une fois par séance** et non à chaque série. Les records récents sont
  affichés avec leur gain de 1RM estimé.
- **Bilan de fin de séance.** « Terminer » ouvre `/session/recap/[id]` : records
  battus, durée / séries / tonnage, progression de la semaine. La comparaison de
  tonnage avec la dernière fois n'apparaît que si elle est positive, une séance
  écourtée n'a pas à finir sur « −60 % ».
- **Programmes de départ.** Un nouvel utilisateur choisit Push · Pull · Legs,
  Haut · Bas ou Full body (`db/seed/programs.ts`) : un appui crée les modèles,
  modifiables ensuite.

## Cardio

Le lot 10 (§12 du spec) : une séance a deux parties, la muscu puis le cardio.
Le cardio vit dans ses propres tables (`cardio_activity`, `cardio_log`) et ses
requêtes (`db/queries/cardio.ts`) ; le formatage et les records sont dans
`lib/cardio.ts`, l'interface dans `components/Cardio.tsx`.

- **Mode séance** : section « Cardio » sous les exercices. Une séance sans série
  mais avec du cardio se termine normalement au lieu d'être abandonnée.
- **Bilan, historique** : temps de cardio, activités et records. Une séance
  100 % cardio n'affiche pas « 0 série · 0 kg ».
- **Bibliothèque** : onglet « Cardio », chaque activité avec ses records.
- Les records cardio (durée, distance, allure) ne sont **pas** matérialisés
  comme `exercise_stats` : ils se calculent à la volée sur `cardio_log`.
- Pas encore de cardio dans les modèles de séance (voir §12, « Hors lot 10 »).

## Design

Thème sombre unique (`lib/theme.ts`) : la salle est mal éclairée, le contraste
prime. Les règles :

- **Une couleur, un sens.** Ivoire pour l'action principale, or pour les
  records, vert pour la régularité, rouge uniquement pour le destructif. Le
  BodyMap a sa propre palette « braise » (`body*`), indépendante de l'accent.
- **La hiérarchie vient des fonds** (`bg` → `surface` → `surfaceAlt` →
  `surfaceHigh`), pas des bordures.
- **Deux polices**, chargées au démarrage par `expo-font` : Inter pour
  l'interface, Barlow Condensed pour les chiffres et les noms de séance
  (`type.hero`, `font.display`). En cas d'échec de chargement, l'app démarre
  quand même avec la police système.
- **Tous les textes passent par `components/Text.tsx`**, qui traduit
  `fontWeight` vers la bonne famille Inter (« Inter_700Bold »). Sans ça, le
  navigateur synthétise un faux gras par-dessus une police déjà grasse. Importer
  `Text` / `TextInput` depuis ce fichier, pas depuis `react-native`.
- Les dégradés et halos (`GradientFill`, `Glow`, `ProgressRing` dans
  `components/ui.tsx`) sont en `react-native-svg`, déjà présent : pas de
  dépendance de plus, même rendu partout.

## Données de démo

En développement, le Profil d'un compte sans séance propose « Charger des données
de démo » (`db/seed/demo.ts`) : cinq semaines de Push / Pull / Legs avec une
progression crédible, pour travailler l'UI sur des écrans remplis. Le bouton
n'existe pas dans un build de production (`__DEV__`).

## Arborescence

```
app/                    routes expo-router
components/
  ui.tsx                kit d'UI : Card, Button, Stat, Badge, ProgressRing…
  Text.tsx              Text / TextInput avec la bonne famille de police
  Progress.tsx          objectif de la semaine, carte de record
  ProgramPicker.tsx     choix d'un programme de départ
  BodyMap/              body-front.svg, body-back.svg, extracteur, composant
  SetRow.tsx            la ligne de série
  NumPad.tsx            pavé numérique custom
  RestTimer.tsx         chrono de repos
  ProgressChart.tsx     courbes et barres
db/
  schema.ts             Drizzle
  migrations/           générées
  queries/              une fonction par cas d'usage (auth, engagement…)
  seed/exercises.json   le référentiel livré avec l'app
  seed/programs.ts      programmes de départ
  seed/demo.ts          données de démo (dev)
lib/                    strength, volume, format, notifications, backup, theme, confirm
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

- **Le natif n'a pas été exécuté.** Tout a été vérifié sur le build web, en
  taille téléphone (connexion, programmes de départ, séance, PR, bilan,
  historique, volume, export). Le code natif est le même à l'exception
  d'`expo-notifications`, dont le chemin permission + notification programmée
  demande un vrai appareil, et des polices, à vérifier sur Android.
- **Un seul compte par appareil**, sans récupération du mot de passe tant qu'il
  n'y a pas de serveur. Le mot de passe n'est demandé qu'après une déconnexion
  volontaire.
- **Le social n'existe pas encore** : l'encart « Partenaires » du Profil
  l'annonce, il dépend de la sync.
- **Support web d'expo-sqlite en alpha**, d'où le correctif ci-dessus.
- Pas de superset dans l'UI : la colonne `superset_key` existe, l'écran de
  séance ne l'exploite pas encore.
- Pas d'import de sauvegarde : l'export JSON existe, la relecture non.
