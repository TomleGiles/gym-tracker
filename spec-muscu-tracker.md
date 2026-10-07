# Muscu Tracker — Spécification technique

Application de suivi d'entraînement en salle, **une seule codebase pour mobile (iOS/Android) et web**.

---

## 1. Périmètre

### Ce que fait l'app (V1)

| Bloc | Contenu |
|---|---|
| **Bibliothèque d'exercices** | ~150 exercices, chacun avec muscles primaires/secondaires, matériel, schéma anatomique (« petit bonhomme ») avec les muscles ciblés surlignés |
| **Catalogue de séances** | Modèles de séance créés par l'utilisateur (Push 1, Pull 1, Legs 1…), chacun = liste ordonnée d'exercices avec séries/reps cibles |
| **Mode séance** | On lance une séance → pour chaque exercice on voit le poids de la dernière fois, on saisit le poids/reps du jour, on coche la série |
| **Progression** | Historique par exercice : courbe de charge, 1RM estimé, tonnage, records personnels |

### Hors périmètre V1 (à noter mais ne pas coder)

- Multi-utilisateurs / social / partage
- Natation, mesures corporelles (le cardio est arrivé au lot 10, voir §12)
- Génération de programme par IA
- Import/export de programmes tiers

---

## 2. Stack technique

### Recommandation

```
Expo (React Native) + React Native Web
├── TypeScript
├── expo-router              → navigation file-based, identique web/natif
├── expo-sqlite              → base locale (natif + web via WASM/OPFS)
├── Drizzle ORM              → schéma + migrations typées sur SQLite
├── react-native-svg         → rendu du muscle map (marche en natif ET en web)
├── Zustand                  → état de la séance en cours
├── victory-native / Skia    → graphiques de progression
└── EAS Build                → builds iOS/Android, `expo export -p web` pour le web
```

**Pourquoi Expo plutôt que Next.js + Capacitor**
- Une codebase, un langage de composants, zéro duplication d'UI.
- `expo-router` donne des vraies URLs sur le web (`/session/12`) et une navigation native propre sur mobile.
- Le web sort en site statique → hébergeable sur n'importe quoi (Cloudflare Pages, S3+CDN, ton cluster RKE2 derrière un Ingress).

**Alternative si tu veux du 100 % web d'abord** : Next.js (App Router) + PWA installable + Dexie/IndexedDB. Plus rapide à démarrer, mais tu repayes l'UI le jour où tu veux du natif.

### Contrainte structurante : offline-first

En salle, le réseau est mauvais et l'app doit répondre instantanément entre deux séries. Donc :

> **La base locale SQLite est la source de vérité pendant la séance.** Le serveur n'est qu'une destination de synchronisation.

Pas de `fetch` dans le chemin critique de la saisie d'une série.

---

## 3. Modèle de données

Schéma SQLite (identique côté serveur en Postgres, aux types près).

