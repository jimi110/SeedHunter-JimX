// SeedHunter Jimx — interfaz principal. Sin persistencia: todo el estado vive en memoria (app-state.js).
import { h, fmtInt, fmtNum, fmtTime, parseSeed, seedToString, softRender } from './utilities.js';
import { state, collectLeaves, validateRules, defaultRules } from './app-state.js';
import { EDITIONS, VERSIONS, VERSION_NOTICE, versionById } from './minecraft-versions.js';
import { EXTRA_VERSIONS, LEVELS, extraByTag } from './version-support.js';
import { SEARCH_MODES, PERFORMANCE_PROFILES, ACCENTS, UI_SIZES, WASM_FILES } from './configuration.js';
import { WasmEngine } from './wasm-engine.js';
import { detectCpu, planWorkers } from './cpu-engine.js';
import { detectGpu } from './gpu-engine.js';
import { SearchController, MapWorker } from './search-controller.js';
import { compileRules, LEAF_TYPES, spawnBound, TURBO_DEFAULT_SLACK } from './search-engine.js';
import { renderRules } from './ui-rules.js';
import { renderResults, renderHunter } from './ui-results.js';
import { openAnalysis } from './ui-analysis.js';
import { icon, LOGO_SVG } from './icons.js';
import { SeedMap } from './map-engine.js';
import { STRUCTURES, structById } from './structure-engine.js';
import { describeLeaf, formatOneIn, formatPercent } from './rarity-engine.js';
import { engineInfo, postSearchVerdict, fmtDuration } from './feasibility-engine.js';
import { LOOT } from './loot-engine.js';
import { COLLISION_LEVELS } from './collision-engine.js';

const $ = (id) => document.getElementById(id);
const TABS = [['search', 'Búsqueda', 'search'], ['rules', 'Reglas', 'rules'], ['perf', 'Rendimiento', 'gauge'], ['results', 'Resultados', 'results'], ['hunter', 'Rareza Hunter', 'spark'], ['map', 'Mapa', 'map'], ['settings', 'Ajustes y privacidad', 'gear']];
const BOTTOM = [['search', 'Buscar', 'search'], ['rules', 'Reglas', 'rules'], ['results', 'Resultados', 'results'], ['map', 'Mapa', 'map']];
const MORE = [['perf', 'Rendimiento', 'gauge'], ['hunter', 'Rareza Hunter', 'spark'], ['settings', 'Ajustes', 'gear']];
let currentTab = 'search', infoEngine = null, cpu = null, gpu = null, map = null, mapWorker = null, mapKey = '', checkpointInfo = null;
const open = new Set(), seen = new Set();
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- info de version (disponibilidad de biomas/estructuras segun el motor) ----------
const info = {
  _s: new Map(), _b: new Map(),
  setVersion(id) { this._s.clear(); this._b.clear(); infoEngine.setup(id, state.large); },
  structAvailable(id) { if (id === 'stronghold') return true; if (!this._s.has(id)) this._s.set(id, !!infoEngine.structCfg(id)); return this._s.get(id); },
  biomeAvailable(id) { if (!this._b.has(id)) this._b.set(id, infoEngine.biomeExists(id)); return this._b.get(id); },
};

function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000); }
const vLabel = (id = state.versionId, tag = state.versionTag) => (tag ? extraByTag(tag).label : versionById(id).label);
const vWarnings = (tag = state.versionTag) => { const x = tag && extraByTag(tag); return x ? [`Versión ${x.tag}: ${LEVELS[x.level]}. ${x.summary}`, ...x.differences.map((d) => 'Diferencia conocida: ' + d), ...x.unverified.map((d) => 'Sin verificar: ' + d)] : []; };
const btnContent = (name, label) => [icon(name, 18), h('span', { class: 'lbl', text: label })];

// ---------- control de busqueda ----------
const controller = new SearchController({
  onState: (st) => { updateButtons(); renderStats(controller.snapshot(), true); if (st === 'finished' || st === 'cancelled') { clearTimeout(renderTimer); renderTimer = null; flushRender(); } },
  onProgress: (snap) => { state.searchSnapshot = { ...snap, calib: controller.stats.calib }; renderStats(snap); scheduleRender(); },
  onMatches: (ms) => { state.matches.push(...ms); scheduleRender(); },
  onCheckpoint: (snap) => { toast(`Primer análisis completado (${fmtInt(snap.examined)} semillas): ${snap.matches} coincidencia(s). La búsqueda continúa.`); },
  onError: (m) => toast('Error del motor: ' + m),
});

function buildDomain() {
  const d = state.domain;
  if (d.kind === 'random') return { kind: 'random', count: Math.max(0, Math.floor(Number(d.count) || 0)) };
  if (d.kind === 'range') {
    const a = parseSeed(d.start), b = parseSeed(d.end);
    if (a === null || b === null) throw new Error('Indica el inicio y el fin del intervalo.');
    if (a > b) throw new Error('El inicio del intervalo debe ser menor o igual que el fin.');
    return { kind: 'range', start: seedToString(a), end: seedToString(b) };
  }
  const list = [...new Set(d.list.split(/[\s,;]+/).map((t) => parseSeed(t)).filter((x) => x !== null).map(seedToString))];
  if (!list.length) throw new Error('Introduce al menos una seed en la lista manual.');
  return { kind: 'list', list };
}
const cleanRules = () => JSON.parse(JSON.stringify(state.rules, (k, v) => (k === '_set' ? undefined : v)));

