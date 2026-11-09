// Panel de analisis previo: resume la busqueda ANTES de arrancar el motor, con rareza, viabilidad, dificultad, presupuesto
// y probabilidad de exito. Todo se calcula con datos medidos en este equipo (piloto) o con demostraciones; nada se inventa.
import { h, fmtInt, fmtNum, fmtTime } from './utilities.js';
import { icon } from './icons.js';
import { ANALYSIS } from './configuration.js';
import { runPilot } from './search-controller.js';
import { formatPercent, formatOneIn, oneIn } from './rarity-engine.js';
import { SOURCES, OFFICIAL_NOTE, VERDICTS, makeAnalysis, buildBudget, successFor, fmtDuration, SUCCESS_TARGETS } from './feasibility-engine.js';

const compact = (n) => (!Number.isFinite(n) ? '—' : n >= 1e6 ? new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : fmtInt(n));
const pct = (x) => (x === null || x === undefined ? '—' : x >= 0.9995 ? '> 99,9 %' : x < 0.0005 ? '< 0,1 %' : fmtNum(x * 100, x < 0.1 ? 2 : 1) + ' %');
export const STOP_LABELS = {
  n1: 'Detener al encontrar 1 semilla', n3: 'Detener al encontrar 3 semillas', n5: 'Detener al encontrar 5 semillas', n10: 'Detener al encontrar 10 semillas',
  more: 'Continuar buscando semillas más raras (hasta agotar el presupuesto)', budget: 'Completar todo el presupuesto de búsqueda', manual: 'Solo detener manualmente (sin límites)', custom: 'Personalizado',
};

/**
 * o: { rules, compiled, info, plan, cpu, gpu, base, tiers, defaults:{desired,maxMinutes,count,maxMatches}, summary:{version,mode,domain,leaves[]},
 *      onStart(choice, analysis), onModify() }
 */
