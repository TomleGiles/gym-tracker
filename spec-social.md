# Muscu Tracker — Spécification du volet social

Suite de [`spec-muscu-tracker.md`](./spec-muscu-tracker.md). Ce document couvre
ce qui vient après les lots 0 à 8 : la synchronisation serveur (lot 9) et, par
dessus, un **cercle d'amis** — pas un réseau social public.

> L'idée en une phrase : tu ajoutes tes potes de salle, tu vois ce qu'ils font,
> vous vous échangez des séances, vous vous programmez des séances ensemble et
> vous pouvez suivre la séance de l'autre en direct.

---

## 1. Périmètre

### Ce que fait le volet social

| Bloc | Contenu |
|---|---|
| **Compte en ligne + sync** | Le compte local devient un compte serveur. Toutes les données utilisateur sont sauvegardées et synchronisées entre appareils. Récupération du mot de passe par e-mail. |
| **Amis** | Un pseudo unique (`@tom`). Ajout par lien d'invitation, QR code ou recherche par pseudo. Demande → acceptation. Retrait et blocage. |
| **Partage de séance** | Un modèle de séance devient un lien. Celui qui l'ouvre voit un aperçu et l'ajoute à son catalogue en un appui, même s'il n'est pas ton ami. |
| **Fil des amis** | Leurs dernières séances, records, régularité. Un « 💪 » pour encourager. « Faire cette séance » copie ce qu'un ami a fait. |
| **Séances programmées** | Une séance à plusieurs : date, heure, salle, modèle de séance. Les amis acceptent ou déclinent, rappel avant l'heure. |
| **Séance en direct** | Pendant une séance, tes amis voient tes séries s'afficher en temps réel sur leur app. |
| **Programmes publics** | Bibliothèque de séances publiées par les utilisateurs, avec recherche et tri par popularité. Plus tard : comptes créateurs vérifiés qu'on peut suivre. |

### Hors périmètre (à noter mais ne pas coder)

- **Fil public**, abonnés pour tout le monde, classements globaux : effet « réseau vide » au lancement et modération lourde.
- **Commentaires et messagerie** : modération. Le « 💪 » suffit au début ; on discute sur WhatsApp.
- **Photos et vidéos** : stockage, coût, modération.
- **Groupes nommés** (« Les gars du Basic-Fit ») : le cercle d'amis suffit tant qu'on n'a pas l'usage réel.
- **Influenceurs nommés sans leur accord** : voir §9.

### Principes non négociables

1. **Le social est optionnel.** L'app reste utilisable à 100 % sans compte en ligne, comme aujourd'hui. Le passage en ligne est proposé, jamais imposé.
2. **Offline-first, toujours.** La base locale reste la source de vérité de *tes* données. Aucun appel réseau dans le chemin critique de la saisie d'une série (§2 du spec principal). Le direct est « au mieux » : s'il n'y a pas de réseau, la séance se déroule normalement et rattrape plus tard.
3. **Privé par défaut sur ce qui est sensible.** Le poids de corps et les notes ne sont jamais partagés. Le reste est visible des amis seulement, réglable.
4. **Rien n'est public sans action explicite.** Seuls les programmes que tu publies volontairement sont visibles hors de ton cercle.

---

## 2. Stack serveur

```
Supabase (région UE — Francfort)
├── Auth                → e-mail + mot de passe, récupération par e-mail
├── Postgres            → miroir des tables utilisateur + tables sociales
├── Row Level Security  → « seuls mes amis voient mes séances », appliqué par la base
├── Realtime            → séance en direct (abonnement aux insertions de set_log)
├── Edge Functions      → envoi des notifications push, consommation des invitations
└── Storage             → avatars (plus tard)

Côté app
├── @supabase/supabase-js
├── @react-native-async-storage/async-storage → session Supabase sur natif (localStorage sur le web) ;
│                         pas expo-secure-store, limité à 2 Ko par valeur, trop peu pour une session
├── expo-notifications  → déjà présent ; jetons push Expo pour les invitations
└── react-native-qrcode-svg → affichage du QR (s'appuie sur react-native-svg, déjà présent)
```

