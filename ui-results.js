// Resultados, fichas de Rareza Hunter, comparador, ranking global y exportacion TXT.
import { h, fmtInt, fmtNum, downloadText } from './utilities.js';
import { state, notify } from './app-state.js';
import { buildCards, hunterGlobal, formatPercent, formatOneIn, describeLeaf, classify, percentile, proportionSummary } from './rarity-engine.js';
import { biomeName } from './biome-engine.js';
import { structById } from './structure-engine.js';
import { LEAF_TYPES } from './search-engine.js';
import { EXPORT_FIELDS, buildTxt } from './export-engine.js';
import { LOOT } from './loot-engine.js';
import { COLLISION_LEVELS } from './collision-engine.js';

export function currentCards() {
  const run = state.lastRun, snap = state.searchSnapshot;
  if (!run || !snap) return [];
  const search = { matches: snap.matches, examined: snap.examined, domain: run.domain, calib: snap.calib };
  return buildCards(state.matches, search, run.leaves, state.tiers);
}

const badge = (tier) => tier ? h('span', { class: 'badge', style: `background:${tier.color}`, text: tier.label }) : h('span', { class: 'muted', text: '—' });

function leafSummary(card) {
  const parts = [];
  for (const x of card.perLeaf) {
    const r = x.result; if (!r || !r.pass) continue;
    if (x.leaf.cond === 'structure' || x.leaf.cond === 'stronghold') { const s = x.leaf.cond === 'stronghold' ? 'Fortaleza' : structById(x.leaf.struct)?.label.split(' (')[0]; parts.push(`${r.detail.count}× ${s} (más cercana ${fmtInt(r.detail.found?.[0]?.d)})`); }
    else if (x.leaf.cond === 'structureNear' && r.detail.pair) parts.push(`${structById(x.leaf.typeA).label.split(' (')[0]} ↔ ${structById(x.leaf.typeB).label.split(' (')[0]}: ${fmtInt(r.detail.pair.d)}`);
    else if (x.leaf.cond === 'spawnLandform') parts.push(`forma: ${({ island: 'isla', continent: 'continente', peninsula: 'península', other: 'tierra cerrada grande', water: 'agua' })[r.detail.form] || r.detail.form}`);
    else if (x.leaf.cond === 'spawnTerrain' && r.detail.range !== undefined) parts.push(`relieve ${r.detail.range.toFixed(1)}, altura media ${r.detail.mean.toFixed(0)}`);
    else if (x.leaf.cond === 'biomeDiversity') parts.push(`${r.detail.distinct} biomas`);
    else if (x.leaf.cond === 'biomeArea') parts.push(`biomas ${r.detail.pct.toFixed(1)} %`);
  }
  return parts.join(' · ') || '—';
}

export function ficha(card, m) {
  const j = card.joint;
  const rows = card.perLeaf.map((x) => {
    const mg = x.marginal, p = x.percentile;
    return h('tr', {},
      h('td', { 'data-label': 'Condición', text: x.text + (x.leaf.optional ? ' (opcional)' : '') }),
      h('td', { 'data-label': 'Cumple', text: x.result ? (x.result.pass ? 'sí' : 'no') : '—' }),
      h('td', { 'data-label': 'Verificación', text: x.result?.verified || '—' }),
      h('td', { 'data-label': 'Frecuencia individual', text: mg.none ? 'sin datos' : mg.zero ? `0/${fmtInt(mg.n)} · < ${formatPercent(mg.upper)} (95 %)` : `${formatPercent(mg.p)} · ${formatOneIn(mg.p)} (IC 95 %: ${formatPercent(mg.lo)}–${formatPercent(mg.hi)}, n=${fmtInt(mg.n)})` }),
      h('td', { 'data-label': 'Extremidad', text: !p ? '—' : p.insufficient ? `muestra insuficiente (${p.n})` : `${formatPercent(p.frac)} de la muestra es igual o más extremo` }));
  });
  return h('div', { class: 'ficha' },
    h('div', { class: 'ficha-top' },
      h('div', {}, h('div', { class: 'big', text: j.none ? '—' : formatPercent(j.p) }), h('div', { class: 'muted', text: 'RAREZA ESTIMADA (combinación completa)' })),
      h('div', {}, h('div', { class: 'big', text: j.none ? '—' : formatOneIn(j.p) }), h('div', { class: 'muted', text: 'FRECUENCIA ESTIMADA' })),
      h('div', {}, h('div', { class: 'big', text: fmtInt(j.n) }), h('div', { class: 'muted', text: 'SEEDS ANALIZADAS' })),
      h('div', {}, h('div', { class: 'big', text: fmtInt(j.k) }), h('div', { class: 'muted', text: 'QUE CUMPLEN LA COMBINACIÓN' })),
      h('div', {}, badge(card.tier), h('div', { class: 'muted', text: j.none ? '' : `IC 95 %: ${formatOneIn(j.hi)} – ${formatOneIn(j.lo)}` }))),
    state.lastRun?.pre ? h('p', { class: 'muted small-text', text: state.lastRun.pre.est.kind === 'estimate' ? `Estimación previa (análisis de viabilidad, ${state.lastRun.pre.source.label}): ${formatOneIn(state.lastRun.pre.est.p)}.` : 'El análisis previo no pudo estimar la frecuencia.' }) : null,
    h('ul', { class: 'explain' }, card.explanation.map((t) => h('li', { text: t }))),
    h('table', { class: 'tbl compact stack' }, h('thead', {}, h('tr', {}, ['Condición', 'Cumple', 'Verificación', 'Frecuencia individual (calibración)', 'Extremidad de esta semilla'].map((t) => h('th', { text: t })))), h('tbody', {}, rows)),
    h('p', { class: 'muted small-text', text: `Loot/cofres: ${LOOT.reason} · Colisiones: ${COLLISION_LEVELS.piezas.reason}` }));
}

