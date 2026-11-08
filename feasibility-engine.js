// Motor de viabilidad y rareza previa. Funciones puras (sin DOM): se usan en la interfaz y en tests.js.
//
// Principios:
//  - NUNCA se inventa una probabilidad. Cada cifra declara su fuente (SOURCES) y su fiabilidad.
//  - La frecuencia de la combinacion se estima con la REGLA DE LA CADENA sobre las etapas reales del filtro:
//      p = P(E1) * P(E2 | E1) * P(E3 | E1,E2) ...   (cada factor se mide solo con semillas que superaron las etapas previas).
//    Es una identidad exacta: no supone independencia. Lo unico que se asume es el muestreo aleatorio uniforme.
//  - Solo se declara "imposible" con una demostracion basada en reglas de generacion (analyzeImpossibility).
import { CI_Z } from './configuration.js';
import { stagesOf } from './search-engine.js';
import { describeLeaf, formatPercent, formatOneIn, classify, upperBoundZero } from './rarity-engine.js';
import { fmtInt, fmtNum } from './utilities.js';
import { structById } from './structure-engine.js';
import { biomeName, BIOMES } from './biome-engine.js';

export const SOURCES = {
  official: { rank: 1, label: 'Probabilidad oficial conocida', short: 'Oficial' },
  math: { rank: 2, label: 'Probabilidad calculada matemáticamente', short: 'Calculada' },
  empirical: { rank: 3, label: 'Estimación basada en datos empíricos', short: 'Empírica' },
  preliminary: { rank: 4, label: 'Estimación preliminar con incertidumbre elevada', short: 'Preliminar' },
  unknown: { rank: 5, label: 'Probabilidad desconocida por falta de datos', short: 'Desconocida' },
};
export const OFFICIAL_NOTE = 'Mojang no publica probabilidades oficiales para combinaciones de semillas, así que ninguna cifra se presenta como oficial. Solo se usan sus parámetros de generación (espaciado y separación) para demostrar incompatibilidades geométricas.';

export const VERDICTS = {
  A: { code: 'A', tone: 'bad', label: 'Imposible por reglas del juego' },
  B: { code: 'B', tone: 'bad', label: 'Incompatible con la versión o edición seleccionada' },
  C: { code: 'C', tone: 'bad', label: 'Geométricamente incompatible' },
  D: { code: 'D', tone: 'warn', label: 'Posible, pero extremadamente raro' },
  E: { code: 'E', tone: 'warn', label: 'Posible, pero sin datos suficientes para estimar su frecuencia' },
  F: { code: 'F', tone: 'warn', label: 'No encontrado después de agotar el presupuesto de búsqueda' },
  OK: { code: 'OK', tone: 'good', label: 'Posible' },
  U: { code: 'U', tone: 'warn', label: 'Viabilidad desconocida: no existen datos suficientes para demostrar que sea imposible' },
};

// ---------- matematicas de probabilidad ----------
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (let j = 0; j < 6; j++) { y += 1; s += c[j] / y; }
  return -t + Math.log((2.5066282746310005 * s) / x);
}
/** P(X >= m) con X ~ Binomial(N, p). Para m = 1 es exactamente 1 - (1 - p)^N. */
export function probAtLeast(m, p, N) {
  if (!(p > 0) || m > N) return 0;
  if (p >= 1) return 1;
  if (m <= 0) return 1;
  const lq = Math.log1p(-p);
  if (m === 1) return -Math.expm1(N * lq);
  const lp = Math.log(p); let below = 0;
  for (let k = 0; k < m; k++) {
    let lc = 0; for (let i = 0; i < k; i++) lc += Math.log(N - i);
    lc -= lgamma(k + 1);
    below += Math.exp(lc + k * lp + (N - k) * lq);
  }
  return Math.min(1, Math.max(0, 1 - below));
}
/** P(exito) = 1 - (1 - p)^N : probabilidad de encontrar AL MENOS una coincidencia. */
export const successProbability = (p, N) => probAtLeast(1, p, N);
/** Numero minimo de semillas para encontrar >= m coincidencias con probabilidad >= q. */
export function seedsForSuccess(m, p, q) {
  if (!(p > 0)) return Infinity;
  if (p >= 1) return m;
  let hi = Math.max(m, Math.ceil(1 / p));
  while (probAtLeast(m, p, hi) < q) { hi *= 2; if (hi > 1e18) return Infinity; }
  let lo = m - 1;
  for (let i = 0; i < 100 && hi - lo > 1; i++) { const mid = Math.floor((lo + hi) / 2); if (probAtLeast(m, p, mid) >= q) hi = mid; else lo = mid; }
  return hi;
}
export const SUCCESS_TARGETS = [0.5, 0.75, 0.9, 0.95, 0.99, 0.999];