**Pourquoi Supabase** : zéro ops, Postgres standard (pas d'enfermement : on peut
migrer vers un Postgres + API maison sur le cluster plus tard), RLS pour la
confidentialité, Realtime inclus pour le direct. Le `.env` contient déjà
`EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

**Domaine** : il faut un domaine (ex. `muscu.app`) pour les liens partageables
(`/i/…`, `/r/…`) et les universal links / app links. Le build web statique y est
hébergé ; les liens ouvrent l'app si elle est installée, sinon la version web.

---

## 3. Synchronisation (lot S0)

Le schéma local l'a préparée : UUID v7 côté client, `updated_at` / `deleted_at`
partout, et `sync_queue` déjà alimentée par toutes les mutations (`exercise`
custom, `routine`, `routine_item`, `session`, `session_exercise`, `set_log`).

### Côté serveur

Chaque table utilisateur existe en Postgres avec deux colonnes de plus :

```sql
owner_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
server_updated_at timestamptz NOT NULL DEFAULT now()  -- posé par trigger à chaque écriture
```

### Protocole

**Push** — après chaque fin de séance, à l'ouverture de l'app, et toutes les
~10 s pendant une séance en direct (§7) :

1. Lire `sync_queue` dans l'ordre, regrouper par `(entity, entity_id)` : seule la dernière opération compte.
2. Appeler une fonction Postgres `sync_push(changes jsonb)` (RLS appliquée, pas de `security definer`).
3. Côté serveur : **last-write-wins sur `updated_at` client** — une ligne n'est écrasée que si la version entrante est plus récente. Un `delete` est un soft delete (`deleted_at`).
4. Accusé de réception → supprimer les lignes de `sync_queue` concernées.

**Pull** — juste après le push :

1. `SELECT … WHERE owner_id = auth.uid() AND server_updated_at > :last_pull_at` pour chaque table.
2. Appliquer localement avec la même règle LWW, **sans** réalimenter `sync_queue`.
3. Ranger le nouveau curseur dans `meta.last_pull_at`.

Le curseur de pull est l'horloge **serveur** (`server_updated_at`) : une horloge
de téléphone décalée ne fait jamais rater de lignes. La résolution de conflit
reste sur l'horloge client, ce qui est suffisant pour un seul utilisateur sur
plusieurs appareils.

### Passage en ligne d'un compte local existant

Écran « Sauvegarder et retrouver mes amis » depuis le Profil :

1. Créer le compte Supabase (e-mail prérempli depuis le compte local, nouveau mot de passe).
2. Choisir un pseudo (§4).
3. Premier push : tout l'historique local part au serveur (la `sync_queue` contient déjà tout depuis le premier jour ; sinon, push complet des tables).
4. `user.remote_id` ← `auth.uid()`. Le hash de mot de passe local n'est plus utilisé.

Nouvel appareil : connexion → pull complet → l'app est identique.

### Hors sync

- Le référentiel (`muscle`, `exercise` non custom, `exercise_muscle`) : livré avec l'app.
- `exercise_stats` : recalculé localement après un pull.
- `meta` : local, sauf l'objectif hebdo qui part dans `profile.weekly_goal` (affiché aux amis).

---

## 4. Modèle de données social (Postgres)

```sql
-- ---------- Profil public ----------