/** Paso 1: validar y abrir el panel de analisis previo. El motor de busqueda no arranca hasta pulsar «INICIAR BÚSQUEDA». */
async function startSearch() {
  try {
    const errs = validateRules(state.rules); if (errs.length) throw new Error(errs[0]);
    const rulesJson = cleanRules(), compiled = compileRules(cleanRules());
    for (const l of compiled.leaves) {
      const ids = l.cond === 'structure' ? [l.struct] : l.cond === 'structureNear' ? [l.typeA, l.typeB] : [];
      for (const id of ids) if (!info.structAvailable(id)) throw new Error(`«${structById(id).label}» no existe en ${vLabel()}.`);
    }
    const domain = buildDomain(), plan = planWorkers(state.profile, state.workersOverride, cpu);
    infoEngine.setup(state.versionId, state.large);
    const base = { mc: state.versionId, large: state.large, rules: rulesJson, mode: state.mode, workers: plan.workers, wasmUrl: plan.wasmUrl };
    openAnalysis({
      rules: rulesJson, compiled, info: engineInfo(infoEngine), plan, cpu, gpu, base, tiers: state.tiers,
      defaults: { count: domain.kind === 'random' ? domain.count : 0, maxMatches: Number(state.maxMatches) || 0, name: state.searchName },
      summary: { version: `${EDITIONS.find((e) => e.id === state.edition).label} · ${vLabel()}${state.large ? ' · biomas gigantes' : ''}`, mode: SEARCH_MODES[state.mode].label,
        domain: domain.kind === 'random' ? 'semillas aleatorias' : domain.kind === 'range' ? `intervalo [${domain.start}, ${domain.end}]` : `lista de ${domain.list.length} semillas`,
        leaves: collectLeaves(state.rules).filter((l) => l.enabled !== false).map((l) => describeLeaf(l) + (l.optional ? ' (opcional)' : '')) },
      extraWarnings: vWarnings(),
      onModify: () => switchTab('rules'),
      onStart: (choice, analysis) => launch({ choice, analysis, compiled, rulesJson, domain, plan }),
    });
  } catch (e) { toast(e.message || String(e)); }
}

