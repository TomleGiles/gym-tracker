#!/usr/bin/env node
/**
 * body-front.svg / body-back.svg  →  components/BodyMap/paths.generated.ts
 *
 * Pourquoi ne pas importer les SVG directement via react-native-svg-transformer :
 * le transformer produit un composant opaque, on ne peut pas repeindre un <path>
 * par son id depuis l'extérieur — or c'est exactement ce que fait BodyMap.
 * On extrait donc la géométrie, et le composant construit les <Path> lui-même.
 * Bénéfice annexe : plus de config metro fragile à valider (§11 du spec).
 *
 *   node scripts/svg-to-paths.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'components', 'BodyMap');
const MIRROR = 'translate(240,0) scale(-1,1)';

const clean = (d) => d.replace(/\s+/g, ' ').trim();

function section(svg, id) {
  const open = new RegExp(`<g id="${id}"[^>]*>`);
  const m = open.exec(svg);
  if (!m) throw new Error(`groupe #${id} introuvable`);
  // Les groupes de premier niveau ne s'imbriquent que d'un cran, on compte donc
  // les <g> ouverts pour trouver le </g> correspondant.
  let i = m.index + m[0].length;
  let depth = 1;
  const tag = /<\/?g\b/g;
  tag.lastIndex = i;
  let t;
  while ((t = tag.exec(svg))) {
    depth += t[0] === '</g' ? -1 : 1;
    if (depth === 0) return svg.slice(i, t.index);
  }
  throw new Error(`groupe #${id} non refermé`);
}

/** Les <path d> d'un fragment, dans l'ordre, avec mirror:true pour les <use>. */
function pathsOf(fragment) {
  const byId = new Map();
  const out = [];
  const token = /<path\b[^>]*\/>|<use\b[^>]*\/>/g;
  let m;
  while ((m = token.exec(fragment))) {
    const el = m[0];
    if (el.startsWith('<path')) {
      const d = clean(/\bd="([^"]+)"/.exec(el)[1]);
      const id = /\bid="([^"]+)"/.exec(el)?.[1];
      if (id) byId.set(id, d);
      out.push({ d });
    } else {
      const ref = /\bhref="#([^"]+)"/.exec(el)[1];
      const d = byId.get(ref);
      if (!d) throw new Error(`<use href="#${ref}"> sans <path> correspondant`);
      const mirror = /\btransform="([^"]+)"/.exec(el)?.[1] === MIRROR;
      if (!mirror) throw new Error(`<use href="#${ref}"> avec un transform inattendu`);
      out.push({ d, mirror: true });
    }
  }
  return out;
}

function parse(view) {
  const svg = readFileSync(join(DIR, `body-${view}.svg`), 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)[1];
  const base = pathsOf(section(svg, 'base'));

  const musclesFragment = section(svg, 'muscles');
  const muscles = {};
  // Un muscle = soit <g id="m-x">…</g> (bilatéral), soit <path id="m-x"/> (impair).
  const entry = /<g id="(m-[a-z-]+)"[^>]*>([\s\S]*?)<\/g>|<path id="(m-[a-z-]+)"[^>]*\bd="([^"]+)"[^>]*\/>/g;
  let m;
  while ((m = entry.exec(musclesFragment))) {
    if (m[1]) muscles[m[1]] = pathsOf(m[2]);
    else muscles[m[3]] = [{ d: clean(m[4]) }];
  }

  const detail = pathsOf(section(svg, 'detail')).map((p) => p.d);
  return { viewBox, base, muscles, detail };
}

const front = parse('front');
const back = parse('back');

const banner = `// GÉNÉRÉ — ne pas éditer à la main.
// Source : components/BodyMap/body-front.svg, components/BodyMap/body-back.svg
// Régénérer : node scripts/svg-to-paths.mjs
`;

const body = `${banner}
export type BodyPath = { d: string; mirror?: boolean };

export type BodyGeometry = {
  viewBox: string;
  /** Silhouette neutre, dessinée sous les muscles. */
  base: BodyPath[];
  /** id de <path>/<g> → géométrie. Les ids sont ceux de muscle.svg_*_id. */
  muscles: Record<string, BodyPath[]>;
  /** Traits de détail (linea alba, rotules…), tracés par-dessus. */
  detail: string[];
};

/** Transform à appliquer aux chemins mirror. */
export const MIRROR_TRANSFORM = '${MIRROR}';

export const FRONT: BodyGeometry = ${JSON.stringify(front, null, 2)};

export const BACK: BodyGeometry = ${JSON.stringify(back, null, 2)};

/** Tous les ids de muscle présents dans au moins une vue — sert au test du seed. */
export const KNOWN_SVG_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(FRONT.muscles),
  ...Object.keys(BACK.muscles),
]);
`;

writeFileSync(join(DIR, 'paths.generated.ts'), body);
console.log(
  `paths.generated.ts écrit — face: ${Object.keys(front.muscles).length} muscles, dos: ${Object.keys(back.muscles).length}`,
);
