// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle ships its migrations as .sql files that Babel inlines (see babel.config.js).
config.resolver.sourceExts.push('sql');

// expo-sqlite on web is a WASM build of SQLite.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (needed by the OPFS VFS) is only exposed on cross-origin-isolated
// pages, so the dev server has to send these too — not just the production host.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
