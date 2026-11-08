// RAREZA HUNTER: estadistica transparente. Nada de puntuaciones aleatorias ni probabilidades multiplicadas.
//  - Frecuencia conjunta: coincidencias / semillas examinadas, con intervalo de Wilson (95 %).
//  - Frecuencias marginales por condicion: se miden en una submuestra de calibracion (todas las condiciones evaluadas).
//  - Cero coincidencias: solo se ofrece un limite superior (exacto binomial, unilateral), nunca una frecuencia inventada.
import { CI_Z, DEFAULT_RARITY_TIERS } from './configuration.js';
import { fmtInt, fmtNum } from './utilities.js';
import { LEAF_TYPES } from './search-engine.js';
import { biomeName } from './biome-engine.js';
import { structById } from './structure-engine.js';

/** Intervalo de Wilson para una proporcion k/n. */
export function wilson(k, n, z = CI_Z) {
  if (n <= 0) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den, hw = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { p, lo: Math.max(0, c - hw), hi: Math.min(1, c + hw) };
}
/** Limite superior unilateral exacto para la proporcion cuando se observan 0 coincidencias en n: 1 - (1-conf)^(1/n). */
export function upperBoundZero(n, conf = 0.95) { return n > 0 ? 1 - Math.pow(1 - conf, 1 / n) : NaN; }

export const oneIn = (p) => (p > 0 ? 1 / p : Infinity);
export function formatPercent(p) {
  if (!Number.isFinite(p)) return '—';
  const pct = p * 100;
  if (pct === 0) return '0 %';
  if (pct >= 0.01) return fmtNum(pct, 4) + ' %';
  return pct.toExponential(2).replace('e', ' × 10^').replace('.', ',') + ' %';
}
export function formatOneIn(p) { const x = oneIn(p); return Number.isFinite(x) ? `1 entre ${x < 10 ? fmtNum(x, 1) : fmtInt(x)}` : '—'; }

export function classify(p, tiers = DEFAULT_RARITY_TIERS) {
  if (!Number.isFinite(p)) return null;
  const sorted = [...tiers].sort((a, b) => b.minP - a.minP);
  return sorted.find((t) => p >= t.minP) || sorted[sorted.length - 1];
}

export function domainInfo(domain) {
  if (!domain) return { kind: 'desconocido', generalizable: false, text: 'Dominio no definido.' };
  if (domain.kind === 'random') return { kind: 'aleatorio', generalizable: true, text: 'Muestreo aleatorio uniforme de semillas de 64 bits: la frecuencia estima el universo completo de semillas (con incertidumbre).' };
  if (domain.kind === 'range') return { kind: 'intervalo', generalizable: false, text: `Intervalo secuencial [${domain.start}, ${domain.end}]: la frecuencia describe solo ese intervalo, no necesariamente todas las semillas.` };
  return { kind: 'lista', generalizable: false, text: 'Lista manual de semillas: no es un muestreo; la frecuencia solo describe esa lista.' };
}

/** Resumen estadistico de una proporcion para mostrarlo. */
export function proportionSummary(k, n) {
  if (n === 0) return { n, k, none: true };
  if (k === 0) { const ub = upperBoundZero(n); return { n, k, zero: true, upper: ub, upperOneIn: oneIn(ub) }; }
  const w = wilson(k, n);
  return { n, k, p: w.p, lo: w.lo, hi: w.hi, oneIn: oneIn(w.p), oneInLo: oneIn(w.hi), oneInHi: oneIn(w.lo) };
}

/** Fraccion de la muestra de calibracion igual o mas extrema que el valor de la semilla. better: 'low' | 'high'. */
export function percentile(samples, value, better) {
  if (!samples || samples.length < 30 || value === null || value === undefined) return { insufficient: true, n: samples?.length || 0 };
  let c = 0;
  for (const s of samples) if (better === 'low' ? s <= value : s >= value) c++;
  const w = wilson(c, samples.length);
  return { n: samples.length, count: c, frac: c / samples.length, lo: w.lo, hi: w.hi, zero: c === 0 };
}

/** Texto legible de una hoja de reglas (para explicaciones y fichas). */
export function describeLeaf(l) {
  const c = l.center === 'origin' ? 'del origen (0,0)' : 'del spawn estimado';
  switch (l.cond) {
    case 'spawnBiome': return `Spawn en ${(l.biomes || []).map(biomeName).join(' / ')}`;
    case 'biomeArea': return `${l.match === 'all' ? 'Todos los biomas' : 'Algún bioma'} de [${(l.biomes || []).map(biomeName).join(', ')}] a ≤ ${fmtInt(l.radius)} bloques ${c}${l.minPct ? ` (≥ ${l.minPct} % del área)` : ''}`;
    case 'biomeDiversity': return `≥ ${l.minDistinct} biomas distintos en ${fmtInt(l.radius)} bloques ${c}`;
    case 'structure': return `${l.minCount ?? 1}${l.maxCount != null ? '–' + l.maxCount : '+'} × ${structById(l.struct)?.label ?? l.struct} a ${l.minDist ? fmtInt(l.minDist) + '–' : '≤ '}${fmtInt(l.radius)} bloques ${c}`;
    case 'stronghold': return `≥ ${l.minCount ?? 1} fortaleza(s) a ≤ ${fmtInt(l.radius)} bloques ${c}`;
    case 'structureNear': return `${structById(l.typeA)?.label} y ${structById(l.typeB)?.label} a ≤ ${fmtInt(l.maxDist)} bloques entre sí (la primera a ≤ ${fmtInt(l.radius)} ${c})`;
    default: return l.cond;
  }
}