// ---- Resultados: actualizacion por diferencias (sin reconstruir la tabla => sin parpadeos, sin perder scroll/foco/seleccion) ----
const setText = (el, t) => { if (el.textContent === t) return; const n = el.firstChild; if (n && n.nodeType === 3 && !n.nextSibling) n.nodeValue = t; else el.textContent = t; };

export function renderResults(root, ctx) {
  const ui = root._rr || (root._rr = buildResultsShell(root, ctx));
  updateResults(ui, ctx);
}

function buildResultsShell(root, ctx) {
  const ui = { rows: new Map(), list: [], cards: [], bySeed: new Map(), ths: {} };
  const sel = state.selected, refresh = () => updateResults(ui, ctx);
  const copy = (txt) => navigator.clipboard?.writeText(txt).then(() => ctx.toast('Copiado'), () => ctx.toast('No se pudo copiar'));
  const targets = () => (sel.size ? ui.list.filter((c) => sel.has(c.seed)) : ui.list);
  ui.input = h('input', { type: 'search', placeholder: 'Filtrar por seed o bioma…', value: state.filter, on: { input: (e) => { state.filter = e.target.value; refresh(); } } });
  ui.count = h('span', { class: 'muted' });
  ui.notice = h('div', { class: 'notice', text: 'Aún no hay resultados. Define reglas e inicia una búsqueda. Los resultados solo viven en memoria y desaparecen al recargar.' });
  ui.tbody = h('tbody');
  ui.selAll = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar todo', on: { change: (e) => { ui.list.forEach((c) => (e.target.checked ? sel.add(c.seed) : sel.delete(c.seed))); refresh(); } } });
  const th = (label, k) => { const el = h('th', { class: 'sortable', text: label, on: { click: () => { if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = 1; } refresh(); } } }); ui.ths[k] = { el, label }; return el; };
  const thead = h('thead', {}, h('tr', {}, h('th', {}, ui.selAll), th('Seed', 'seed'), th('Bioma spawn', 'biome'), th('Spawn estimado (X, Z)', 'dist'), h('th', { text: 'Resumen' }), th('Rareza', 'rare'), h('th', { text: 'Clase' }), h('th', { text: '' })));
  root.replaceChildren(
    h('div', { class: 'toolbar' }, ui.input, ui.count,
      h('button', { class: 'btn small', text: 'Copiar seeds', on: { click: () => copy(targets().map((c) => c.seed).join('\n')) } }),
      h('button', { class: 'btn small', text: 'Copiar coordenadas', on: { click: () => copy(targets().map((c) => { const m = ui.bySeed.get(c.seed); return `${c.seed}\tspawn X ${m.spawn.x} Z ${m.spawn.z}`; }).join('\n')) } }),
      h('button', { class: 'btn small', text: 'Comparar selección', on: { click: () => ctx.goto('hunter') } }),
      h('button', { class: 'btn small primary', text: 'Descargar TXT…', on: { click: () => exportDialog(ui.list, sel, ui.bySeed, ctx) } }),
      h('button', { class: 'btn small danger', text: 'Limpiar resultados', on: { click: () => ctx.clearResults() } })),
    ui.notice,
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl stack' }, thead, ui.tbody)));
  return ui;
}