```sql
-- ---------- Référentiel (lecture seule, livré avec l'app) ----------

CREATE TABLE muscle (
  id            TEXT PRIMARY KEY,        -- 'pectoralis_major', 'latissimus_dorsi'
  label_fr      TEXT NOT NULL,           -- 'Grand pectoral'
  region        TEXT NOT NULL,           -- chest|back|shoulders|arms|legs|core
  svg_front_id  TEXT,                    -- id du <path> dans body-front.svg
  svg_back_id   TEXT
);

CREATE TABLE exercise (
  id            TEXT PRIMARY KEY,        -- 'bench_press_barbell'
  label_fr      TEXT NOT NULL,           -- 'Développé couché barre'
  equipment     TEXT NOT NULL,           -- barbell|dumbbell|machine|cable|bodyweight
  mechanic      TEXT NOT NULL,           -- compound|isolation
  is_unilateral INTEGER NOT NULL DEFAULT 0,
  cues          TEXT,                    -- 2-3 points d'exécution
  is_custom     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE exercise_muscle (
  exercise_id   TEXT NOT NULL REFERENCES exercise(id),
  muscle_id     TEXT NOT NULL REFERENCES muscle(id),
  role          TEXT NOT NULL,           -- primary|secondary|stabilizer
  PRIMARY KEY (exercise_id, muscle_id)
);

-- ---------- Catalogue de séances (données utilisateur) ----------

CREATE TABLE routine (
  id            TEXT PRIMARY KEY,        -- uuid
  name          TEXT NOT NULL,           -- 'Push 1'
  color         TEXT,                    -- pastille de couleur dans la liste
  notes         TEXT,
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE routine_item (
  id            TEXT PRIMARY KEY,
  routine_id    TEXT NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  exercise_id   TEXT NOT NULL REFERENCES exercise(id),
  position      INTEGER NOT NULL,        -- ordre dans la séance
  target_sets   INTEGER NOT NULL DEFAULT 3,
  target_reps   TEXT,                    -- '8-10' (texte, c'est une fourchette)
  rest_seconds  INTEGER DEFAULT 120,
  superset_key  TEXT,                    -- même clé = superset
  notes         TEXT
);
CREATE INDEX idx_routine_item_routine ON routine_item(routine_id, position);

-- ---------- Historique (données utilisateur) ----------

CREATE TABLE session (
  id            TEXT PRIMARY KEY,
  routine_id    TEXT REFERENCES routine(id),  -- nullable : séance libre
  routine_name  TEXT NOT NULL,                -- figé : si tu renommes Push 1, l'historique ne bouge pas
  started_at    TEXT NOT NULL,
  ended_at      TEXT,                         -- NULL = séance en cours
  bodyweight_kg REAL,
  notes         TEXT
);

CREATE TABLE set_log (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  exercise_id   TEXT NOT NULL REFERENCES exercise(id),
  set_index     INTEGER NOT NULL,        -- 1, 2, 3…
  weight_kg     REAL NOT NULL,
  reps          INTEGER NOT NULL,
  rir           INTEGER,                 -- reps in reserve, optionnel
  set_type      TEXT NOT NULL DEFAULT 'working',  -- warmup|working|dropset|failure
  is_pr         INTEGER NOT NULL DEFAULT 0,       -- calculé à l'enregistrement
  logged_at     TEXT NOT NULL
);
CREATE INDEX idx_setlog_exercise ON set_log(exercise_id, logged_at DESC);
CREATE INDEX idx_setlog_session  ON set_log(session_id);
```

### Deux décisions à ne pas rater

1. **`session.routine_name` est dupliqué, volontairement.** L'historique doit être immuable. Si tu renommes ou supprimes « Push 1 », les 40 séances passées gardent leur nom.
2. **`set_log` n'a pas de FK vers `routine_item`.** En séance tu ajoutes/supprimes des exercices à la volée ; le log est attaché à l'exercice, pas au modèle. Le modèle n'est qu'une suggestion de départ.

### Types TypeScript dérivés

```ts
type SetLog = {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  setType: 'warmup' | 'working' | 'dropset' | 'failure';
  isPr: boolean;
  loggedAt: string;
};

// Ce que l'écran de séance affiche pour chaque exercice
type ExerciseInSession = {
  exercise: Exercise;
  targetSets: number;
  targetReps: string | null;
  lastTime: SetLog[] | null;   // les séries de la dernière fois → le "poids précédent"
  today: SetLog[];             // ce qui a été saisi aujourd'hui
};
```

---

## 4. Le muscle map (« petit bonhomme »)

### Principe

Deux SVG statiques, `body-front.svg` et `body-back.svg`, dessinés une bonne fois pour toutes. Chaque groupe musculaire est un `<path>` avec un `id` stable (`m-pectoralis-major`, `m-lats`, …). Ces ids correspondent à `muscle.svg_front_id` / `muscle.svg_back_id`.

Un seul composant, utilisé partout :

```tsx
// components/BodyMap.tsx
type Props = {
  highlights: Record<string, 'primary' | 'secondary' | 'stabilizer'>;
  view?: 'front' | 'back' | 'both';
  size?: number;
};
```

Le composant importe le SVG comme composant React (`react-native-svg` + `react-native-svg-transformer`) et applique un `fill` par id selon `highlights`. Même code sur mobile et web.

### Palette

| Rôle | Couleur | Usage |
|---|---|---|
| primary | rouge/orange saturé | muscle principal |
| secondary | orange atténué | muscle secondaire |
| stabilizer | jaune pâle | stabilisateur (masquable) |
| inactif | gris neutre | reste du corps |

### Trois usages du même composant