/** Paso 2: lanzar la busqueda con el presupuesto elegido en el panel. */
async function launch({ choice, analysis, compiled, rulesJson, domain, plan }) {
  try {
    state.matches = []; state.selected.clear(); open.clear(); seen.clear(); state.searchSnapshot = null; state.searchName = choice.name; checkpointInfo = null;
    const dom = domain.kind === 'random' ? { kind: 'random', count: choice.maxSeeds || 0 } : domain;
    state.lastRun = { versionId: state.versionId, versionLabel: vLabel(), versionTag: state.versionTag, mode: state.mode, domain: dom, name: choice.name, choice, pre: { est: analysis.est, tier: analysis.tier, verdict: analysis.verdict, source: analysis.source },
      leaves: compiled.leaves.map((l) => { const c = { ...l }; delete c._set; return c; }), plan };
    const hasLimit = domain.kind === 'random' && choice.maxSeeds;
    const turbo = state.turbo ? { slack: Math.max(0, Number(state.turboSlack) || TURBO_DEFAULT_SLACK) } : null;
    state.lastRun.turbo = turbo;
    await controller.start({ mc: state.versionId, large: state.large, rules: rulesJson, mode: state.mode, domain: dom, workers: plan.workers, wasmUrl: plan.wasmUrl,
      calibEvery: Number(state.calibEvery) || 25, turbo, maxMatches: choice.maxMatches || null, maxSeeds: hasLimit ? choice.maxSeeds : null, maxTimeMs: choice.maxTimeMs,
      checkpointSeeds: choice.checkpoint && choice.checkpoint < (choice.maxSeeds || Infinity) ? choice.checkpoint : 0 });
    if (!reduceMotion()) { const c = document.querySelector('.controlbar'); c.classList.remove('burst'); void c.offsetWidth; c.classList.add('burst'); }
    switchTab('results');
  } catch (e) { toast(e.message || String(e)); }
}
function clearResults() { state.matches = []; state.selected.clear(); open.clear(); seen.clear(); state.searchSnapshot = null; renderAll(); }
function updateButtons() {
  const s = controller.state;
  $('btn-start').disabled = s === 'running' || s === 'paused';
  $('btn-pause').disabled = s !== 'running'; $('btn-resume').disabled = s !== 'paused'; $('btn-cancel').disabled = !(s === 'running' || s === 'paused');
  $('bar').classList.toggle('live', s === 'running' && !reduceMotion());
}
const STOP_TEXT = { matches: 'Se alcanzó el número de resultados pedido.', time: 'Se alcanzó el tiempo máximo.', budget: 'Se completó el presupuesto de semillas.', condition: 'Se cumplió la condición de parada.', manual: 'Detenida manualmente; los resultados parciales se conservan.' };
// Estadisticas: los elementos se crean UNA vez y solo se cambia su texto cuando cambia (sin reconstruir el DOM => sin parpadeos).
const STAT_KEYS = ['Estado', 'Examinadas', 'Válidas', 'Descartadas', 'Prefiltradas (Turbo)', 'Velocidad', 'Tiempo', 'Restante', 'Carga CPU (workers)', 'Motor', 'GPU'];
const statEls = {}; let statsMsg = null, lastStatsDraw = 0;
function buildStats() {
  const box = $('stats'); box.replaceChildren();
  for (const k of STAT_KEYS) { const v = h('span', { class: 'v' }); const cell = h('div', { class: 'stat' }, h('span', { class: 'k', text: k }), v); statEls[k] = { cell, v }; box.append(cell); }
  statsMsg = h('div', { class: 'stat wide' }, h('span', { class: 'v small-text' })); statsMsg.style.display = 'none'; box.append(statsMsg);
}
const setText = (el, t) => { if (el.textContent === t) return; const n = el.firstChild; if (n && n.nodeType === 3 && !n.nextSibling) n.nodeValue = t; else el.textContent = t; };
function renderStats(snap, force = false) {
  const now = performance.now();
  if (!force && now - lastStatsDraw < 200) return;      // como mucho ~5 redibujados por segundo
  lastStatsDraw = now;
  if (!statsMsg) buildStats();
  const run = state.lastRun, total = snap.total, pct = total ? Math.min(100, (100 * snap.examined) / total) : 0;
  const barW = (total ? pct : snap.state === 'running' ? 100 : snap.state === 'finished' ? 100 : 0) + '%';
  if ($('bar').style.width !== barW) $('bar').style.width = barW;
  $('bar').classList.toggle('indet', !total && snap.state === 'running');
  const mk = $('bar-mark'), cp = run?.choice?.checkpoint;
  mk.hidden = !(total && cp && cp < total); if (!mk.hidden) mk.style.left = (100 * cp / total) + '%';
  const lab = { idle: 'En espera', running: 'Buscando', paused: 'En pausa', finished: 'Terminada', cancelled: 'Cancelada' }[snap.state] || snap.state;
  const live = snap.state === 'running';
  const vals = {
    'Estado': lab, 'Examinadas': fmtInt(snap.examined) + (total ? ` / ${fmtInt(total)}` : ''), 'Válidas': fmtInt(snap.matches), 'Descartadas': fmtInt(snap.discarded ?? 0),
    'Prefiltradas (Turbo)': run?.turbo ? `${fmtInt(snap.prefiltered || 0)}${snap.examined ? ` (${fmtNum((100 * (snap.prefiltered || 0)) / snap.examined, 0)} %)` : ''}` : '—',
    'Velocidad': fmtNum(snap.speed, 0) + ' seeds/s', 'Tiempo': fmtTime(snap.elapsedMs),
    'Restante': live || snap.state === 'paused' ? (snap.etaMs !== null && snap.etaMs !== undefined ? '≈ ' + fmtDuration(snap.etaMs / 1000) : 'sin límite') : '—',
    'Carga CPU (workers)': snap.load !== null && snap.load !== undefined ? fmtNum(snap.load * 100, 0) + ' %' : '—',
    'Motor': (snap.workers || run?.plan?.workers) ? `CPU · ${snap.workers || run.plan.workers} worker(s) · WASM${run?.plan?.simd ? '+SIMD' : ''}` : '—',
    'GPU': gpu?.supported ? 'detectada, sin uso en worldgen' : 'no disponible',
  };
  for (const k of STAT_KEYS) setText(statEls[k].v, vals[k]);
  statEls['Prefiltradas (Turbo)'].cell.style.display = run?.turbo ? '' : 'none';
  const d = snap.domain; let msg = '';
  if ((snap.state === 'finished' || snap.state === 'cancelled') && run) {
    const msgs = [];
    if (snap.stopReason && STOP_TEXT[snap.stopReason]) msgs.push(STOP_TEXT[snap.stopReason] + (snap.stopReason === 'matches' && run.choice?.maxMatches && snap.matches > run.choice.maxMatches ? ` Se conservan las ${fmtInt(snap.matches)} encontradas (el lote en curso se completa para no sesgar la estadística).` : ''));
    if (d) msgs.push(d.kind === 'range' ? `Se examinó el intervalo [${d.start}, ${d.end}] (no todo el universo de semillas).` : d.kind === 'random' ? `Se examinó una muestra aleatoria de ${fmtInt(snap.examined)} semillas (no todas).` : 'Se examinó la lista manual indicada.');
    if (run.turbo) msgs.push(`Turbo activo (margen ${fmtInt(run.turbo.slack)} bloques): puede haberse omitido alguna semilla válida cuyo spawn quede más lejos del origen que el margen.`);
    if (snap.matches === 0 && snap.examined > 0) { const v = postSearchVerdict(snap.examined); msgs.push(`${v.label}: ${v.detail}`); }
    msg = msgs.join(' ');
  }
  statsMsg.style.display = msg ? '' : 'none'; setText(statsMsg.firstChild, msg);
}

let renderTimer = null, lastFlushMs = 0;
// Redibujado de pestanas durante la busqueda: sin parpadeos (resultados por diferencias; Hunter y Rendimiento con softRender)
// y con una cadencia que se adapta a lo que cuesta dibujar (nunca mas de 1 de cada ~5 ms de trabajo).
function flushRender() {
  const t0 = performance.now();
  if (currentTab === 'results') renderResults($('tab-results'), uiCtx);
  if (currentTab === 'hunter') softRender($('tab-hunter'), (r) => renderHunter(r, uiCtx));
  if (currentTab === 'perf') softRender($('tab-perf'), (r) => renderPerf(r));
  lastFlushMs = performance.now() - t0;
}
function scheduleRender() { if (renderTimer) return; renderTimer = setTimeout(() => { renderTimer = null; flushRender(); }, Math.min(3000, Math.max(400, lastFlushMs * 5))); }

// ---------- pestanas ----------
function switchTab(id) {
  currentTab = id; $('morepop').hidden = true;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id));
  document.querySelectorAll('#tabs button, #bottomnav button').forEach((b) => b.classList.toggle('active', b.dataset.id === id || (b.dataset.id === 'more' && MORE.some(([k]) => k === id))));
  if (id === 'rules') renderRules($('tab-rules'), { info });
  if (id === 'results') renderResults($('tab-results'), uiCtx);
  if (id === 'hunter') renderHunter($('tab-hunter'), uiCtx);
  if (id === 'perf') renderPerf();
  if (id === 'map') renderMapTab();
  if (id === 'settings') renderSettings();
  if (id === 'search') renderSearch();
  window.scrollTo?.({ top: 0 });
}
function renderAll() { switchTab(currentTab); }