export function openAnalysis(o) {
  const S = { quality: ANALYSIS.defaultQuality, analysis: null, desired: o.defaults.desired || ANALYSIS.desiredResults, maxMinutes: o.defaults.maxMinutes || ANALYSIS.maxMinutes,
    stop: 'n3', seedsInitial: 0, seedsMax: 0, edited: false, force: false, name: o.defaults.name || 'Búsqueda 1', ac: null };
  if (o.defaults.maxMatches) S.stop = 'custom'; else S.stop = ANALYSIS.stopOptions.includes(S.desired) ? 'n' + S.desired : 'n3';
  const dlg = h('dialog', { class: 'sheet', 'aria-label': 'Análisis previo' });
  const body = h('div', { class: 'sheet-body' }), foot = h('div', { class: 'sheet-foot' });
  const closeBtn = h('button', { class: 'btn icon-only', 'aria-label': 'Cerrar', on: { click: () => dlg.close() } }, icon('close'));
  dlg.append(h('div', { class: 'sheet-head' }, icon('chart', 24), h('h2', { text: 'Análisis previo de la búsqueda' }), closeBtn), body, foot);
  dlg.addEventListener('close', () => { S.ac?.abort(); dlg.remove(); });
  document.body.append(dlg); dlg.showModal();

  const setFoot = (...els) => foot.replaceChildren(...els.filter(Boolean));
  const modifyBtn = () => h('button', { class: 'btn', text: 'MODIFICAR CONDICIONES', on: { click: () => { dlg.close(); o.onModify(); } } });

  async function analyze() {
    S.ac?.abort(); S.ac = new AbortController();
    const imp0 = makeAnalysis({ rules: o.rules, compiled: o.compiled, info: o.info, pilot: null, tiers: o.tiers, cpu: o.cpu, gpu: o.gpu, plan: o.plan, desired: S.desired, maxMinutes: S.maxMinutes });
    if (imp0.imp.unsat) { S.analysis = imp0; seedBudget(); render(); return; }
    const timeMs = ANALYSIS.pilotQualities[S.quality];
    const live = h('div', { class: 'muted small-text', text: 'Preparando motor…' }), bar = h('div', { class: 'bar live', style: 'width:0%' }), stagesEl = h('div', { class: 'small-text muted' });
    body.replaceChildren(h('div', { class: 'pilotbox' }, h('div', { class: 'spinner' }), h('h3', { text: 'Midiendo en tu equipo…' }),
      h('p', { class: 'muted', text: 'Se evalúan semillas aleatorias reales con tus condiciones para medir la velocidad y la frecuencia de cada etapa. No se guarda nada.' }),
      h('div', { class: 'progress', style: 'max-width:420px;margin:1rem auto' }, bar), live, stagesEl));
    setFoot(h('button', { class: 'btn', text: 'Cancelar análisis', on: { click: () => dlg.close() } }));
    const t0 = performance.now();
    try {
      const pilot = await runPilot({ ...o.base }, { timeMs, signal: S.ac.signal, onProgress: (s) => {
        bar.style.width = Math.min(100, ((performance.now() - t0) / timeMs) * 100) + '%';
        live.textContent = `${fmtInt(s.examined)} semillas · ${fmtNum(s.avgSpeed || s.speed, 0)} seeds/s · ${s.workers} worker(s)`;
        stagesEl.textContent = (s.stages || []).map((st, i) => `Etapa ${i + 1}: ${fmtInt(st.k)}/${fmtInt(st.n)}`).join('  ·  ');
      } });
      if (pilot.aborted || !dlg.open) return;
      S.analysis = makeAnalysis({ rules: o.rules, compiled: o.compiled, info: o.info, pilot, tiers: o.tiers, cpu: o.cpu, gpu: o.gpu, plan: o.plan, desired: S.desired, maxMinutes: S.maxMinutes });
      S.pilot = pilot; S.edited = false; seedBudget(); render();
    } catch (e) {
      body.replaceChildren(h('div', { class: 'notice bad', text: 'No se pudo medir: ' + (e.message || e) }));
      setFoot(modifyBtn(), h('button', { class: 'btn', text: 'Reintentar', on: { click: analyze } }));
    }
  }

  function seedBudget() {
    const b = buildBudget({ est: S.analysis.est, speed: S.analysis.speed, desired: S.desired, maxMinutes: S.maxMinutes });
    if (!S.edited) {
      S.seedsInitial = b.seedsInitial && Number.isFinite(b.seedsInitial) ? Math.round(b.seedsInitial) : 0;
      S.seedsMax = b.seedsMax && Number.isFinite(b.seedsMax) ? Math.round(b.seedsMax) : 0;
      if (o.defaults.count > 0) { S.seedsMax = o.defaults.count; S.seedsInitial = Math.min(S.seedsInitial || S.seedsMax, S.seedsMax); }
    }
  }

  function liveBox() {
    const an = S.analysis, sp = an.speed, cap = sp ? sp * S.maxMinutes * 60 : Infinity;
    const row = (label, N) => {
      if (!N) return h('div', { class: 'kv' }, h('span', { text: label }), h('span', { text: 'sin límite de semillas' }));
      const Neff = Math.min(N, cap), s = successFor(an.est, S.desired, Neff), t = sp ? Neff / sp : null;
      const prob = s.p !== null ? `${pct(s.p)} (IC ${pct(s.lo)}–${pct(s.hi)})` : s.upperOnly !== null ? (s.upperOnly >= 0.999 ? 'desconocida (sin cota útil)' : `desconocida (como máximo ${pct(s.upperOnly)})`) : 'desconocida';
      return h('div', { class: 'kv' }, h('span', { text: `${label}: ${compact(Neff)}${Neff < N ? ' (limitado por tiempo)' : ''}` }), h('span', { text: `${fmtDuration(t)} · P(≥ ${S.desired}) = ${prob}` }));
    };
    return h('div', {}, row('Primer análisis', S.seedsInitial), row('Límite ampliado', S.seedsMax));
  }

  function render() {
    const an = S.analysis, est = an.est, imp = an.imp, V = an.verdict, mine = [];
    const sel = (opts, val, fn) => h('select', { on: { change: (e) => fn(e.target.value) } }, ...opts.map(([v, t]) => h('option', { value: v, text: t, selected: String(v) === String(val) })));
    const num = (val, fn, w = 130, min = 0) => h('input', { type: 'number', min, value: val || '', style: `width:${w}px`, on: { change: (e) => { fn(Math.max(0, Number(e.target.value) || 0)); S.edited = true; refreshLive(); } } });
    const live = h('div', {}); const refreshLive = () => live.replaceChildren(liveBox());
    refreshLive();

    // --- rareza
    const rareCard = h('div', { class: 'mini' }, h('h4', { text: 'Rareza estimada' }));
    if (est.kind === 'estimate') {
      rareCard.append(h('div', { class: 'hero' },
        h('div', {}, h('div', { class: 'big', text: formatOneIn(est.p) }), h('div', { class: 'muted small-text', text: `Probabilidad ≈ ${formatPercent(est.p)} por semilla` })),
        h('span', { class: 'badge', style: `background:${an.tier.color}`, text: an.tier.label })),
        h('div', { class: 'kv' }, h('span', { text: 'Intervalo de confianza 95 %' }), h('span', { text: `${formatOneIn(est.hi)} – ${formatOneIn(est.lo)}` })));
    } else {
      rareCard.append(h('div', { class: 'big', text: 'Frecuencia desconocida' }),
        h('p', { class: 'muted small-text', text: est.upper ? `Con 95 % de confianza es menor que ${formatPercent(est.upper)} (${formatOneIn(est.upper)} o más frecuente). Es una cota, no una estimación.` : est.note || 'No hay datos.' }));
    }
    rareCard.append(h('div', { class: 'kv' }, h('span', { text: 'Fuente' }), h('span', { text: an.source.label })), h('p', { class: 'muted small-text', text: est.note || '' }));
    rareCard.append(h('details', {}, h('summary', { class: 'small-text', text: 'Niveles de fiabilidad y probabilidades oficiales' }),
      h('ol', { class: 'warnlist' }, Object.values(SOURCES).map((s) => h('li', { text: s.label, style: s === an.source ? 'font-weight:700' : '' }))), h('p', { class: 'muted small-text', text: OFFICIAL_NOTE })));

    // --- viabilidad
    const vCard = h('div', { class: 'mini' }, h('h4', { text: 'Viabilidad' }),
      h('div', { class: 'verdict tone-' + V.tone }, h('div', { class: 'vcode', text: V.code === 'OK' ? '✓' : V.code === 'U' ? '?' : V.code }), h('div', {}, h('b', { text: V.label }), h('div', { class: 'muted small-text', text: V.detail || '' }))),
      V.proven ? h('p', { class: 'small-text', text: 'Hay una demostración basada en las reglas reales de generación; por eso se declara inviable.' }) : h('p', { class: 'muted small-text', text: 'No se declara imposible nada que no se haya demostrado. Si es muy raro, se puede buscar igualmente.' }));

    // --- dificultad y motor
    const D = an.difficulty;
    const dCard = h('div', { class: 'mini' }, h('h4', { text: 'Dificultad computacional' }),
      h('div', { class: 'segs' }, ...[1, 2, 3, 4, 5, 6].map((i) => h('i', { class: i <= D.level ? 'on' + (D.level >= 6 ? ' hotter' : D.level >= 4 ? ' hot' : '') : '' }))),
      h('b', { text: D.label }), h('div', { class: 'muted small-text', text: D.text }),
      h('div', { class: 'kv' }, h('span', { text: 'Motor recomendado' }), h('span', { text: an.engine.engine })),
      h('div', { class: 'kv' }, h('span', { text: 'Velocidad medida' }), h('span', { text: an.speed ? fmtNum(an.speed, 0) + ' seeds/s' : 'sin medir' })),
      h('ul', { class: 'warnlist muted' }, an.engine.reasons.map((r) => h('li', { text: r }))));

    // --- presupuesto
    const stopOpts = [...ANALYSIS.stopOptions.map((n) => ['n' + n, STOP_LABELS['n' + n]]), ['more', STOP_LABELS.more], ['budget', STOP_LABELS.budget], ['manual', STOP_LABELS.manual]];
    if (o.defaults.maxMatches) stopOpts.push(['custom', `Detener al encontrar ${o.defaults.maxMatches} (personalizado)`]);
    const bCard = h('div', { class: 'mini', style: 'margin-bottom:12px' }, h('h4', { text: 'Presupuesto de búsqueda (editable)' }),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Resultados deseados' }), sel(ANALYSIS.stopOptions.map((n) => [n, n]), S.desired, (v) => { S.desired = Number(v); if (S.stop.startsWith('n') && S.stop !== 'none' && S.stop !== 'custom') S.stop = 'n' + v; if (!S.edited) { seedBudget(); } render(); })),
        h('label', { class: 'field' }, h('span', { text: 'Parada' }), sel(stopOpts, S.stop, (v) => { S.stop = v; if (/^n\d+$/.test(v)) { S.desired = Number(v.slice(1)); } render(); }))),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, h('span', { text: 'Primer análisis (semillas)' }), num(S.seedsInitial, (v) => { S.seedsInitial = v; })),
        h('label', { class: 'field' }, h('span', { text: 'Límite ampliado (semillas)' }), num(S.seedsMax, (v) => { S.seedsMax = v; })),
        h('label', { class: 'field' }, h('span', { text: 'Tiempo máximo (min)' }), num(S.maxMinutes, (v) => { S.maxMinutes = v; }, 90))),
      live, h('p', { class: 'muted small-text', text: S.seedsMax === 0 ? 'Límite de semillas 0 = sin límite: la búsqueda solo termina por tiempo, por resultados o al pulsar Cancelar.' : `El primer análisis marca un punto de control; la búsqueda sigue hasta el límite ampliado salvo que se cumpla la parada. Los resultados aparecen al instante.` }));

    // --- tabla de etapas
    const stRows = an.stages.map((s, i) => {
      const f = est.factors?.[i]; const sp = s.ms > 0 ? (s.n / s.ms) * 1000 : null;
      return h('tr', {}, h('td', { 'data-label': '#', text: i + 1 }), h('td', { 'data-label': 'Condición', text: s.label }), h('td', { 'data-label': 'Llegaron', text: fmtInt(s.n) }), h('td', { 'data-label': 'Pasaron', text: fmtInt(s.k) }),
        h('td', { 'data-label': 'P(condicional)', text: s.n ? (s.k ? `${formatPercent(s.k / s.n)} (${formatOneIn(s.k / s.n)})` : '0 observados') : '—' }),
        h('td', { 'data-label': 'Contribución', text: f?.share !== null && f?.share !== undefined ? fmtNum(Math.max(0, 100 * f.share), 0) + ' %' : '—' }),
        h('td', { 'data-label': 'Velocidad de la etapa', text: sp ? fmtNum(sp, 0) + ' semillas/s' : '—' }));
    });
    const stCard = h('div', { class: 'mini', style: 'margin-bottom:12px' }, h('h4', { text: 'Condiciones y rendimiento de cada etapa del filtro' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl compact stack' }, h('thead', {}, h('tr', {}, ['#', 'Condición', 'Llegaron', 'Pasaron', 'P(condicional)', 'Contribución', 'Velocidad de la etapa'].map((t) => h('th', { text: t })))), h('tbody', {}, stRows))),
      h('p', { class: 'muted small-text', text: 'Cada etapa solo cuenta las semillas que superaron las anteriores (regla de la cadena): la contribución es condicional y depende del orden de evaluación; no se multiplican probabilidades individuales.' }));

    // --- tabla de exito
    const b = buildBudget({ est, speed: an.speed, desired: S.desired, maxMinutes: S.maxMinutes });
    const okCard = h('div', { class: 'mini', style: 'margin-bottom:12px' }, h('h4', { text: `Probabilidad de éxito: P = 1 − (1 − p)^N  ·  al menos ${S.desired} resultado(s)` }));
    if (b.rows.length) {
      okCard.append(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl compact stack' }, h('thead', {}, h('tr', {}, ['Objetivo', 'Semillas necesarias', 'Rango (IC de p)', 'Tiempo (medido)'].map((t) => h('th', { text: t })))),
        h('tbody', {}, b.rows.map((r) => h('tr', {}, h('td', { 'data-label': 'Objetivo', text: (r.q * 100).toLocaleString('es-ES') + ' %' }), h('td', { 'data-label': 'Semillas', text: compact(r.seeds) }), h('td', { 'data-label': 'Rango', text: `${compact(r.seedsOpt)} – ${compact(r.seedsPes)}` }), h('td', { 'data-label': 'Tiempo', text: `${fmtDuration(r.seconds)}${r.seconds !== null ? ` (${fmtDuration(r.secondsOpt)} – ${fmtDuration(r.secondsPes)})` : ''}` })))))),
        h('p', { class: 'muted small-text', text: 'Válido para muestreo aleatorio uniforme. No es una garantía: es la probabilidad bajo el modelo y la estimación de p mostrados.' }));
    } else okCard.append(h('p', { text: 'No se muestran porcentajes de éxito: sin una frecuencia estimada el modelo no es aplicable y presentarlos sería una promesa sin base.' }),
      est.upper ? h('p', { class: 'muted small-text', text: `Como mucho: con ${compact(S.seedsMax || b.seedsMax || 0)} semillas la probabilidad de éxito no superaría ${pct(b.successUpperMax)}.` }) : null);

    // --- explicacion y avisos
    const exCard = h('div', { class: 'mini' }, h('h4', { text: 'Por qué tiene esta rareza' }), ...an.explanation.map((t) => h('p', { class: 'small-text', text: t })),
      h('p', { class: 'muted small-text', text: 'Las categorías de rareza son propias de SeedHunter y configurables; no son una clasificación oficial de Minecraft.' }));
    const wCard = h('div', { class: 'mini' }, h('h4', { text: 'Advertencias y recursos' }), h('ul', { class: 'warnlist' }, an.warnings.map((w) => h('li', { text: w }))), h('ul', { class: 'warnlist muted' }, an.resources.map((w) => h('li', { text: w }))));

    const head = h('div', { class: 'mini', style: 'margin-bottom:12px' }, h('div', { class: 'fields' },
      h('label', { class: 'field', style: 'flex:1 1 260px' }, h('span', { text: 'Nombre de la búsqueda' }), h('input', { type: 'text', maxlength: 60, value: S.name, on: { input: (e) => { S.name = e.target.value; } } })),
      h('label', { class: 'field' }, h('span', { text: 'Calidad del análisis' }), sel([['fast', 'Rápido (3 s)'], ['normal', 'Normal (8 s)'], ['deep', 'Profundo (20 s)']], S.quality, (v) => { S.quality = v; })),
      h('button', { class: 'btn small', text: 'Volver a medir', on: { click: () => analyze() } })),
      h('div', { class: 'muted small-text', text: `${o.summary.version} · modo ${o.summary.mode} · ${o.summary.domain}` }),
      h('ul', { class: 'warnlist' }, o.summary.leaves.map((t) => h('li', { text: t }))),
      ...(o.extraWarnings || []).map((t) => h('div', { class: 'notice warn small-text', text: t })));

    body.replaceChildren(head, h('div', { class: 'cards' }, rareCard, vCard, dCard), bCard, okCard, stCard, h('div', { class: 'cards', style: 'margin-top:12px' }, exCard, wCard));

    const forceBox = imp.unsat ? h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: S.force, on: { change: (e) => { S.force = e.target.checked; start.disabled = !S.force; } } }), ' Buscar igualmente') : null;
    const start = h('button', { class: 'btn primary', text: 'INICIAR BÚSQUEDA', disabled: imp.unsat && !S.force, on: { click: () => {
      const stop = S.stop, mm = /^n\d+$/.test(stop) ? Number(stop.slice(1)) : stop === 'custom' ? o.defaults.maxMatches : null;
      const choice = { name: S.name.trim() || 'Búsqueda', stop, desired: S.desired, maxMatches: mm, maxSeeds: stop === 'manual' ? 0 : S.seedsMax, checkpoint: stop === 'manual' ? 0 : S.seedsInitial,
        maxTimeMs: stop === 'manual' || !S.maxMinutes ? null : S.maxMinutes * 60000, sortRare: stop === 'more' };
      dlg.close(); o.onStart(choice, S.analysis);
    } } });
    setFoot(forceBox, modifyBtn(), start);
  }

  analyze();
  return dlg;
}
