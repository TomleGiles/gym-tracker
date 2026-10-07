import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Enveloppe HTML du build web (rendu statique uniquement — pas de hooks ici).
 * C'est le seul endroit où l'on peut poser le manifeste PWA et enregistrer le
 * service worker qui rend l'app démarrable sans réseau.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>Trakr — Chaque série compte</title>
        <meta name="description" content="Tes séances, tes records, ta progression. Ton suivi d'entraînement personnel, même hors ligne." />
        <meta name="theme-color" content="#0B0E11" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Trakr" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* Sans ça, seul le <body> défile et les listes internes se comportent mal. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BASE_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const BASE_STYLE = `
  html, body { background-color: #0B0E11; }
  body { overscroll-behavior-y: none; }
  /* En salle, une sélection de texte déclenchée par un appui maintenu est
     toujours une fausse manœuvre — sauf dans les champs de saisie. */
  * { -webkit-tap-highlight-color: transparent; }
  body, #root { user-select: none; -webkit-user-select: none; }
  input, textarea { user-select: text; -webkit-user-select: text; }
`;

const REGISTER_SW = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        /* Pas de service worker : l'app fonctionne, elle exige juste le réseau au démarrage. */
      });
    });
  }
`;