const uiCtx = {
  toast, open, seen, goto: switchTab, clearResults, refreshAll: () => renderAll(),
  openMap: (seed) => { state.mapSeed = String(seed); switchTab('map'); },
  exportCtx: () => ({ edition: EDITIONS.find((e) => e.id === state.edition).label, versionLabel: state.lastRun ? state.lastRun.versionLabel : vLabel(), versionWarnings: vWarnings(state.lastRun ? state.lastRun.versionTag : state.versionTag), modeLabel: SEARCH_MODES[state.lastRun?.mode ?? state.mode].label, leaves: state.lastRun?.leaves || [] }),
};

// ---------- Turbo ----------
function turboCard() {
  const bound = spawnBound(state.versionId), exact = Number.isFinite(bound) && Number(state.turboSlack) >= bound;
  return h('div', { class: 'card' }, h('h2', { text: 'Turbo (opcional)' }),
    h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: state.turbo, on: { change: (e) => { state.turbo = e.target.checked; renderSearch(); } } }), ' Activar Turbo'),
    h('div', { class: 'fields' }, h('label', { class: 'field' }, h('span', { text: 'Margen del spawn respecto al origen (bloques)' }),
      h('input', { type: 'number', min: 0, max: 6000, step: 100, value: state.turboSlack, style: 'width:min(100%,120px)', on: { input: (e) => { state.turboSlack = e.target.value; }, change: () => renderSearch() } }))),
    h('p', { class: 'muted small-text', text: 'El spawn cuesta ≈ 4 ms por semilla y es casi todo el tiempo de una semilla. Con Turbo, antes de calcularlo se comprueba si hay alguna estructura viable a ≤ radio + margen del origen; si no la hay, la semilla se descarta sin calcular el spawn. Solo afecta a condiciones de estructura «desde el spawn» en modos Normal y Avanzado. Los resultados nunca son falsos (lo que cumple, cumple); lo único que puede perderse es una semilla válida cuyo spawn quede más lejos del origen que el margen.' }),
    h('p', { class: 'small-text', text: Number.isFinite(bound)
      ? (exact ? `Con margen ≥ ${bound} Turbo es exacto en esta versión (cota teórica del spawn), pero acelera menos.` : `Cota teórica del spawn en esta versión: ${bound} bloques (con ese margen Turbo sería exacto). Con ${fmtInt(Number(state.turboSlack) || 0)} es aproximado: en 4.500 spawns medidos el máximo fue 987 bloques del origen.`)
      : 'En esta versión el spawn no tiene cota teórica: Turbo es siempre aproximado.' }),
    h('p', { class: 'muted small-text', text: 'El análisis previo (piloto) se mide siempre sin Turbo, así que la rareza estimada es exacta; el Turbo solo acelera la búsqueda posterior.' }));
}

// ---------- Busqueda ----------
function renderSearch() {
  const root = $('tab-search'); root.replaceChildren();
  const d = state.domain, ed = EDITIONS.find((e) => e.id === state.edition);
  const dom = h('div', { class: 'fields' });
  const num = (label, key, opts = {}) => h('label', { class: 'field' }, h('span', { text: label }), h('input', { type: 'text', inputmode: opts.num ? 'numeric' : 'text', placeholder: opts.ph || '', value: d[key], style: opts.w ? `width:min(100%,${opts.w}px)` : '', on: { input: (e) => { d[key] = e.target.value; } } }));
  const kinds = [['random', 'Aleatorias (muestreo uniforme de 64 bits)'], ['range', 'Secuencial / intervalo'], ['list', 'Lista manual']];
  const drawDom = () => {
    dom.replaceChildren(...(d.kind === 'random' ? [num('Máximo de semillas (vacío = automático según el análisis)', 'count', { w: 260, num: true, ph: 'automático' })] : d.kind === 'range' ? [num('Seed inicial', 'start', { w: 220 }), num('Seed final', 'end', { w: 220 })] : [h('label', { class: 'field wide' }, h('span', { text: 'Seeds (una por línea, o separadas por coma). El texto no numérico se convierte como hace Minecraft.' }), h('textarea', { rows: 5, class: 'mono', on: { input: (e) => { d.list = e.target.value; } } }, d.list))]));
  };
  drawDom();
  root.append(
    h('div', { class: 'card' }, h('h2', { text: 'Versión y edición' }),
      h('p', { text: `${ed.label} · ${vLabel()}` }),
      ...vWarnings().map((t) => h('div', { class: 'notice warn', text: t })),
      h('div', { class: 'notice' }, VERSION_NOTICE),
      h('div', { class: 'notice warn' }, EDITIONS.find((e) => !e.enabled).reason),
      h('div', { class: 'notice warn' }, 'El spawn es una ESTIMACIÓN de Cubiomes: el spawn real depende de bloques de hierba y puede diferir. Las condiciones «desde el spawn» usan ese punto estimado.'),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: state.large, on: { change: (e) => { state.large = e.target.checked; info.setVersion(state.versionId); } } }), ' Biomas gigantes (Large Biomes)')),
    h('div', { class: 'card' }, h('h2', { text: 'Modo de búsqueda' }), h('div', { class: 'modes' }, ...Object.entries(SEARCH_MODES).map(([k, m]) => h('label', { class: 'mode' + (state.mode === k ? ' sel' : '') },
      h('input', { type: 'radio', name: 'mode', checked: state.mode === k, on: { change: () => { state.mode = k; $('cb-mode').value = k; renderSearch(); } } }), h('b', { text: ' ' + m.label }),
      h('ul', {}, m.runs.map((t) => h('li', { text: t }))), h('p', { class: 'muted small-text', text: m.notes }))))),
    h('div', { class: 'card' }, h('h2', { text: 'Semillas a examinar' }),
      h('div', { class: 'toolbar' }, ...kinds.map(([k, t]) => h('label', { class: 'inline' }, h('input', { type: 'radio', name: 'dk', checked: d.kind === k, on: { change: () => { d.kind = k; renderSearch(); } } }), ' ' + t))),
      dom,
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Parar tras N coincidencias (vacío = lo decides en el análisis previo)' }), h('input', { type: 'number', min: 1, inputmode: 'numeric', value: state.maxMatches, style: 'width:min(100%,120px)', on: { input: (e) => { state.maxMatches = e.target.value; } } })),
        h('label', { class: 'field' }, h('span', { text: 'Calibración: evaluar todas las condiciones cada N semillas' }), h('input', { type: 'number', min: 1, inputmode: 'numeric', value: state.calibEvery, style: 'width:min(100%,90px)', on: { input: (e) => { state.calibEvery = e.target.value; } } }))),
      h('p', { class: 'muted small-text', text: 'Al pulsar «Iniciar» se abre un análisis previo que mide en tu equipo la rareza y la velocidad, y propone un presupuesto editable. Nada empieza hasta que lo confirmes.' })),
    turboCard(),
    h('div', { class: 'card' }, h('h2', { text: 'Condiciones activas' }), h('ul', {}, collectLeaves(state.rules).filter((l) => l.enabled !== false).map((l) => h('li', { text: describeLeaf(l) + (l.optional ? ' (opcional)' : '') }))), h('button', { class: 'btn small', on: { click: () => switchTab('rules') } }, icon('rules', 16), h('span', { class: 'lbl', text: 'Editar reglas' }))));
}