1. **Fiche exercice** — muscles de cet exercice.
2. **Aperçu de séance** — union des muscles de tous les exercices, intensité pondérée par le nombre de séries. Ça donne immédiatement « cette séance couvre-t-elle bien mon dos ? ».
3. **Vue hebdo** — chaleur des muscles travaillés sur les 7 derniers jours, à partir de `set_log`. Utile pour repérer un groupe négligé.

### Où trouver le SVG

Les silhouettes anatomiques prêtes à l'emploi existent en licence permissive (chercher « muscle body map SVG MIT »), sinon un template à découper dans Figma/Inkscape en ~24 chemins. **C'est le seul asset qui te coûtera du temps** — prévois une demi-journée, et fais-le en premier, tout le reste en dépend visuellement.

---

## 5. Navigation et écrans

```
/(tabs)
├── /                        Accueil — reprendre la séance en cours, ou lancer une séance
├── /routines                Catalogue de séances (liste de cartes)
│   ├── /routines/new        Création d'une séance
│   └── /routines/[id]       Édition : réordonner, ajouter/retirer des exercices
├── /exercises               Bibliothèque — recherche + filtres (muscle, matériel)
│   └── /exercises/[id]      Fiche : BodyMap, cues, historique perso, courbe
└── /history                 Séances passées + stats

/session/[id]                MODE SÉANCE (plein écran, hors tabs)
```

### Mode séance — le cœur de l'app

C'est l'écran sur lequel il faut passer 60 % du temps de dev. Il est utilisé debout, une main, avec des mains moites, entre deux séries.

**Layout** : liste verticale d'exercices, celui en cours déplié, les autres réduits.

Pour un exercice déplié, une ligne par série :

```
┌──────────────────────────────────────────────┐
│  Développé couché barre          [voir 🏋]  │
│  Dernière fois : 80 kg × 8,8,7   il y a 5 j  │
├──────────────────────────────────────────────┤
│  #  │ Précédent │  kg   │ reps │             │
│  1  │  80 × 8   │ [80]  │ [8]  │    ✓        │
│  2  │  80 × 8   │ [80]  │ [8]  │    ✓        │
│  3  │  80 × 7   │ [82.5]│ [ ]  │    ○        │
│                          + Ajouter une série │
└──────────────────────────────────────────────┘
```

**Règles d'interaction — c'est ici que se joue la qualité de l'app :**

- Les champs sont **pré-remplis** avec la performance de la dernière fois. Cas nominal : tu appuies sur ✓ sans rien saisir.
- Valider une série → **enregistrement immédiat en SQLite** + démarrage du chrono de repos. Pas de bouton « sauvegarder » global.
- Clavier numérique dédié, incréments ±2,5 kg / ±1 rep sur appui long, plutôt que le clavier système.
- La séance survit à un kill de l'app : `session.ended_at IS NULL` → l'accueil propose de reprendre.
- Chrono de repos : notification locale à la fin, même écran verrouillé (`expo-notifications`).
- PR détecté à la validation → petite animation, sans bloquer le flux.

---

## 6. Calculs de progression

Tout est dérivé de `set_log`, rien n'est stocké en double.

```ts
// 1RM estimé — formule d'Epley, fiable jusqu'à ~10 reps
const e1rm = (weightKg: number, reps: number) =>
  reps === 1 ? weightKg : weightKg * (1 + reps / 30);

// Tonnage d'une séance
const tonnage = (sets: SetLog[]) =>
  sets.filter(s => s.setType !== 'warmup')
      .reduce((acc, s) => acc + s.weightKg * s.reps, 0);
```

**Métriques par exercice** (sur la fiche exercice) :

| Métrique | Définition |
|---|---|
| Courbe de charge | meilleur e1RM par séance, dans le temps |
| PR poids | `MAX(weight_kg)` toutes séries confondues |
| PR volume | `MAX(weight_kg * reps)` sur une série |
| Meilleure série | la série au e1RM le plus élevé |
| Tendance | pente sur les 6 dernières séances : ↗ / → / ↘ |