function makeRow(ui, ctx, c, m) {
  const r = { c, detail: null, fichaAt: 0, tier: undefined }, sel = state.selected;
  const isNew = ctx.seen && !ctx.seen.has(c.seed); ctx.seen?.add(c.seed);
  const cb = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar ' + c.seed, on: { change: (e) => { e.target.checked ? sel.add(r.c.seed) : sel.delete(r.c.seed); updateResults(ui, ctx); } } });
  const rare = h('td', { 'data-label': 'Rareza' }), cls = h('td', { 'data-label': 'Clase' }), sum = h('td', { class: 'small-text', 'data-label': 'Resumen' });
  const btn = h('button', { class: 'btn tiny', on: { click: () => { ctx.open.has(r.c.seed) ? ctx.open.delete(r.c.seed) : ctx.open.add(r.c.seed); updateResults(ui, ctx); } } });
  r.tr = h('tr', { class: isNew ? 'fresh' : '' },
    h('td', { 'data-label': 'Seleccionar' }, cb), h('td', { class: 'mono', 'data-label': 'Seed', text: c.seed }), h('td', { 'data-label': 'Bioma spawn', text: biomeName(m.spawnBiome) }),
    h('td', { class: 'mono', 'data-label': 'Spawn estimado', text: `${m.spawn.x}, ${m.spawn.z}` }), sum, rare, cls,
    h('td', { 'data-label': 'Acciones' }, btn, ' ', h('button', { class: 'btn tiny', text: 'Mapa', on: { click: () => ctx.openMap(r.c.seed) } })));
  Object.assign(r, { cb, rare, cls, sum, btn });
  return r;
}

function updateRow(r, c, open, selected) {
  r.c = c;
  if (r.cb.checked !== selected) r.cb.checked = selected;
  setText(r.rare, c.joint.none ? '—' : formatOneIn(c.joint.p));
  const tl = c.tier ? c.tier.label : null;
  if (tl !== r.tier) { r.tier = tl; r.cls.replaceChildren(badge(c.tier)); }
  setText(r.sum, leafSummary(c));
  setText(r.btn, open ? 'Ocultar' : 'Ficha');
  r.tr.classList.toggle('open', open);
}

function updateResults(ui, ctx) {
  const sel = state.selected;
  const cards = currentCards(), bySeed = new Map(state.matches.map((m) => [m.seed, m]));
  const filter = state.filter.trim().toLowerCase();
  const list = cards.filter((c) => !filter || c.seed.includes(filter) || biomeName(bySeed.get(c.seed).spawnBiome).toLowerCase().includes(filter));
  const key = state.sortKey, dir = state.sortDir;
  const val = { seed: (c) => BigInt(c.seed), biome: (c) => bySeed.get(c.seed).spawnBiome, rare: (c) => c.rarestSingle ?? 2, dist: (c) => Math.hypot(bySeed.get(c.seed).spawn.x, bySeed.get(c.seed).spawn.z) }[key];
  list.sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  ui.list = list; ui.cards = cards; ui.bySeed = bySeed;

  for (const [k, { el, label }] of Object.entries(ui.ths)) setText(el, label + (key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''));
  setText(ui.count, `${fmtInt(list.length)} de ${fmtInt(cards.length)} resultados · ${fmtInt(sel.size)} seleccionados`);
  ui.notice.style.display = cards.length ? 'none' : '';
  const allSel = list.length > 0 && list.every((c) => sel.has(c.seed));
  if (ui.selAll.checked !== allSel) ui.selAll.checked = allSel;

  // Reconciliacion: se eliminan las filas que ya no estan, se reutilizan las existentes y solo se mueve lo que cambia de sitio.
  const want = new Set(list.map((c) => c.seed));
  for (const [seed, r] of ui.rows) if (!want.has(seed)) { r.tr.remove(); r.detail?.remove(); ui.rows.delete(seed); }
  const running = state.searchSnapshot?.state === 'running', now = performance.now();
  let prev = null;
  for (const c of list) {
    const m = bySeed.get(c.seed), open = ctx.open.has(c.seed);
    let r = ui.rows.get(c.seed);
    if (!r) { r = makeRow(ui, ctx, c, m); ui.rows.set(c.seed, r); }
    updateRow(r, c, open, sel.has(c.seed));
    const expected = prev ? prev.nextSibling : ui.tbody.firstChild;
    if (r.tr !== expected) ui.tbody.insertBefore(r.tr, expected);
    prev = r.tr;
    if (open) {
      if (!r.detail) { r.detail = h('tr', { class: 'detail' }, h('td', { colspan: 8 })); r.fichaAt = 0; }
      if (!r.detail.firstChild.firstChild || !running || now - r.fichaAt > 1500) { r.detail.firstChild.replaceChildren(ficha(c, m)); r.fichaAt = now; }
      if (r.tr.nextSibling !== r.detail) ui.tbody.insertBefore(r.detail, r.tr.nextSibling);
      prev = r.detail;
    } else if (r.detail) { r.detail.remove(); r.detail = null; }
  }
}