// ---------- Rendimiento ----------
function renderPerf(root = $('tab-perf')) {
  root.replaceChildren();
  const plan = planWorkers(state.profile, state.workersOverride, cpu), snap = controller.snapshot();
  const row = (k, v) => h('tr', {}, h('th', { text: k }), h('td', { text: v }));
  const stages = snap.stages || [], labels = state.lastRun?.leaves || [];
  root.append(
    h('div', { class: 'card' }, h('h2', { text: 'Hardware detectado (según lo que expone el navegador)' }),
      h('table', { class: 'tbl compact' }, h('tbody', {},
        row('Núcleos lógicos', cpu.coresKnown ? String(cpu.cores) + ' (el navegador puede redondear u ocultar este dato)' : 'no expuesto: se asumen 4'),
        row('WebAssembly', cpu.wasm ? 'disponible' : 'NO disponible'), row('SIMD de WebAssembly', cpu.simd ? 'disponible (se usa seedhunter-engine-simd.wasm)' : 'no disponible (se usa el módulo escalar)'),
        row('Web Workers', cpu.workers ? 'disponibles' : 'NO disponibles'), row('Memoria del dispositivo (aprox.)', cpu.memoryGB ? cpu.memoryGB + ' GB' : 'no expuesta'),
        row('WebGPU', gpu ? (gpu.supported ? 'detectada' + (gpu.adapter?.vendor ? ` · ${gpu.adapter.vendor} ${gpu.adapter.architecture || ''}` : '') : 'no disponible') : 'comprobando…'),
        row('Uso de la GPU', gpu?.reason || '')))),
    h('div', { class: 'card' }, h('h2', { text: 'Configuración de rendimiento' }),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Perfil' }), h('select', { on: { change: (e) => { state.profile = e.target.value; renderPerf(); } } }, ...Object.entries(PERFORMANCE_PROFILES).map(([k, p]) => h('option', { value: k, selected: state.profile === k, text: p.label })))),
        h('label', { class: 'field' }, h('span', { text: 'Tareas paralelas (vacío = automático)' }), h('input', { type: 'number', min: 1, max: 64, value: state.workersOverride, style: 'width:90px', on: { change: (e) => { state.workersOverride = e.target.value; renderPerf(); } } })),
        h('label', { class: 'field' }, h('span', { text: 'Método de cálculo' }), h('select', { on: { change: (e) => { state.enginePref = e.target.value; renderPerf(); } } },
          h('option', { value: 'auto', selected: state.enginePref === 'auto', text: 'Automático' }), h('option', { value: 'cpu', selected: state.enginePref === 'cpu', text: 'Preferir CPU / WebAssembly' }), h('option', { value: 'gpu', selected: state.enginePref === 'gpu', text: 'Preferir GPU' })))),
      h('p', { text: `Se usarán ${plan.workers} worker(s) con ${plan.simd ? 'WebAssembly + SIMD' : 'WebAssembly escalar'}.` }),
      state.enginePref === 'gpu' ? h('div', { class: 'notice warn', text: 'La generación de mundo no es adecuada para GPU: aunque prefieras GPU, el cálculo se hace en CPU/WebAssembly. No se inventan aceleraciones.' }) : null,
      h('p', { class: 'muted small-text', text: 'La carga mostrada es el tiempo ocupado real medido de los workers; el navegador no expone el uso de CPU del sistema ni el de GPU.' })),
    h('div', { class: 'card' }, h('h2', { text: 'Medidas reales de la búsqueda actual' }),
      h('p', { text: `Velocidad: ${fmtNum(snap.speed, 0)} seeds/s (media ${fmtNum(snap.avgSpeed, 0)}) · Examinadas: ${fmtInt(snap.examined)} · Descartadas: ${fmtInt(snap.discarded ?? 0)} · Válidas: ${fmtInt(snap.matches)} · Carga de workers: ${snap.load !== null && snap.load !== undefined ? fmtNum(snap.load * 100, 0) + ' %' : '—'}` }),
      state.lastRun?.turbo ? h('p', { class: 'muted small-text', text: `Turbo activo: ${fmtInt(snap.prefiltered || 0)} semillas se descartaron antes de calcular el spawn y no cuentan en las cifras por etapa (que describen solo las semillas que pasaron el prefiltro).` }) : null,
      stages.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl compact stack' }, h('thead', {}, h('tr', {}, ['Etapa del filtro', 'Llegaron', 'Pasaron', 'Tiempo total', 'Semillas/s de la etapa'].map((t) => h('th', { text: t })))),
        h('tbody', {}, stages.map((s, i) => h('tr', {}, h('td', { 'data-label': 'Etapa', text: `${i + 1}. ${labels[i] ? describeLeaf(labels[i]) : 'condición'}` }), h('td', { 'data-label': 'Llegaron', text: fmtInt(s.n) }), h('td', { 'data-label': 'Pasaron', text: fmtInt(s.k) }), h('td', { 'data-label': 'Tiempo', text: fmtNum(s.ms / 1000, 2) + ' s' }), h('td', { 'data-label': 'Semillas/s', text: s.ms > 0 ? fmtNum((s.n / s.ms) * 1000, 0) : '—' })))))) : h('p', { class: 'muted', text: 'Sin datos por etapa todavía. Inicia una búsqueda.' })));
}