**Détection de PR** (à la validation d'une série) :

```sql
SELECT MAX(weight_kg * (1 + reps / 30.0)) AS best_e1rm
FROM set_log
WHERE exercise_id = ? AND set_type <> 'warmup';
```
Si le e1RM de la nouvelle série dépasse `best_e1rm`, on écrit `is_pr = 1`.

**Vue hebdo** : séries travaillées par groupe musculaire sur 7 jours, en pondérant `primary` × 1 et `secondary` × 0,5. Repère de référence : 10–20 séries/semaine par groupe.

---

## 7. Synchronisation (V2, mais à prévoir dès maintenant)

V1 = local seul, une sauvegarde par export JSON. Mais anticiper le schéma évite une migration douloureuse.

**Le nécessaire dès la V1 :**
- Toutes les PK sont des **UUID v7** générés côté client (pas d'auto-increment) → pas de collision à la fusion.
- Chaque table utilisateur porte `updated_at` (ISO 8601 UTC) et `deleted_at` (soft delete).
- Une table `sync_queue` locale : `(entity, entity_id, op, payload, created_at)`.

**En V2** : Postgres derrière une API REST, un endpoint `POST /sync` qui prend le delta local depuis `last_sync_at` et renvoie le delta serveur. Résolution last-write-wins par ligne — largement suffisant pour un usage mono-utilisateur multi-appareils.

> Vu ton contexte : Postgres + une petite API Go/Fastify, packagée en Helm chart sur ton cluster RKE2. Ou Supabase si tu veux zéro ops sur ce projet.

---

## 8. Données de départ

Un fichier `seed/exercises.json` livré avec l'app, chargé au premier lancement.

```json
{
  "muscles": [
    { "id": "pectoralis_major", "label_fr": "Grand pectoral", "region": "chest",
      "svg_front_id": "m-pectoralis-major", "svg_back_id": null }
  ],
  "exercises": [
    {
      "id": "bench_press_barbell",
      "label_fr": "Développé couché barre",
      "equipment": "barbell",
      "mechanic": "compound",
      "cues": "Omoplates serrées, pieds ancrés, barre au bas des pecs.",
      "muscles": [
        { "id": "pectoralis_major", "role": "primary" },
        { "id": "triceps_brachii",  "role": "secondary" },
        { "id": "anterior_deltoid", "role": "secondary" }
      ]
    }
  ]
}
```

**Couverture minimale V1** : ~120 exercices suffisent (le noyau réellement utilisé en salle). Répartition indicative : pecs 12, dos 18, épaules 14, biceps 10, triceps 12, quadriceps 14, ischios 10, fessiers 8, mollets 6, abdos 10, avant-bras 6.

Le versionnage du seed compte : `seed_version` en table `meta`, et une migration idempotente qui ajoute les nouveaux exercices sans écraser les `is_custom = 1`.

---

## 9. Arborescence du repo

```
muscu-tracker/
├── app/                          # expo-router : les routes du §5
│   ├── (tabs)/
│   ├── session/[id].tsx
│   └── _layout.tsx
├── components/
│   ├── BodyMap/
│   │   ├── BodyMap.tsx
│   │   ├── body-front.svg
│   │   └── body-back.svg
│   ├── SetRow.tsx                # la ligne de série — composant le plus critique
│   ├── RestTimer.tsx
│   └── ProgressChart.tsx
├── db/
│   ├── schema.ts                 # Drizzle
│   ├── migrations/
│   ├── queries/                  # requêtes typées, une par cas d'usage
│   └── seed/exercises.json
├── lib/
│   ├── strength.ts               # e1RM, tonnage, PR
│   └── volume.ts                 # agrégation par muscle
├── stores/
│   └── activeSession.ts          # Zustand
└── app.json
```

---

## 10. Découpage en lots

| Lot | Contenu | Résultat |
|---|---|---|
| **0** | Init Expo + TS, SQLite + Drizzle, migrations | L'app démarre et crée sa base |
| **1** | Seed + bibliothèque d'exercices + recherche/filtres | Tu peux parcourir 120 exercices |
| **2** | `BodyMap` + fiche exercice | Le petit bonhomme s'allume |
| **3** | CRUD séances (Push 1, Pull 1, Legs 1…) | Ton catalogue existe |
| **4** | **Mode séance** + saisie + persistance | **L'app est utilisable en salle** |
| **5** | Chrono de repos + notifications | Confort réel |
| **6** | Historique, courbes, PR | La boucle de progression est fermée |
| **7** | Vue hebdo par muscle, export JSON | Vision d'ensemble |
| **8** | Build web + PWA installable | Web + mobile en prod |
| **9** | Sync serveur | Multi-appareils |
| **10** | Cardio, deuxième partie de la séance (§12) | Tapis, vélo, rameur… loggés avec la muscu |

**Le lot 4 est le seul indispensable.** Livre-le, utilise l'app 3 semaines à tes propres séances, puis décide de la suite — l'usage réel réordonnera la liste mieux que toi maintenant.

---

## 11. Pièges identifiés

- **Le clavier natif ruine le mode séance.** Pavé numérique custom, ou au minimum `inputMode="decimal"` + auto-focus enchaîné.
- **Ne pas recalculer les stats à l'affichage** sur 2 ans d'historique. Vue matérialisée par exercice, rafraîchie en fin de séance.
- **`react-native-svg` sur le web** demande `react-native-svg-transformer` configuré dans `metro.config.js` — à valider dès le lot 2, pas au lot 8.
- **Fuseaux horaires** : stocker en UTC ISO, afficher en local. Une séance à 23 h doit tomber le bon jour dans la vue hebdo.
- **Barres à vide** : la barre olympique fait 20 kg, une machine convergente affiche la plaque. Prévoir `exercise.bar_weight_kg` si tu veux du tonnage juste — sinon assume que le champ « poids » est ce qui est écrit sur la machine, et documente-le.

---

## 12. Cardio (lot 10)

### Principe

Une séance a **deux parties** : la musculation, puis le cardio. Le cardio n'est
pas un exercice de plus glissé entre deux exercices de force : il se fait d'une
traite, en fin de séance, sans séries ni repos. Une partie peut être vide — une
séance 100 % cardio est une vraie séance et compte pour l'objectif de la semaine.

### Modèle

Deux tables à part, pour que rien du calcul de force (tonnage, 1RM, PR, BodyMap)
n'ait à exclure le cardio :

- `cardio_activity` — référentiel seedé : `id`, `label_fr`, `setting`
  (`gym` | `outdoor`), `icon`, `pace` (`per_km` | `per_500m` | `speed` | NULL si
  pas de distance), `level_label` (« Inclinaison (%) », « Résistance »… ou NULL),
  `position`.
- `cardio_log` — une ligne par activité faite dans une séance : `session_id`,
  `activity_id`, `position`, `duration_sec` (obligatoire), `distance_m`,
  `calories`, `level` (facultatifs), plus `logged_at` / `updated_at` /
  `deleted_at` comme toute table utilisateur.

### Activités

En salle : tapis de course, vélo d'appartement, rameur, vélo elliptique,
stepper / escalier, SkiErg, corde à sauter. En extérieur : course à pied, vélo,
marche.

### Saisie

En mode séance, sous les exercices : « Ajouter du cardio » → choix de
l'activité → durée (min + s), distance si l'activité en a une (mètres pour le
rameur et le SkiErg, km sinon), calories et niveau facultatifs. La dernière
fois sur l'activité pré-remplit le formulaire, comme pour la muscu. L'allure
s'affiche au fil de la saisie : min/km, min/500 m ou km/h selon l'activité.

### Chrono

Le geste par défaut : choisir l'activité, régler la durée (30 min), la vitesse
(tapis, vélo d'appartement, elliptique) et l'inclinaison ou le niveau, puis
« Lancer ». Un compte à rebours tourne ; pause, +5 min, vitesse et inclinaison
ajustables en cours de route. À zéro, l'activité s'enregistre seule : durée,
distance déduite de la vitesse (segment par segment si elle a changé),
inclinaison. Une notification locale sonne à la fin, écran verrouillé.

Le chrono vit dans `meta` (clé `cardio_timer`) et se calcule depuis des heures
de départ, pas un décompte : il survit à un rechargement et reste juste après
une mise en veille. La saisie à la main reste disponible pour un cardio déjà
fait.

### Records

Par activité : plus longue durée, plus longue distance, meilleure allure (plus
grande vitesse moyenne). Un record se compare aux activités **antérieures** du
même type ; la toute première fois n'en est pas un. Calculés à la volée — une ou
deux lignes par séance, pas besoin de vue matérialisée.

### Hors lot 10

- Partie cardio prévue dans les modèles de séance (« Push 1 » + 20 min de vélo).
- Cardio d'échauffement, avant la muscu.
- Temps de cardio de la semaine sur l'accueil, fréquence cardiaque.

