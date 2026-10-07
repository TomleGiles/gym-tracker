# Muscu Tracker

App de suivi d'entraînement en salle : Expo (React Native + web), expo-router,
SQLite local via Drizzle. Une seule codebase pour iOS, Android et le web.

## Specs — à lire avant toute fonctionnalité

- [`spec-muscu-tracker.md`](./spec-muscu-tracker.md) — spec principal : modèle de données, mode séance, calculs, lots 0 à 9. Les lots 0 à 8 sont faits.
- [`spec-social.md`](./spec-social.md) — volet social : compte en ligne et sync (Supabase), amis (lien, QR, pseudo), partage de séances, fil, séances programmées, direct, programmes publics. Lots S0 à S6.
- [`README.md`](./README.md) — état réel de l'implémentation, écarts par rapport au spec et pourquoi, limites connues.

En cas de contradiction, le README décrit ce qui existe, les specs ce qui est visé.

## Règles du projet

- **Offline-first** : SQLite est la source de vérité. Aucun appel réseau dans le chemin critique de la saisie d'une série.
- **Toutes les écritures passent par `db/queries/`**, qui incrémente la révision (`bumpRevision`) et alimente `sync_queue` via `queueOp`. Pas d'écriture Drizzle directe depuis un écran.
- **PK en UUID v7** générés côté client (`lib/id.ts`), `updated_at` / `deleted_at` sur chaque table utilisateur, suppression = soft delete.
- **Textes** : importer `Text` / `TextInput` depuis `components/Text.tsx`, jamais depuis `react-native`.
- **Thème** : couleurs et typo dans `lib/theme.ts`, composants de base dans `components/ui.tsx`.
- **Schéma** : modifier `db/schema.ts`, puis `npm run db:generate` ; ne pas écrire les migrations à la main.
- **Ne pas éditer** `components/BodyMap/paths.generated.ts` : `npm run bodymap:build`.
- L'interface et les commentaires sont en français.

## Commandes

```bash
npm install          # applique aussi le correctif expo-sqlite (scripts/patch-expo-sqlite.mjs)
npm run web          # dev server web
npm run typecheck    # tsc --noEmit, à faire passer avant de rendre la main
npm run build:web    # build statique dans dist/
```

Le build web exige les en-têtes `Cross-Origin-Opener-Policy: same-origin` et
`Cross-Origin-Embedder-Policy: credentialless` (SQLite WASM), voir le README.