// ---------- Mapa ----------
async function renderMapTab() {
  const root = $('tab-map'); root.replaceChildren();
  const seedIn = h('input', { type: 'text', class: 'mono', placeholder: 'Seed', value: state.mapSeed ?? '', style: 'width:min(100%,220px)' });
  const dimSel = h('select', {}, ...[[0, 'Overworld'], [-1, 'Nether'], [1, 'End']].map(([v, t]) => h('option', { value: v, text: t })));
  const status = h('span', { class: 'muted' }), hover = h('span', { class: 'mono' }), selInfo = h('div', { class: 'muted', text: 'Toca o haz clic en una estructura para ver sus datos.' });
  const canvas = h('canvas', { class: 'map', tabindex: 0 });
  const layerBox = h('div', { class: 'toolbar' });
  const load = async () => {
    const s = parseSeed(seedIn.value); if (s === null) { toast('Indica una seed'); return; }
    const key = `${state.versionId}/${state.large}`;
    if (mapKey !== key || !mapWorker) { mapWorker?.terminate(); mapWorker = new MapWorker(WASM_FILES.scalar, state.versionId, state.large); mapKey = key; }
    map = new SeedMap(canvas, mapWorker, { onStatus: (t) => { status.textContent = t; }, onHover: (p) => { hover.textContent = `X ${p.x}  Z ${p.z}  ${p.biome ?? ''}  ${p.dim}`; }, onSelect: (p) => { selInfo.replaceChildren(...(p ? [h('b', { text: p.label }), h('div', { class: 'mono', text: `X ${p.x}, Z ${p.z}` }), h('div', { text: p.dSpawn !== null ? `Distancia al spawn: ${fmtInt(p.dSpawn)} bloques` : '' }), h('div', { class: 'muted', text: `Verificación: ${p.verified}. Es el punto de inicio, no una habitación ni un cofre.` })] : ['Sin selección'])); }, onMeasure: (d) => { status.textContent = d === null ? 'Mide: marca dos puntos' : `Distancia medida: ${fmtInt(d)} bloques`; } });
    map.layers.structures = new Set(); applyLayers(); map.dim = Number(dimSel.value);
    map.resize(); map.setSeed(s); setTimeout(() => { map.zones = zonesFor(); map.draw(); }, 1200);
  };
  const applyLayers = () => { if (!map) return; map.layers.structures = new Set([...layerBox.querySelectorAll('input[data-st]:checked')].map((i) => (i.dataset.st === 'stronghold' ? 'stronghold' : Number(i.dataset.st)))); map.layers.spawn = layerBox.querySelector('[data-k=spawn]').checked; map.layers.zones = layerBox.querySelector('[data-k=zones]').checked; map.layers.biomes = layerBox.querySelector('[data-k=biomes]').checked; map.refresh(); };
  const toggle = (k, label, on) => h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: on, 'data-k': k, on: { change: applyLayers } }), ' ' + label);
  layerBox.append(toggle('biomes', 'Biomas', true), toggle('spawn', 'Spawn', true), toggle('zones', 'Zonas de búsqueda', true),
    ...['Village', 'Mansion', 'Ancient_City', 'stronghold', 'Trial_Chambers', 'Monument', 'Fortress', 'Bastion', 'End_City'].map((k) => { const s = STRUCTURES.find((x) => x.key === k); return s ? h('label', { class: 'inline' }, h('input', { type: 'checkbox', 'data-st': s.id, on: { change: applyLayers } }), ' ' + s.label.split(' (')[0]) : null; }),
    h('label', { class: 'inline muted', title: LOOT.reason }, h('input', { type: 'checkbox', disabled: true }), ' Cofres (pendiente)'));
  dimSel.addEventListener('change', () => { if (map) { map.zones = zonesFor(); map.setDim(Number(dimSel.value)); } });
  root.append(h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, 'Seed ', seedIn), h('label', { class: 'inline' }, 'Dimensión ', dimSel), h('button', { class: 'btn primary small', text: 'Cargar mapa', on: { click: load } }),
    h('button', { class: 'btn small', 'aria-label': 'Acercar', text: '+', on: { click: () => map?.zoom(0.5) } }), h('button', { class: 'btn small', 'aria-label': 'Alejar', text: '−', on: { click: () => map?.zoom(2) } }), h('button', { class: 'btn small', text: 'Ir al spawn', on: { click: () => map?.spawn && map.goto(map.spawn.x, map.spawn.z) } }),
    h('button', { class: 'btn small', text: 'Medir distancia', on: { click: (e) => { if (!map) return; map.tool = map.tool === 'measure' ? 'select' : 'measure'; map.measure = []; e.currentTarget.classList.toggle('primary', map.tool === 'measure'); status.textContent = map.tool === 'measure' ? 'Mide: marca dos puntos' : ''; map.draw(); } } })),
    layerBox, h('div', { class: 'maprow' }, h('div', { class: 'mapwrap' }, canvas), h('aside', { class: 'mapside' }, h('div', {}, hover), h('div', {}, status), h('hr'), selInfo)),
    h('p', { class: 'muted small-text', text: 'El mapa se genera con el motor real para la seed y versión elegidas. Las estructuras son puntos de inicio verificados por bioma; la geometría interior y los cofres no se generan.' }));
  if (state.mapSeed) { await Promise.resolve(); load(); }
}
function zonesFor() {
  const run = state.lastRun; if (!run) return [];
  return run.leaves.filter((l) => l.enabled !== false && l.radius && (l.center === 'origin' || l.center === 'spawn')).map((l) => ({ cx: l.center === 'origin' ? 0 : (map?.spawn?.x ?? 0), cz: l.center === 'origin' ? 0 : (map?.spawn?.z ?? 0), r: l.radius, label: LEAF_TYPES[l.cond].label + ' ' + l.radius }));
}