function exportDialog(list, sel, bySeed, ctx) {
  const dlg = h('dialog', { class: 'dlg' });
  const scope = { v: sel.size ? 'sel' : 'all' };
  const fields = new Set(EXPORT_FIELDS.filter((f) => f.default).map((f) => f.key));
  const first = list[0];
  dlg.append(h('h3', { text: 'Descargar TXT' }),
    h('p', { class: 'muted', text: 'El archivo se genera en tu navegador y solo se guarda si lo descargas.' }),
    ...[['one', 'Una seed (la primera de la lista visible)'], ['sel', `Seeds seleccionadas (${sel.size})`], ['all', `Todas las encontradas (${list.length})`]].map(([v, t]) => h('label', { class: 'inline block' }, h('input', { type: 'radio', name: 'sc', checked: scope.v === v, on: { change: () => { scope.v = v; } } }), ' ' + t)),
    h('hr'), ...EXPORT_FIELDS.map((f) => h('label', { class: 'inline block' }, h('input', { type: 'checkbox', checked: fields.has(f.key), on: { change: (e) => { e.target.checked ? fields.add(f.key) : fields.delete(f.key); } } }), ' ' + f.label)),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', text: 'Descargar', on: { click: () => {
      const cards = scope.v === 'one' ? (first ? [first] : []) : scope.v === 'sel' ? list.filter((c) => sel.has(c.seed)) : list;
      if (!cards.length) { ctx.toast('No hay seeds para exportar'); return; }
      downloadText('seedhunter-jimx.txt', buildTxt(cards, bySeed, ctx.exportCtx(), [...fields])); dlg.close();
    } } }), h('button', { class: 'btn', text: 'Cancelar', on: { click: () => dlg.close() } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
}

export function renderHunter(root, ctx) {
  root.replaceChildren();
  const cards = currentCards(), snap = state.searchSnapshot, run = state.lastRun;
  const sel = state.selected;
  if (!cards.length) {
    const zero = snap && snap.examined > 0 ? proportionSummary(0, snap.examined) : null;
    root.append(h('div', { class: 'notice', text: 'Rareza Hunter necesita resultados de la búsqueda actual. No se guarda ningún historial.' }),
      zero ? h('div', { class: 'notice warn' }, `No se han observado coincidencias en ${fmtInt(zero.n)} semillas examinadas. No se estima una frecuencia exacta; con 95 % de confianza la frecuencia real de esta combinación es menor que ${formatPercent(zero.upper)} (${formatOneIn(zero.upper)} o más frecuente). `, run ? run.domain.kind === 'range' ? 'Es válido solo para el intervalo examinado.' : run.domain.kind === 'random' ? 'Muestreo aleatorio: la cota se refiere al universo de semillas.' : 'Es válido solo para la lista indicada.' : '') : null,
      tierEditor(root, ctx)); return;
  }
  const g = hunterGlobal(cards);
  const item = (title, hit, fmt) => h('div', { class: 'rank' }, h('div', { class: 'muted', text: title }), hit ? fmt(hit) : h('div', { class: 'muted', text: 'No disponible con las condiciones actuales' }));
  const seedLink = (s) => h('a', { href: '#', class: 'mono', text: s, on: { click: (e) => { e.preventDefault(); ctx.openMap(s); } } });
  root.append(
    h('div', { class: 'notice' }, h('b', { text: 'Dominio: ' }), cards[0].domain.text, h('br'), h('b', { text: 'Muestra: ' }), `${fmtInt(snap.examined)} semillas · ${fmtInt(snap.matches)} coincidencias · calibración: ${fmtInt(snap.calib.n)} semillas con todas las condiciones evaluadas.`),
    h('h3', { text: 'Rareza Hunter global (solo búsqueda actual)' }),
    h('div', { class: 'grid2' },
      item('Combinación más rara (condición individual más extrema)', g.rarestCombination, (c) => h('div', {}, seedLink(c.seed), ' ', badge(c.tier), h('div', { class: 'small-text', text: `Fracción de la muestra igual o más extrema: ${formatPercent(c.rarestSingle)}` }))),
      item('Estructura más rara', g.rarestStructure, (c) => h('div', {}, seedLink(c.seed), h('div', { class: 'small-text', text: leafSummary(c) }))),
      item('Mayor proximidad entre estructuras', g.closestStructures, (b) => h('div', {}, seedLink(b.c.seed), h('div', { class: 'small-text', text: `${fmtInt(b.v)} bloques entre puntos de inicio (piezas no comprobadas)` }))),
      item('Combinación de biomas más diversa', g.biomeDiversity, (b) => h('div', {}, seedLink(b.c.seed), h('div', { class: 'small-text', text: `${b.v} biomas distintos` }))),
      item('Mayor cobertura de biomas buscados', g.biomeCoverage, (b) => h('div', {}, seedLink(b.c.seed), h('div', { class: 'small-text', text: `${b.v.toFixed(1)} % del área` }))),
      item('Colisión más excepcional', null, () => null),
      h('div', { class: 'rank' }, h('div', { class: 'muted', text: 'Loot más especial' }), h('div', { class: 'muted', text: LOOT.reason }))),
    h('p', { class: 'muted small-text', text: 'Colisión más excepcional: se muestra la «mayor proximidad entre estructuras»; la intersección real de piezas está pendiente.' }),
    h('h3', { text: 'Comparador' }),
    compare(cards, sel, ctx),
    tierEditor(root, ctx));
}

function compare(cards, sel, ctx) {
  const chosen = cards.filter((c) => sel.has(c.seed));
  if (chosen.length < 2) return h('p', { class: 'muted', text: 'Selecciona al menos 2 semillas en Resultados y pulsa «Comparar selección».' });
  chosen.sort((a, b) => (a.rarestSingle ?? 2) - (b.rarestSingle ?? 2));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['#', 'Seed', 'Frecuencia (combinación)', 'Clase', 'Condiciones (n)', 'Condición más extrema', 'Resumen'].map((t) => h('th', { text: t })))),
    h('tbody', {}, chosen.map((c, i) => {
      const worst = c.perLeaf.filter((x) => x.percentile && !x.percentile.insufficient).sort((a, b) => a.percentile.frac - b.percentile.frac)[0];
      return h('tr', {}, h('td', { text: i + 1 }), h('td', { class: 'mono', text: c.seed }), h('td', { text: `${formatPercent(c.joint.p)} · ${formatOneIn(c.joint.p)}` }), h('td', {}, badge(c.tier)),
        h('td', { text: c.perLeaf.length }), h('td', { class: 'small-text', text: worst ? `${worst.text}: ${formatPercent(worst.percentile.frac)}` : '—' }), h('td', { class: 'small-text', text: leafSummary(c) }));
    }))),
    h('p', { class: 'muted small-text', text: 'Ranking por la condición individual más extrema de cada semilla (no es un producto de probabilidades). Todas las semillas que cumplen la misma búsqueda comparten la misma frecuencia de combinación.' }));
}

function tierEditor(root, ctx) {
  const rows = state.tiers.map((t) => h('tr', {}, h('td', {}, h('span', { class: 'badge', style: `background:${t.color}`, text: t.label })),
    h('td', {}, h('span', { text: 'desde 1 entre ' }), h('input', { type: 'number', min: 1, style: 'width:120px', value: t.minP > 0 ? Math.round(1 / t.minP) : '', disabled: t.minP === 0, on: { change: (e) => { const v = Number(e.target.value); if (v >= 1) { t.minP = 1 / v; ctx.refreshAll(); } } } }), h('span', { class: 'muted', text: t.minP === 0 ? ' (resto)' : ' o más frecuente' }))));
  return h('details', { class: 'panel-sub' }, h('summary', { text: 'Umbrales de clasificación (configurables)' }), h('table', { class: 'tbl compact' }, h('tbody', {}, rows)),
    h('p', { class: 'muted small-text', text: 'Una frecuencia pertenece a la primera clase, de arriba abajo, cuyo umbral alcanza o supera.' }));
}