/** Resume el estado de la busqueda para las fichas: { examined, matches, domain, calib: {n, leaves:{id:{pass,metrics}}} }. */
export function buildCards(matches, search, leavesMeta, tiers = DEFAULT_RARITY_TIERS) {
  const joint = proportionSummary(search.matches, search.examined);
  const dom = domainInfo(search.domain);
  const tier = joint.p !== undefined ? classify(joint.p, tiers) : null;
  const marg = {};
  for (const l of leavesMeta) {
    const st = search.calib.leaves[l.id];
    marg[l.id] = st ? proportionSummary(st.pass, search.calib.n) : { none: true, n: 0, k: 0 };
  }
  return matches.map((m) => {
    const perLeaf = leavesMeta.map((l) => {
      const r = m.leaves[l.id], better = LEAF_TYPES[l.cond].better;
      const pct = r && better ? percentile(search.calib.leaves[l.id]?.metrics, r.metric, better) : null;
      return { leaf: l, text: describeLeaf(l), result: r, marginal: marg[l.id], percentile: pct };
    });
    const fracs = perLeaf.map((x) => x.percentile).filter((p) => p && !p.insufficient).map((p) => p.frac);
    const rarest = fracs.length ? Math.min(...fracs) : null; // la condicion individual mas extrema; NO es un producto
    return { seed: m.seed, joint, tier, domain: dom, perLeaf, rarestSingle: rarest, explanation: explain(m, perLeaf, joint, dom, tier) };
  });
}

const search_calibN = (perLeaf) => perLeaf.reduce((n, x) => Math.max(n, x.marginal?.n || 0), 0);
function explain(m, perLeaf, joint, dom, tier) {
  const lines = [];
  if (joint.none) lines.push('Aún no hay semillas examinadas.');
  else if (joint.zero) lines.push('No se han observado coincidencias (esto no debería ocurrir en una ficha).');
  else {
    lines.push(`En ${fmtInt(joint.n)} semillas examinadas, ${fmtInt(joint.k)} cumplen TODA la combinación: frecuencia ${formatPercent(joint.p)} (${formatOneIn(joint.p)}), IC 95 % de ${formatOneIn(joint.hi)} a ${formatOneIn(joint.lo)}.`);
    if (tier) lines.push(`Clasificación según los umbrales configurados: ${tier.label}.`);
  }
  lines.push(dom.text);
  const ranked = perLeaf.filter((x) => x.marginal && !x.marginal.none).sort((a, b) => (a.marginal.p ?? 0) - (b.marginal.p ?? 0));
  if (ranked.length) {
    const top = ranked.slice(0, 3).map((x) => `«${x.text}» (${x.marginal.zero ? `0 de ${fmtInt(x.marginal.n)} en la muestra; límite superior ${formatPercent(x.marginal.upper)}` : `${formatPercent(x.marginal.p)}, IC 95 % ${formatPercent(x.marginal.lo)}–${formatPercent(x.marginal.hi)}`})`);
    lines.push(`Condiciones individualmente más raras (medidas en una submuestra de calibración): ${top.join('; ')}.`);
  }
  if (search_calibN(perLeaf) < 200) lines.push(`Aviso: la submuestra de calibración es pequeña (${fmtInt(search_calibN(perLeaf))} semillas); las frecuencias individuales son orientativas (mira su intervalo). Aumenta el número de semillas o reduce «cada N» en Búsqueda.`);
  lines.push('Las frecuencias individuales NO se multiplican: las características de Minecraft están correlacionadas; la frecuencia de la combinación es la observada conjuntamente.');
  return lines;
}

/** Hunter global: rankings sobre los resultados actuales (solo memoria). */
export function hunterGlobal(cards) {
  const byRare = [...cards].filter((c) => c.rarestSingle !== null).sort((a, b) => a.rarestSingle - b.rarestSingle);
  const pick = (cond, key, dir) => {
    let best = null;
    for (const c of cards) for (const x of c.perLeaf) {
      if (x.leaf.cond !== cond || !x.result || !Number.isFinite(x.result.metric)) continue;
      const v = x.result.metric;
      if (!best || (dir === 'low' ? v < best.v : v > best.v)) best = { c, x, v };
    }
    return best;
  };
  return {
    rarestCombination: byRare[0] || null,
    rarestStructure: byRare.find((c) => c.perLeaf.some((x) => x.leaf.cond === 'structure' && x.percentile && !x.percentile.insufficient)) || null,
    closestStructures: pick('structureNear', 'metric', 'low'),
    biomeDiversity: pick('biomeDiversity', 'metric', 'high'),
    biomeCoverage: pick('biomeArea', 'metric', 'high'),
    lootCombination: null, // Pendiente: el loot aun no se calcula (ver loot-engine.js)
  };
}