// ---------- Ajustes y privacidad ----------
function renderSettings() {
  const root = $('tab-settings'); root.replaceChildren();
  root.append(
    h('div', { class: 'card' }, h('h2', { text: 'Apariencia' }),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Tema' }), h('select', { id: 'sel-theme', on: { change: (e) => { state.theme = e.target.value; applyTheme(); } } }, ...[['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Automático (sistema)']].map(([v, t]) => h('option', { value: v, selected: state.theme === v, text: t })))),
        h('label', { class: 'field' }, h('span', { text: 'Tamaño de interfaz' }), h('select', { on: { change: (e) => { state.uiSize = e.target.value; applyTheme(); } } }, ...Object.keys(UI_SIZES).map((k) => h('option', { value: k, selected: state.uiSize === k, text: { small: 'Pequeño', medium: 'Medio', large: 'Grande' }[k] })))),
        h('div', { class: 'field' }, h('span', { text: 'Color de acento' }), h('div', { class: 'swatches' }, ...ACCENTS.map((c) => h('button', { class: 'swatch' + (state.accent === c ? ' sel' : ''), style: `background:${c}`, 'aria-label': 'Acento ' + c, on: { click: () => { state.accent = c; applyTheme(); renderSettings(); } } }))))),
      h('p', { class: 'muted small-text', text: 'Estas preferencias no se guardan: al recargar vuelven a los valores por defecto (por privacidad no se guarda ningún dato tuyo en el navegador).' })),
    h('div', { class: 'card' }, h('h2', { text: 'Privacidad' }), h('ul', {},
      ['Todo el cálculo ocurre en tu navegador (WebAssembly en Web Workers). No hay backend ni peticiones con datos tuyos.',
        'No se usa localStorage, sessionStorage, IndexedDB ni cookies. Sin analítica ni telemetría. Sin cuentas. Si instalas la app, solo se guardan en caché los archivos de la propia app para abrirla sin conexión; nunca datos tuyos.',
        'Seeds, resultados, análisis, filtros y datos de hardware viven solo en memoria y desaparecen al cerrar o recargar.',
        'Solo conservas una seed si pulsas «Descargar TXT». La política CSP de la página bloquea conexiones a otros orígenes.'].map((t) => h('li', { text: t })))),
    h('div', { class: 'card' }, h('h2', { text: 'Límites y funciones pendientes (sin simular)' }), h('ul', {}, [
      VERSION_NOTICE, 'Versiones 26.1/26.2/26.3: se sirven con el motor 1.21 Winter Drop y se marcan como equivalentes en datos o aproximadas; ver version-support.js y check-version-data.py. Dappled Forest y Abandoned Camps (26.3) NO están en el motor.', EDITIONS.find((e) => !e.enabled).reason, LOOT.reason, COLLISION_LEVELS.piezas.reason,
      'GPU: WebGPU solo se detecta; la generación de mundo se ejecuta en CPU/WebAssembly.',
      'Las categorías de rareza son propias de SeedHunter y configurables; no son una clasificación oficial de Minecraft. Mojang no publica probabilidades de semillas.',
      'Estructuras: se calculan posiciones de inicio (con comprobación de bioma). El terreno solo se aproxima en Desert Pyramid, Jungle Temple y Mansion (1.18+).',
      'Muestreo de biomas por celdas (4/16/64 bloques según modo y radio): biomas diminutos pueden no detectarse en modos rápidos.'].map((t) => h('li', { text: t })))),
    h('div', { class: 'card' }, h('h2', { text: 'Créditos y licencias' }), h('p', { text: 'Motor de generación: Cubiomes (Cubitect), licencia MIT — ver LICENSE-cubiomes. SeedHunter Jimx se distribuye bajo MIT (LICENSE). Proyecto no oficial: no está aprobado ni asociado con Mojang ni Microsoft.' })));
}
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function effectiveTheme() { return state.theme === 'auto' ? (mqDark.matches ? 'dark' : 'light') : state.theme; }
function applyTheme() {
  const r = document.documentElement, t = effectiveTheme();
  r.dataset.theme = t; r.style.setProperty('--accent', state.accent); r.style.fontSize = UI_SIZES[state.uiSize] + 'px';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0a1020' : '#eef2fa');
  for (const id of ['btn-theme', 'btn-theme-m']) { const b = $(id); if (b) b.replaceChildren(icon(t === 'dark' ? 'moon' : 'sun', 20)); }
}
function cycleTheme() { state.theme = state.theme === 'dark' ? 'light' : state.theme === 'light' ? 'auto' : 'dark'; applyTheme(); toast('Tema: ' + { dark: 'oscuro', light: 'claro', auto: 'automático' }[state.theme]); const s = $('sel-theme'); if (s) s.value = state.theme; }