CREATE TABLE profile (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle          text NOT NULL UNIQUE,      -- 'tom', minuscules, [a-z0-9_.]{3,20}
  display_name    text NOT NULL,
  avatar_url      text,
  bio             text,
  weekly_goal     int  NOT NULL DEFAULT 3,
  share_level     text NOT NULL DEFAULT 'full',  -- full|summary|none (§6)
  live_default    boolean NOT NULL DEFAULT true, -- mes amis peuvent suivre mes séances en direct
  is_verified     boolean NOT NULL DEFAULT false, -- comptes créateurs (lot S6)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- Amis ----------

-- Une ligne par paire. La demande va de requester vers addressee.
CREATE TABLE friendship (
  requester_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  addressee_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  status          text NOT NULL,             -- pending|accepted
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
-- Interdit la paire inverse (A→B et B→A en même temps).
CREATE UNIQUE INDEX friendship_pair ON friendship
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

CREATE TABLE block (
  blocker_id      uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  blocked_id      uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Lien / QR d'invitation. L'utiliser crée directement l'amitié (acceptée) :
-- le propriétaire a consenti en générant le lien, l'autre en l'ouvrant.
CREATE TABLE invite (
  token           text PRIMARY KEY,          -- 16 caractères aléatoires, url-safe
  owner_id        uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,      -- 7 jours
  max_uses        int,                       -- NULL = illimité jusqu'à expiration
  uses            int NOT NULL DEFAULT 0,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- Partage de séance ----------

-- Instantané immuable d'un modèle de séance. Modifier « Push 1 » ensuite ne
-- change pas ce qui a été partagé (même logique que session.routine_name).
CREATE TABLE shared_routine (
  id              uuid PRIMARY KEY,          -- UUID v7, sert dans l'URL /r/<id>
  owner_id        uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  source_routine_id uuid,                    -- routine d'origine, pour « mettre à jour le partage »
  name            text NOT NULL,
  description     text,
  payload         jsonb NOT NULL,            -- §4.1
  visibility      text NOT NULL DEFAULT 'link', -- link|friends|public
  tags            text[] NOT NULL DEFAULT '{}', -- lot S6 : objectif, niveau, jours/semaine
  copy_count      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ---------- Fil ----------

CREATE TABLE kudos (
  session_id      uuid NOT NULL,             -- session.id (table synchronisée)
  from_id         uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, from_id)
);

-- ---------- Séances programmées ----------

CREATE TABLE planned_workout (
  id              uuid PRIMARY KEY,
  host_id         uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  title           text NOT NULL,             -- 'Push du jeudi'
  routine_payload jsonb,                     -- même format que shared_routine.payload ; NULL = chacun sa séance
  starts_at       timestamptz NOT NULL,      -- UTC, affiché en local
  location        text,                      -- texte libre : 'Basic-Fit Bastille'
  notes           text,
  status          text NOT NULL DEFAULT 'scheduled', -- scheduled|cancelled
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE planned_participant (
  planned_id      uuid NOT NULL REFERENCES planned_workout(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'invited', -- invited|going|maybe|declined
  session_id      uuid,                      -- la séance réelle, une fois lancée
  responded_at    timestamptz,
  PRIMARY KEY (planned_id, user_id)
);

-- ---------- Notifications push ----------

CREATE TABLE push_token (
  token           text PRIMARY KEY,          -- jeton Expo
  user_id         uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  platform        text NOT NULL,             -- ios|android
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- Programmes publics (lot S6) ----------

-- Suivre un compte, de façon asymétrique : uniquement les comptes vérifiés.
CREATE TABLE follow (
  follower_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  followee_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE report (
  id              uuid PRIMARY KEY,
  reporter_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  target_kind     text NOT NULL,             -- profile|shared_routine
  target_id       uuid NOT NULL,
  reason          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
```

Sur les tables synchronisées, une colonne de plus :

```sql
ALTER TABLE session ADD COLUMN visibility text NOT NULL DEFAULT 'friends'; -- friends|private
ALTER TABLE session ADD COLUMN planned_id uuid;                            -- séance programmée d'origine
```

### 4.1 Format d'un modèle de séance partagé (`payload`)

```ts
type RoutinePayload = {
  version: 1;
  items: {
    exerciseId: string;          // id du référentiel ('bench_press_barbell') ou uuid d'un exercice custom
    position: number;
    targetSets: number;
    targetReps: string | null;
    restSeconds: number | null;
    supersetKey: string | null;
    notes: string | null;
  }[];
  // Les exercices custom voyagent avec la séance : sans ça, l'ami ne peut pas
  // l'importer. Les exercices du référentiel n'y sont pas, sauf leur libellé
  // de secours pour une app plus ancienne qui ne les connaîtrait pas encore.
  customExercises: { id: string; labelFr: string; equipment: Equipment; mechanic: Mechanic;
                     muscles: { muscleId: string; role: MuscleRole }[] }[];
  fallbackLabels: Record<string, string>;
};
```

**Import** : nouvelle `routine` locale avec de nouveaux UUID v7, en passant par
`db/queries/routines.ts` (donc `sync_queue` alimentée). Un exercice custom déjà
importé (même id) n'est pas dupliqué. `copy_count` est incrémenté par une
fonction Postgres.

### 4.2 Côté local (SQLite), ce qui change

| Changement | Pourquoi |
|---|---|
| `user.remote_id`, `user.handle` | lien avec le compte serveur |
| `session.visibility`, `session.planned_id` | mêmes colonnes que côté serveur, synchronisées |
| `meta.last_pull_at` | curseur de sync |
| Table `social_cache` `(key TEXT PK, payload TEXT, fetched_at TEXT)` | dernier fil, liste d'amis, séances programmées : l'onglet Amis s'affiche hors ligne avec la dernière version connue |

Les données des amis **ne sont pas** copiées dans les tables `session` /
`set_log` locales : elles restent dans le cache, en lecture seule. Les stats, la
vue hebdo et les records ne mélangent jamais tes séances et les leurs.

---

## 5. Règles d'accès (RLS)

C'est le point le plus sensible du document : **une erreur ici = une fuite de
données**. Chaque politique a son test (§10, piège 1).

Une fonction d'aide :

```sql
CREATE FUNCTION are_friends(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM friendship
    WHERE status = 'accepted'
      AND least(requester_id, addressee_id) = least(a, b)
      AND greatest(requester_id, addressee_id) = greatest(a, b)
  ) AND NOT EXISTS (
    SELECT 1 FROM block WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;
```

| Table | Lecture | Écriture |
|---|---|---|
| `routine`, `routine_item`, `exercise` custom | propriétaire | propriétaire |
| `session` | propriétaire ; amis si `visibility = 'friends'` et `share_level <> 'none'` | propriétaire |
| `session_exercise`, `set_log` | propriétaire ; amis si la séance parente est visible **et** `share_level = 'full'` | propriétaire |
| `profile` | tout utilisateur connecté (pseudo, nom, avatar — pour la recherche) ; stats réservées aux amis via une vue | soi-même |
| `friendship` | les deux membres | création : soi comme `requester` ; acceptation : soi comme `addressee` ; suppression : l'un ou l'autre |
| `invite` | propriétaire ; la consommation passe par une Edge Function | propriétaire |
| `shared_routine` | `link` : quiconque a l'id ; `friends` : amis ; `public` : tous | propriétaire |
| `planned_workout`, `planned_participant` | hôte et participants | hôte ; un participant ne modifie que sa propre réponse |
| `kudos` | qui peut voir la séance | soi comme `from_id`, sur une séance visible |

Jamais exposés, quelle que soit la règle : `session.bodyweight_kg`,
`session.notes`, `set_log` d'une séance `private`. Les amis lisent les séances
au travers d'une **vue** `friend_session` qui ne sélectionne pas ces colonnes,
plutôt que de compter sur l'UI pour les masquer.

---

## 6. Confidentialité

Réglages dans le Profil :

| Réglage | Valeurs | Défaut |
|---|---|---|
| Ce que mes amis voient | Tout (séries détaillées) · Résumé (nom de séance, durée, tonnage, records) · Rien | Tout |
| Direct | Mes amis peuvent suivre mes séances en cours · Non | Oui |
| Par séance | Bouton « Séance privée » au démarrage ou dans le bilan | Visible des amis |

- Le **poids de corps** est une donnée de santé (RGPD, art. 9) : il ne quitte jamais le cercle « moi ». Il est synchronisé pour le multi-appareils, jamais exposé aux amis.
- **Suppression du compte** : supprime toutes les données serveur (cascade sur `auth.users`). Les données locales restent sur l'appareil, l'app repasse en mode local.
- **Âge** : en France, consentement seul à partir de 15 ans. Case « J'ai 15 ans ou plus » à l'inscription en ligne.
- **Retirer un ami** : il ne voit plus rien immédiatement (RLS), sans notification. **Bloquer** : il ne peut plus te trouver ni t'envoyer de demande.

---

## 7. Écrans et parcours

### Navigation

Cinq onglets maximum. Proposition (à valider) :

```
/(tabs)
├── /                  Accueil — inchangé, + carte « Séance prévue » si une séance programmée approche
├── /routines          Séances — l'onglet Exercices y passe en segment « Modèles | Exercices »
├── /friends           NOUVEL ONGLET « Amis » — fil + séances programmées
├── /history           Progrès — inchangé
└── /profile           Profil — + réglages de confidentialité, passage en ligne
```

### Routes

```
/friends                     Fil (séances des amis, records, régularité) + « À venir »
/friends/add                 Ajouter : mon QR, partager mon lien, rechercher un pseudo
/friends/list                Mes amis, demandes reçues/envoyées, bloqués
/u/[handle]                  Profil d'un ami : régularité, records, dernières séances
/i/[token]                   Ouverture d'une invitation → « Ajouter Tom en ami ? »
/r/[id]                      Séance partagée : aperçu (exercices + petit bonhomme) → « Ajouter à mes séances »
/plan/new                    Programmer une séance : modèle, date, salle, amis invités
/plan/[id]                   Détail : participants et réponses, « Lancer la séance »
/live/[sessionId]            Suivre la séance d'un ami en direct
/discover                    (lot S6) Programmes publics, recherche, créateurs
/online                      Passage en ligne du compte local (§3)
```

### Ajouter un ami

```
┌──────────────────────────────────┐
│          Ajouter un ami          │
│                                  │
│        ┌──────────────┐          │
│        │   ▓▓  ▓▓ ▓   │          │
│        │   QR CODE    │          │  ← encode https://muscu.app/i/<token>
│        │   ▓ ▓▓  ▓▓   │          │
│        └──────────────┘          │
│             @tom                 │
│                                  │
│  [ Partager mon lien ]           │  ← feuille de partage native (WhatsApp, SMS…)
│                                  │
│  ── ou ──                        │
│  🔍 Rechercher un pseudo         │
└──────────────────────────────────┘
```

- **Pas besoin de scanner dans l'app** : l'ami ouvre l'appareil photo de son téléphone, qui reconnaît le lien et ouvre l'app (ou le site). Un scanner intégré (`expo-camera`) peut venir plus tard.
- Lien et QR = **amitié immédiate**. Recherche par pseudo = **demande** à accepter.
- Le lien expire au bout de 7 jours ; « Nouveau lien » révoque l'ancien.
- Ouverture d'un lien **sans être connecté** : aperçu (« Tom t'invite sur Muscu Tracker »), puis inscription, puis l'amitié est créée automatiquement.

### Fil des amis

Une carte par séance terminée, la plus récente en haut :

```
┌──────────────────────────────────────────────┐
│ (T) Tom · Push 1                il y a 2 h   │
│ 1 h 12 · 18 séries · 7 420 kg                │
│ 🏆 Développé couché  92,5 kg × 5  (+2,5)     │
│                                              │
│ 💪 3      [ Voir la séance ]  [ La faire ]   │
└──────────────────────────────────────────────┘
```

- Autres types de cartes : « Lina a atteint son objectif de la semaine (4/4) », « Max : 10 semaines d'affilée ».
- **« La faire »** crée un modèle local à partir de la composition de sa séance (`session_exercise`), avec ses charges en note.
- En haut du fil : **« En séance maintenant »**, la liste des amis en direct, un appui pour suivre.
- Pull-to-refresh. Hors ligne : la dernière version en cache, avec la date de mise à jour.

### Partager une séance

- Depuis `/routines/[id]` : bouton **Partager** → crée le `shared_routine` → feuille de partage native avec le lien `https://muscu.app/r/<id>`.
- Le lien fonctionne pour **n'importe qui** (`visibility = 'link'`). Sur le web, sans l'app : aperçu lisible + « Ouvrir dans l'app / Utiliser sur le web ».
- **Carte de bilan en image** (sans serveur, faisable avant tout le reste) : depuis `/session/recap/[id]`, « Partager » génère une image (records, durée, tonnage, BodyMap des muscles travaillés) pour les stories ou WhatsApp. `react-native-view-shot` en natif ; sur le web, rendu SVG → canvas.

### Séance programmée

1. `/plan/new` : choisir un modèle (ou « chacun sa séance »), date/heure, salle (texte libre), amis invités.
2. Les invités reçoivent une **notification push** et voient la séance dans « À venir » ; ils répondent *J'y vais / Peut-être / Non*.
3. En répondant « J'y vais », l'app programme une **notification locale** 1 h avant (pas besoin du serveur pour le rappel).
4. Le jour venu, « Lancer la séance » démarre une séance locale normale à partir du modèle (`session.planned_id` renseigné). Le modèle partagé est importé à la volée s'il n'existe pas dans le catalogue.
5. Pendant la séance, une barre en haut montre les autres participants (« Max : 3/5 exercices ») et un appui ouvre son direct.

### Séance en direct

```
┌──────────────────────────────────────────────┐
│ ● EN DIRECT   Tom · Pull 1        42 min     │
├──────────────────────────────────────────────┤
│ Tractions               ✓ ✓ ✓                │
│   BW × 10 · BW × 9 · BW × 8                  │
│ Rowing barre            ✓ ✓ ○                │  ← la nouvelle série apparaît en direct
│   70 × 10 · 72,5 × 8 🏆                      │
│ Curl incliné            ○ ○ ○                │
├──────────────────────────────────────────────┤
│ Repos en cours · 1:24                        │
│                               [ 💪 ]         │
└──────────────────────────────────────────────┘
```

**Mécanisme** : pas de canal séparé. Pendant une séance en direct, la sync pousse
plus souvent (après chaque série, regroupée sur ~10 s, si le réseau est là). Le
spectateur charge l'état de la séance, puis s'abonne en Realtime aux insertions
et mises à jour de `set_log` filtrées sur `session_id`. La RLS s'applique au flux
Realtime : un non-ami ne reçoit rien.

- **Jamais bloquant** : la validation d'une série écrit en SQLite et démarre le chrono comme aujourd'hui ; le push est déclenché après, sans être attendu.
- Pas de réseau → le spectateur voit « Dernière mise à jour il y a 6 min » ; tout arrive d'un coup au retour du réseau.
- Le repos en cours s'affiche grâce à `logged_at` de la dernière série + `rest_seconds` : rien de plus à envoyer.
- Une séance est « en direct » si `ended_at IS NULL`, que le propriétaire a `live_default = true` et que la séance n'est pas privée.

---

## 8. Notifications

| Événement | Canal | Destinataire |
|---|---|---|
| Demande d'ami reçue / acceptée | push (Edge Function) | l'autre |
| Invitation à une séance programmée | push | invités |
| Rappel 1 h avant une séance programmée | **locale** | chaque participant « J'y vais » |
| Un ami commence une séance programmée avec toi | push | autres participants |
| 💪 reçu | aucune notification au début — visible dans le fil | — |

- Les push passent par le service Expo (`exp.host`), appelé depuis une Edge Function déclenchée par un webhook de base (insertion dans `friendship`, `planned_participant`).
- **Web** : pas de push Expo. La PWA affiche les notifications dans l'app à l'ouverture. Le Web Push (y compris iOS ≥ 16.4 en PWA installée) peut venir plus tard.
- Un réglage par type dans le Profil. Jamais plus d'une notification sociale par heure et par ami.

---

## 9. Programmes publics et créateurs (lot S6)

**Pourquoi pas « les séances de tel influenceur » dès le départ** :

- **Juridique** : utiliser le nom ou l'image d'une personne connue sans accord, c'est du droit à l'image et du parasitisme. Pas de « Programme de [nom] » sans contrat.
- **Réseau vide** : les créateurs ne viennent pas sur une app sans utilisateurs.

**À la place, en deux temps :**

1. **Bibliothèque publique.** N'importe qui publie un `shared_routine` en `public`, avec des tags (objectif : force / masse / remise en forme ; niveau ; jours par semaine ; matériel). Recherche, tri par nombre de copies, BodyMap agrégé du programme. Amorcée par des programmes classiques et libres de droits (5×5, PPL, Upper/Lower, full body 3 j) publiés par un compte « Muscu Tracker ».
2. **Comptes créateurs vérifiés.** Quand des créateurs veulent venir : `profile.is_verified`, page publique, bouton **Suivre** (table `follow`, asymétrique, réservée aux comptes vérifiés). Leurs séances publiques apparaissent dans un onglet « Créateurs » de `/discover`, jamais mélangées au fil des amis.

Un « programme » sur plusieurs séances (PPL = 3 modèles) se modélise comme un
`shared_routine` dont le `payload` contient plusieurs séances (`version: 2`), à
spécifier au moment du lot S6.

**Modération minimale**, obligatoire dès qu'il y a du contenu public : bouton
« Signaler » (table `report`), masquage par un admin depuis le dashboard
Supabase, filtrage des mots interdits dans les noms publics.

---

## 10. Découpage en lots

| Lot | Contenu | Résultat |
|---|---|---|
| **S0** | Supabase (projet, tables, RLS des tables synchronisées), compte en ligne, passage en ligne du compte local, sync push/pull | Tes données sont sauvegardées, l'app marche sur deux appareils |
| **S1** | `profile` + pseudo, amis : lien, QR, recherche, demandes, retrait, blocage, universal links | Tu as un cercle d'amis |
| **S2** | Partage de séance par lien + import, carte de bilan en image | Vous vous échangez des séances |
| **S3** | Fil des amis, profil d'un ami, 💪, « La faire », réglages de confidentialité | Tu vois ce que font tes potes |
| **S4** | Séances programmées, réponses, jetons push + Edge Function, rappel local | Vous vous donnez rendez-vous à la salle |
| **S5** | Séance en direct (sync accélérée + Realtime), « En séance maintenant », barre des participants | Tu suis la séance d'un pote en direct |
| **S6** | Bibliothèque publique, tags, recherche, signalement ; puis comptes créateurs et suivi | On trouve des programmes au-delà de son cercle |

**La carte de bilan en image (S2) ne dépend de rien** : elle peut sortir avant
S0 pour tester l'appétit pour le partage.

**S0 et S1 sont le socle.** Après S3, utiliser le fil quelques semaines avec de
vrais amis avant d'attaquer S4–S5 : c'est l'usage qui dira si les séances
programmées ou le direct comptent le plus.

---

## 11. Pièges identifiés

1. **Une politique RLS mal écrite = une fuite.** Une suite de tests SQL (pgTAP ou scripts `supabase test db`) qui vérifie, pour chaque table : un inconnu ne voit rien, un ami voit ce qu'il doit voir, une séance privée et le poids de corps restent cachés, un compte bloqué ne voit plus rien. À écrire **avant** l'UI du fil.
2. **Ne jamais faire confiance à l'UI pour masquer.** Les colonnes sensibles sont exclues par les vues serveur, pas cachées à l'affichage.
3. **Universal links / app links** : il faut servir `apple-app-site-association` et `assetlinks.json` sur le domaine, et déclarer les `associatedDomains` / `intentFilters` dans `app.json`. Le scheme `muscutracker://` existe déjà en secours.
4. **Le web et la session Supabase** : le jeton vit dans `localStorage`, et les en-têtes COOP/COEP du build web (README) ne doivent pas bloquer les appels à Supabase. À vérifier dès S0 (`credentialless` laisse passer les requêtes CORS).
5. **Versions d'app différentes** : un ami sur une version plus ancienne ne connaît pas forcément un nouvel exercice du référentiel → `fallbackLabels` dans le payload, et affichage « Exercice inconnu » plutôt qu'un crash.
6. **Fuseaux horaires** des séances programmées : `starts_at` en UTC, affichage local. Deux amis dans des fuseaux différents voient chacun leur heure.
7. **Realtime et batterie** : s'abonner seulement quand l'écran du direct est ouvert, se désabonner en quittant. Pas d'abonnement global en arrière-plan.
8. **Offre gratuite Supabase** : le projet se met en pause après une semaine sans activité, et le nombre de connexions Realtime simultanées est limité. Suffisant pour un cercle d'amis ; prévoir l'offre payante avant toute ouverture publique (S6).
9. **Le premier push après passage en ligne** peut être gros (des mois d'historique) : envoyer par paquets de quelques centaines de lignes, reprenable en cas de coupure.
10. **Suppression côté ami** : quand un ami supprime une séance (soft delete) ou retire l'amitié, vider les entrées correspondantes de `social_cache` au prochain rafraîchissement.