export function fmtDuration(sec) {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 1) return '< 1 s';
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${fmtNum(sec / 60, sec < 600 ? 1 : 0)} min`;
  if (sec < 172800) return `${fmtNum(sec / 3600, 1)} h`;
  if (sec < 86400 * 365) return `${fmtNum(sec / 86400, 1)} días`;
  const y = sec / (86400 * 365);
  return y > 1e6 ? 'más de un millón de años' : `${fmtNum(y, y < 10 ? 1 : 0)} años`;
}

// ---------- imposibilidad (A, B, C) ----------
/** Cota superior de intentos de generacion de una estructura dentro de un disco de radio R (cualquier posicion). */
export function maxAttemptsInDisc(cfg, R) {
  const rb = cfg.regionSize * 16, span = (cfg.chunkRange - 1) * 16;
  const n = Math.floor((2 * R + span) / rb) + 1;
  return n * n;
}
/** Distancia minima entre intentos de DOS regiones distintas de la misma estructura (0 si no se puede garantizar). */
export function minAttemptDistance(cfg) {
  const gap = cfg.regionSize - (cfg.chunkRange - 1);
  return gap >= 1 ? gap * 16 : 0;
}

const active = (n) => n.enabled !== false && !(n.kind === 'leaf' && n.optional);

/**
 * info = { structCfg(id)->cfg|null, biomeExists(id)->bool, overworldBiomeCount, maxStrongholds }
 * Devuelve { unsat, code, text, findings:[{code,text}], warnings:[string] }.
 * Un hallazgo solo se emite con demostracion; las limitaciones de la herramienta van a warnings.
 */
export function analyzeImpossibility(root, info) {
  const warnings = [];
  const w = (t) => { if (!warnings.includes(t)) warnings.push(t); };

  function leafProof(l) {
    switch (l.cond) {
      case 'structure': {
        const s = structById(l.struct);
        if (!s) return { code: 'B', text: 'La estructura elegida no existe en el catálogo.' };
        if (!info.structCfg(l.struct)) return { code: 'B', text: `«${s.label}» no existe en esta versión de Minecraft: no puede generarse.` };
        const min = l.minCount ?? 1;
        if (l.maxCount != null && l.maxCount < min) return { code: 'A', text: `Contradicción lógica: cantidad máxima (${l.maxCount}) menor que la mínima (${min}).` };
        if ((l.minDist || 0) > l.radius) return { code: 'C', text: `Distancia mínima (${fmtInt(l.minDist)}) mayor que el radio (${fmtInt(l.radius)}): el anillo está vacío.` };
        const cfg = info.structCfg(l.struct), bound = maxAttemptsInDisc(cfg, l.radius);
        if (min > bound) return { code: 'C', text: `En un círculo de radio ${fmtInt(l.radius)} caben como máximo ${fmtInt(bound)} puntos de generación de «${s.label}» (regiones de ${cfg.regionSize * 16} bloques, un intento por región), y pides ${fmtInt(min)}.` };
        return null;
      }
      case 'stronghold': {
        if ((l.minCount ?? 1) > info.maxStrongholds) return { code: 'A', text: `Solo existen ${info.maxStrongholds} fortalezas por mundo en esta versión; pides ${l.minCount}.` };
        return null;
      }
      case 'spawnBiome': case 'biomeArea': {
        const ids = l.biomes || [];
        if (!ids.length) return null;
        const any = ids.some((b) => info.biomeExists(b)), all = ids.every((b) => info.biomeExists(b));
        if (!any) return { code: 'B', text: `Ninguno de los biomas elegidos existe en esta versión (${ids.map(biomeName).join(', ')}).` };
        if (l.cond === 'biomeArea' && l.match === 'all' && !all) return { code: 'B', text: `Exiges todos los biomas, pero ${ids.filter((b) => !info.biomeExists(b)).map(biomeName).join(', ')} no existe(n) en esta versión.` };
        if (l.cond === 'biomeArea' && (l.minPct || 0) > 100) return { code: 'A', text: 'Una cobertura superior al 100 % es imposible por definición.' };
        return null;
      }
      case 'biomeDiversity': {
        if (l.minDistinct > info.overworldBiomeCount) return { code: 'A', text: `Pides ${l.minDistinct} biomas distintos, pero esta versión solo tiene ${info.overworldBiomeCount}.` };
        return null;
      }
      case 'structureNear': {
        const a = structById(l.typeA), b = structById(l.typeB);
        if (!info.structCfg(l.typeA)) return { code: 'B', text: `«${a?.label}» no existe en esta versión.` };
        if (!info.structCfg(l.typeB)) return { code: 'B', text: `«${b?.label}» no existe en esta versión.` };
        if (l.typeA === l.typeB) {
          const m = minAttemptDistance(info.structCfg(l.typeA));
          if (m > l.maxDist) return { code: 'C', text: `Dos «${a.label}» distintas nunca pueden estar a menos de ${fmtInt(m)} bloques (espaciado de generación de ${info.structCfg(l.typeA).regionSize} chunks); pides ≤ ${fmtInt(l.maxDist)}.` };
        }
        if (a.dim !== b.dim) w('Estructuras de dimensiones distintas: las coordenadas no se convierten (Nether = Overworld ÷ 8); la distancia no es comparable.');
        return null;
      }
      default: return null;
    }
  }

  function siblings(n) {
    // Dos condiciones de bioma de spawn en un AND con conjuntos disjuntos: el spawn tiene un unico bioma.
    const spawns = n.children.filter((c) => active(c) && c.kind === 'leaf' && c.cond === 'spawnBiome' && c.biomes?.length);
    for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) {
      if (!spawns[i].biomes.some((b) => spawns[j].biomes.includes(b))) return { code: 'A', text: 'Dos condiciones exigen que el spawn esté en conjuntos de biomas disjuntos: el spawn está en un único bioma.' };
    }
    return null;
  }

  function walk(n) {
    if (!active(n)) return null;
    if (n.kind === 'leaf') {
      const hit = leafProof(n);
      if (n.cond === 'biomeDiversity') w('La diversidad de biomas se mide por muestreo de celdas; en radios pequeños puede subestimarse.');
      if (n.cond === 'stronghold' || n.center === 'spawn') w('El spawn usado es una estimación de Cubiomes (el real depende de bloques de hierba).');
      return hit;
    }
    const kids = n.children.filter(active);
    if (n.op === 'AND') { for (const k of kids) { const h = walk(k); if (h) return h; } return siblings(n); }
    if (n.op === 'OR') { if (!kids.length) return null; const hs = kids.map(walk); return hs.every(Boolean) ? { code: hs[0].code, text: `Todas las alternativas del grupo OR son imposibles. Ejemplo: ${hs[0].text}` } : null; }
    kids.forEach(walk); return null; // NOT: no se intenta demostrar tautologias
  }
  const hit = walk(root);
  return { unsat: !!hit, code: hit?.code || null, text: hit?.text || '', findings: hit ? [hit] : [], warnings };
}

// ---------- estimacion por etapas ----------
/** Etiquetas legibles de cada etapa (hijos del AND raiz, o la raiz entera). */
export function stageLabels(compiled) {
  const lab = (n) => (n.kind === 'leaf' ? describeLeaf(n) : `${n.op}(${n.children.map(lab).join(' · ')})`);
  return stagesOf(compiled).map(lab);
}

/**
 * stages: [{label, n, k, ms}] medidos en orden de evaluacion. Cada n_i cuenta solo semillas que llegaron a la etapa i.
 * kind: 'estimate' | 'upper' | 'none'.
 */
export function estimateFromStages(stages) {
  if (!stages.length) return { kind: 'estimate', p: 1, lo: 1, hi: 1, source: 'math', note: 'Sin condiciones que filtren: toda semilla cumple.', factors: [] };
  let p = 1, varLog = 0, minK = Infinity, totalN = stages[0].n;
  const factors = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.n === 0) {
      return { kind: i === 0 ? 'none' : 'upper', upper: i === 0 ? null : p, source: 'unknown', factors, firstN: totalN, note: i === 0 ? 'No se ha podido muestrear ninguna semilla.' : `La etapa ${i + 1} no llegó a muestrearse; la frecuencia no puede superar la de las etapas anteriores.` };
    }
    if (s.k === 0) {
      const ub = p * upperBoundZero(s.n);
      factors.push({ index: i, label: s.label, n: s.n, k: 0, p: null, ms: s.ms });
      return { kind: 'upper', upper: ub, source: 'unknown', factors, firstN: totalN, zeroStage: i, note: `0 de ${fmtInt(s.n)} semillas que superaron las etapas previas cumplen la etapa ${i + 1}. No se observó ninguna coincidencia: solo se puede dar una cota superior.` };
    }
    const pi = s.k / s.n;
    p *= pi; varLog += (1 - pi) / s.k; minK = Math.min(minK, s.k);
    factors.push({ index: i, label: s.label, n: s.n, k: s.k, p: pi, ms: s.ms });
  }
  const sigma = Math.sqrt(varLog), lo = p * Math.exp(-CI_Z * sigma), hi = Math.min(1, p * Math.exp(CI_Z * sigma));
  const lp = Math.log(p);
  for (const f of factors) f.share = lp < -1e-9 ? Math.log(f.p) / lp : null; // contribucion condicional a -ln(p)
  const source = minK >= 30 ? 'empirical' : 'preliminary';
  return { kind: 'estimate', p, lo, hi, sigma, minK, source, factors, firstN: totalN,
    note: `Regla de la cadena sobre ${stages.length} etapa(s); etapa con menos datos: ${fmtInt(minK)} aciertos. IC 95 % por método delta sobre log p.` };
}

export function difficultyFor(seconds) {
  if (!Number.isFinite(seconds)) return { level: 6, label: 'Desconocida o impracticable', text: 'No se puede acotar el esfuerzo con los datos actuales.' };
  if (seconds < 10) return { level: 1, label: 'Trivial', text: 'Segundos.' };
  if (seconds < 90) return { level: 2, label: 'Fácil', text: 'Menos de un par de minutos.' };
  if (seconds < 900) return { level: 3, label: 'Moderada', text: 'Algunos minutos.' };
  if (seconds < 7200) return { level: 4, label: 'Alta', text: 'Hasta un par de horas: conviene dejar la pestaña abierta y en primer plano.' };
  if (seconds < 86400) return { level: 5, label: 'Muy alta', text: 'Muchas horas en el navegador.' };
  return { level: 6, label: 'Extrema', text: 'Probablemente impracticable en un navegador.' };
}

export function recommendEngine({ cpu, gpu, workers, simd, speed }) {
  const parts = [`WebAssembly${simd ? ' + SIMD' : ''} en ${workers} worker(s)`];
  const why = ['La generación de mundo (ruido por octavas, capas de enteros, aritmética de 64 bits, ramas) se ejecuta en CPU/WebAssembly.'];
  if (gpu?.supported) why.push('WebGPU está disponible, pero no se recomienda para generación de mundo y no se usa: no está demostrado que sea más rápida que la CPU para este cálculo.');
  else why.push('WebGPU no está disponible; no es un problema para este motor.');
  if (!cpu.coresKnown) why.push('El navegador no expone el número de núcleos; se asumen 4.');
  return { engine: parts[0], gpuUsed: false, reasons: why, measuredSpeed: speed };
}

/** Presupuesto a partir de la estimacion, la velocidad medida y las preferencias. */
export function buildBudget({ est, speed, desired = 1, maxMinutes = 30 }) {
  const out = { desired, maxMinutes, speed, kind: est.kind, capSeeds: speed ? speed * maxMinutes * 60 : null };
  if (est.kind !== 'estimate' || !(est.p > 0)) {
    out.upper = est.upper ?? null;
    out.seedsInitial = speed ? Math.round(speed * 60 * Math.min(5, maxMinutes)) : null; // exploracion por tiempo
    out.seedsMax = out.capSeeds ? Math.round(out.capSeeds) : null;
    out.basis = 'time';
    out.rows = [];
    out.timeInitial = speed ? out.seedsInitial / speed : null; out.timeMax = maxMinutes * 60;
    out.successInitial = null; out.successMax = null;
    if (est.upper) { out.successUpperInitial = out.seedsInitial ? probAtLeast(desired, est.upper, out.seedsInitial) : null; out.successUpperMax = out.seedsMax ? probAtLeast(desired, est.upper, out.seedsMax) : null; }
    return out;
  }
  const p = est.p;
  out.basis = 'model';
  out.seedsInitial = seedsForSuccess(desired, p, 0.9);
  out.seedsMax = seedsForSuccess(desired, p, 0.99);
  out.timeInitial = speed ? out.seedsInitial / speed : null; out.timeMax = speed ? out.seedsMax / speed : null;
  out.successInitial = probAtLeast(desired, p, out.seedsInitial); out.successMax = probAtLeast(desired, p, out.seedsMax);
  out.rows = SUCCESS_TARGETS.map((q) => {
    const seeds = seedsForSuccess(desired, p, q), seedsOpt = seedsForSuccess(desired, est.hi, q), seedsPes = seedsForSuccess(desired, est.lo, q);
    return { q, seeds, seedsOpt, seedsPes, seconds: speed ? seeds / speed : null, secondsOpt: speed ? seedsOpt / speed : null, secondsPes: speed ? seedsPes / speed : null };
  });
  return out;
}
/** P(>= desired resultados) para un N elegido por el usuario, con intervalo segun el IC de p. */
export function successFor(est, desired, N) {
  if (est.kind !== 'estimate') return { p: null, lo: null, hi: null, upperOnly: est.upper ? probAtLeast(desired, est.upper, N) : null };
  return { p: probAtLeast(desired, est.p, N), lo: probAtLeast(desired, est.lo, N), hi: probAtLeast(desired, est.hi, N) };
}

/** Veredicto A-F / OK / U. calib: { leaves: { id: {pass} } } opcional. */
export function verdictFor({ imp, est, tiers, rootLeafIds = [], calib = null, pilotMatches = 0 }) {
  if (imp.unsat) return { ...VERDICTS[imp.code], detail: imp.text, proven: true };
  if (est.kind === 'estimate') {
    const tier = classify(est.p, tiers), idx = tiers.findIndex((t) => t.label === tier.label);
    if (idx >= 4 || est.p <= 1e-6) return { ...VERDICTS.D, detail: `Frecuencia estimada ${formatOneIn(est.p)}. Se puede buscar igualmente.` };
    return { ...VERDICTS.OK, detail: pilotMatches ? 'Se han observado semillas que cumplen todas las condiciones.' : 'Cada etapa se ha observado y la combinación es alcanzable.' };
  }
  const seenAll = calib && rootLeafIds.length && rootLeafIds.every((id) => (calib.leaves?.[id]?.pass || 0) > 0);
  if (seenAll) return { ...VERDICTS.E, detail: 'Cada condición se ha visto por separado, pero la combinación completa no se ha observado en el piloto.' };
  return { ...VERDICTS.U, detail: est.note || '' };
}
export const postSearchVerdict = (examined) => ({ ...VERDICTS.F, detail: `Se examinaron ${fmtInt(examined)} semillas sin coincidencias. Esto NO demuestra que sea imposible.` });

/** Explicacion automatica de POR QUE la combinacion tiene esa rareza. Devuelve lista de frases. */
export function explainRarity({ est, tier, factors }) {
  const lines = [];
  const conds = (factors || []).filter((f) => f.label).map((f) => f.label);
  if (est.kind === 'estimate' && est.p < 1) {
    lines.push(`Esta combinación es ${tier ? tier.label.toLowerCase() : 'de rareza no clasificada'} (${formatOneIn(est.p)}) porque requiere que se cumplan a la vez: ${conds.join('; ')}.`);
    const ranked = (factors || []).filter((f) => f.share !== null && f.share !== undefined).sort((a, b) => b.share - a.share);
    if (ranked.length) {
      const f = ranked[0];
      lines.push(`La condición que más contribuye es «${f.label}»: entre las semillas que superan las etapas anteriores, solo la cumple 1 de cada ${fmtInt(1 / f.p)} (${fmtNum(100 * f.share, 0)} % del esfuerzo logarítmico).`);
    }
    lines.push('La contribución de cada condición se mide de forma condicional y en el orden de evaluación (regla de la cadena); no se multiplican probabilidades individuales ni se supone independencia entre ellas.');
  } else if (est.kind === 'upper') {
    lines.push(`No se observó ninguna semilla que cumpla la combinación; con 95 % de confianza su frecuencia es menor que ${formatPercent(est.upper)} (${formatOneIn(est.upper)} o más frecuente). No es una estimación de la frecuencia real.`);
    if (conds.length) lines.push(`Condiciones: ${conds.join('; ')}.`);
  } else lines.push('No hay datos para explicar la rareza todavía.');
  return lines;
}

/** Orquestador: junta todo en un objeto para la interfaz. */
export function makeAnalysis({ rules, compiled, info, pilot, tiers, cpu, gpu, plan, desired = 1, maxMinutes = 30 }) {
  const imp = analyzeImpossibility(rules, info);
  const labels = stageLabels(compiled);
  const stages = (pilot?.stages || labels.map(() => ({ n: 0, k: 0, ms: 0 }))).map((s, i) => ({ ...s, label: labels[i] }));
  const est = pilot ? estimateFromStages(stages) : { kind: 'none', source: 'unknown', upper: null, factors: [], note: 'Aún no se ha medido nada.' };
  const tier = est.kind === 'estimate' ? classify(est.p, tiers) : null;
  const speed = pilot?.speed || null;
  const leafIds = compiled.leaves.filter((l) => !l.optional).map((l) => l.id);
  const verdict = verdictFor({ imp, est, tiers, rootLeafIds: leafIds, calib: pilot?.calib, pilotMatches: pilot?.matches || 0 });
  const budget = buildBudget({ est, speed, desired, maxMinutes });
  const diff = difficultyFor(budget.basis === 'model' ? budget.timeMax : est.kind === 'estimate' ? null : Infinity);
  const engine = recommendEngine({ cpu, gpu, workers: plan.workers, simd: plan.simd, speed });
  const warnings = [...imp.warnings];
  if (est.source === 'preliminary') warnings.push('La estimación es preliminar: alguna etapa tiene pocos aciertos y la incertidumbre es elevada. Úsala solo como orden de magnitud.');
  if (est.kind !== 'estimate' && !imp.unsat) warnings.push('Sin frecuencia estimada no se pueden prometer porcentajes de éxito. Se propone explorar por tiempo y revisar resultados parciales.');
  if (pilot && pilot.examined < 200) warnings.push('El piloto examinó pocas semillas; repite el análisis con más calidad para una estimación más fiable.');
  if (budget.basis === 'model' && budget.timeMax > 6 * 3600) warnings.push('El tiempo estimado es muy largo para un navegador: considera relajar condiciones o aceptar una probabilidad de éxito menor.');
  warnings.push('El modelo 1-(1-p)^N exige semillas independientes y uniformes: es válido para muestreo aleatorio; en intervalos secuenciales es solo una aproximación.');
  const memMB = plan.workers * 40;
  const resources = [`Memoria estimada: ~${memMB} MB (${plan.workers} worker(s) × ~40 MB de WebAssembly).`, `Velocidad medida en este equipo: ${speed ? fmtNum(speed, 0) + ' seeds/s' : 'sin medir'}.`, 'Mantén la pestaña visible: los navegadores reducen la prioridad de las pestañas en segundo plano.'];
  return { imp, est, tier, verdict, budget, difficulty: diff, engine, warnings, resources, stages, speed, labels,
    explanation: explainRarity({ est, tier, factors: est.factors }), source: SOURCES[est.source] };
}

/** Informacion de version para analyzeImpossibility a partir de un WasmEngine ya configurado (setup). */
export function engineInfo(engine) {
  const NON_OVERWORLD = /nether_wastes|crimson_forest|warped_forest|soul_sand_valley|basalt_deltas|the_end|end_highlands|end_midlands|end_barrens|small_end_islands/;
  const ow = BIOMES.filter((b) => !NON_OVERWORLD.test(b.key) && engine.biomeExists(b.id)).length;
  engine.apply(0, 1n);
  return { structCfg: (id) => engine.structCfg(id), biomeExists: (id) => engine.biomeExists(id), overworldBiomeCount: ow, maxStrongholds: engine.strongholds(256).length };
}