// ---------- arranque ----------
function buildNav() {
  $('logo').innerHTML = LOGO_SVG; $('logo-m').innerHTML = LOGO_SVG.replaceAll('lg1', 'lg1m').replaceAll('lg2', 'lg2m'); $('lock-icon').replaceChildren(icon('lock', 14));
  $('tabs').replaceChildren(...TABS.map(([id, t, ic]) => h('button', { 'data-id': id, title: t, on: { click: () => switchTab(id) } }, icon(ic, 20), h('span', { class: 'label', text: t }))));
  $('bottomnav').replaceChildren(...BOTTOM.map(([id, t, ic]) => h('button', { 'data-id': id, on: { click: () => switchTab(id) } }, icon(ic, 22), h('span', { text: t }))),
    h('button', { 'data-id': 'more', 'aria-haspopup': 'true', on: { click: () => { $('morepop').hidden = !$('morepop').hidden; } } }, icon('more', 22), h('span', { text: 'Más' })));
  $('morepop').replaceChildren(...MORE.map(([id, t, ic]) => h('button', { class: 'btn', 'data-id': id, on: { click: () => switchTab(id) } }, icon(ic, 18), h('span', { class: 'lbl', text: t }))));
  document.addEventListener('click', (e) => { if (!$('morepop').hidden && !e.target.closest('#morepop') && !e.target.closest('#bottomnav')) $('morepop').hidden = true; });
}
async function init() {
  buildNav(); applyTheme(); mqDark.addEventListener?.('change', () => { if (state.theme === 'auto') applyTheme(); });
  $('btn-theme').addEventListener('click', cycleTheme); $('btn-theme-m').addEventListener('click', cycleTheme);
  $('btn-start').replaceChildren(...btnContent('play', 'Iniciar')); $('btn-pause').replaceChildren(...btnContent('pause', 'Pausar')); $('btn-resume').replaceChildren(...btnContent('play', 'Reanudar'));
  $('btn-cancel').replaceChildren(...btnContent('stop', 'Cancelar')); $('btn-restart').replaceChildren(...btnContent('restart', 'Reiniciar'));
  $('cb-edition').replaceChildren(...EDITIONS.map((e) => h('option', { value: e.id, text: e.label + (e.enabled ? '' : ' (no disponible)'), disabled: !e.enabled })));
  $('cb-version').replaceChildren(...EXTRA_VERSIONS.slice().reverse().map((v) => h('option', { value: 'tag:' + v.tag, text: v.label })), ...VERSIONS.map((v) => h('option', { value: v.id, text: v.label, selected: v.id === state.versionId })));
  $('cb-mode').replaceChildren(...Object.entries(SEARCH_MODES).map(([k, m]) => h('option', { value: k, text: m.label, selected: k === state.mode })));
  $('cb-version').addEventListener('change', (e) => { const val = e.target.value, x = val.startsWith('tag:') ? extraByTag(val.slice(4)) : null; state.versionTag = x ? x.tag : null; state.versionId = x ? VERSIONS.find((v) => v.key === x.engineKey).id : Number(val); info.setVersion(state.versionId); renderAll(); });
  $('cb-mode').addEventListener('change', (e) => { state.mode = e.target.value; renderAll(); });
  $('btn-start').addEventListener('click', startSearch);
  $('btn-pause').addEventListener('click', () => controller.pause());
  $('btn-resume').addEventListener('click', () => controller.resume());
  $('btn-cancel').addEventListener('click', () => controller.cancel());
  $('btn-restart').addEventListener('click', () => { controller.cancel(true); controller.state = 'idle'; clearResults(); state.rules = defaultRules(); renderStats(controller.snapshot(), true); updateButtons(); toast('Reiniciado'); });
  cpu = detectCpu();
  try {
    infoEngine = await WasmEngine.load(WASM_FILES.scalar); info.setVersion(state.versionId);
    $('engine-tag').textContent = `motor: Cubiomes/WASM${cpu.simd ? ' + SIMD' : ''} · ${cpu.coresKnown ? cpu.cores + ' núcleos' : 'núcleos n/d'}`;
  } catch (e) { $('engine-tag').textContent = 'motor: ERROR'; toast('No se pudo cargar el motor WebAssembly: ' + e.message); return; }
  updateButtons(); renderStats(controller.snapshot(), true); switchTab('search');
  detectGpu().then((g) => { gpu = g; if (currentTab === 'perf') renderPerf(); renderStats(controller.snapshot(), true); });
}
init();
