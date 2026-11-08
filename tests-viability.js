// Pruebas del motor de viabilidad / rareza previa. Ejecutar: node tests-viability.js
import fs from 'node:fs';
import { WasmEngine } from './wasm-engine.js';
import { VERSIONS } from './minecraft-versions.js';
import { structByKey } from './structure-engine.js';
import { compileRules, evaluateSeed, stagesOf, scanStructure, makeContext } from './search-engine.js';
import { classify } from './rarity-engine.js';
import { DEFAULT_RARITY_TIERS } from './configuration.js';
import { biomeId } from './biome-engine.js';
import * as F from './feasibility-engine.js';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };
const close = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const V = (key) => VERSIONS.find((v) => v.key === key).id;
const e = await WasmEngine.fromBytes(fs.readFileSync('seedhunter-engine.wasm'));
const S = (k) => structByKey(k).id;
const leaf = (id, extra) => ({ kind: 'leaf', id, enabled: true, center: 'spawn', ...extra });
const grp = (op, children, id = 'r') => ({ kind: 'group', op, id, enabled: true, children });
const stLeaf = (id, key, o = {}) => leaf(id, { cond: 'structure', struct: S(key), minCount: 1, radius: 800, ...o });

console.log('Probabilidad de exito  P = 1 - (1 - p)^N');
ok(close(F.successProbability(1e-7, 1e7), 1 - Math.exp(-1), 1e-6), '1-(1-1e-7)^1e7 = 1-1/e');
ok(close(F.successProbability(0.5, 3), 0.875), 'p=0.5, N=3 => 0.875');
ok(close(F.probAtLeast(2, 0.5, 3), 0.5, 1e-9), 'Binomial exacta: P(X>=2) con N=3, p=0.5 = 0.5');
ok(close(F.probAtLeast(3, 1e-6, 3e6), 1 - Math.exp(-3) * (1 + 3 + 4.5), 1e-3), 'P(X>=3) ~ cola de Poisson(3) = 0.5768');
ok(close(F.seedsForSuccess(1, 1e-6, 0.95), Math.log(0.05) / Math.log1p(-1e-6), 1e-4), 'N para 95 % con p=1e-6 ~ 2,9957 M');
ok(F.probAtLeast(1, 1e-6, F.seedsForSuccess(1, 1e-6, 0.99)) >= 0.99, 'El N calculado alcanza el objetivo del 99 %');
ok(F.probAtLeast(1, 1e-6, F.seedsForSuccess(1, 1e-6, 0.99) - 1) < 0.99, 'Y N-1 no lo alcanza (minimo exacto)');
ok(F.seedsForSuccess(5, 0.5, 0.9) <= 14 && F.seedsForSuccess(5, 0.5, 0.9) >= 5, 'Varios resultados con p alto: N razonable');
ok(F.seedsForSuccess(1, 0, 0.9) === Infinity, 'p = 0 => infinitas semillas (no se inventa un numero)');
ok(F.fmtDuration(45) === '45 s' && F.fmtDuration(7200).includes('h') && F.fmtDuration(Infinity) === '—', 'Formato de duraciones');

console.log('Clasificacion de rareza (7 categorias, configurables)');
const cl = (p) => classify(p, DEFAULT_RARITY_TIERS).label;
ok(cl(0.05) === 'Normal' && cl(1e-3) === 'Poco común' && cl(5e-5) === 'Rara' && cl(5e-6) === 'Muy rara', 'Normal / Poco común / Rara / Muy rara');
ok(cl(5e-7) === 'Extremadamente rara' && cl(5e-8) === 'Ultra rara' && cl(1e-10) === 'Extraordinariamente rara', 'Extremadamente / Ultra / Extraordinariamente rara');
ok(DEFAULT_RARITY_TIERS.length === 7, 'Hay 7 categorias');
const custom = DEFAULT_RARITY_TIERS.map((t) => (t.label === 'Rara' ? { ...t, minP: 1e-3 } : t));
ok(classify(2e-3, custom).label === 'Rara' && classify(2e-3, DEFAULT_RARITY_TIERS).label === 'Poco común', 'Los umbrales se pueden reconfigurar');

console.log('Estimacion por etapas (regla de la cadena)');
{
  const a = F.estimateFromStages([{ label: 'A', n: 1000, k: 100, ms: 1 }, { label: 'B', n: 100, k: 10, ms: 1 }]);
  ok(a.kind === 'estimate' && close(a.p, 0.01, 1e-9), 'p = 0,1 x 0,1 = 0,01');
  ok(close(a.sigma, Math.sqrt(0.9 / 100 + 0.9 / 10), 1e-9) && a.lo < 0.01 && a.hi > 0.01, 'Intervalo de confianza alrededor de p');
  ok(a.source === 'preliminary', 'Pocos aciertos (10) => preliminar con incertidumbre elevada');
  const b = F.estimateFromStages([{ label: 'A', n: 3000, k: 300 }, { label: 'B', n: 300, k: 90 }]);
  ok(b.source === 'empirical' && close(b.p, 0.03, 1e-9), 'Muchos aciertos => empirica');
  ok(close(b.factors[0].share + b.factors[1].share, 1, 1e-9), 'Las contribuciones condicionales suman 100 %');
  const z = F.estimateFromStages([{ label: 'A', n: 1000, k: 100 }, { label: 'B', n: 100, k: 0 }]);
  ok(z.kind === 'upper' && !('p' in z) && z.source === 'unknown' && close(z.upper, 0.1 * (1 - Math.pow(0.05, 1 / 100)), 1e-9), 'Cero aciertos: solo cota superior, sin frecuencia inventada');
  const u = F.estimateFromStages([{ label: 'A', n: 100, k: 5 }, { label: 'B', n: 0, k: 0 }]);
  ok(u.kind === 'upper' && close(u.upper, 0.05, 1e-9), 'Etapa no alcanzada: cota = etapas previas');
  ok(F.estimateFromStages([{ label: 'A', n: 0, k: 0 }]).kind === 'none', 'Sin muestras: sin estimacion');
  ok(F.SOURCES.official.label === 'Probabilidad oficial conocida' && F.estimateFromStages([{ n: 10, k: 5 }]).source !== 'official', 'Nunca se presenta una estimacion como dato oficial');
}

console.log('No se asume independencia: condiciones totalmente correlacionadas');
{
  e.setup(V('MC_1_21_1'));
  const rules = grp('AND', [stLeaf('a', 'Village', { radius: 600 }), stLeaf('b', 'Village', { radius: 600 })]);
  const c = compileRules(rules), st = stagesOf(c).map(() => ({ n: 0, k: 0, ms: 0 }));
  for (let s = 0n; s < 500n; s++) evaluateSeed(e, c, s, 'normal', false, st);
  ok(st[1].n === st[0].k && st[1].k === st[1].n, 'P(B|A) = 1 cuando B es identica a A (el filtro lo mide, no lo supone)');
  const est = F.estimateFromStages(st.map((x, i) => ({ ...x, label: 'v' + i })));
  const pA = st[0].k / st[0].n;
  ok(close(est.p, pA, 1e-9) && est.p > pA * pA * 1.5, `Frecuencia conjunta = P(A) = ${pA.toFixed(3)}, no P(A)^2 = ${(pA * pA).toFixed(3)} (producto ingenuo)`);
  const full = compileRules(grp('AND', [stLeaf('a', 'Village', { radius: 600 })]));
  let hits = 0; for (let s = 0n; s < 500n; s++) if (evaluateSeed(e, full, s, 'normal').pass) hits++;
  ok(hits === st[1].k, 'Las estadisticas por etapa coinciden con la evaluacion completa');
}

console.log('Imposibilidad: solo con demostracion');
{
  // engineInfo consulta el motor en cada llamada: hay que analizar con la version activa.
  const at = (key, r) => { e.setup(V(key)); return F.analyzeImpossibility(r, F.engineInfo(e)); };
  e.setup(V('MC_1_21_1')); const now = F.engineInfo(e);
  const imp = (r) => at('MC_1_21_1', r);
  ok(at('MC_1_16_5', grp('AND', [stLeaf('a', 'Ancient_City')])).code === 'B', 'B: Ancient City en 1.16.5 (version incompatible)');
  ok(!imp(grp('AND', [stLeaf('a', 'Ancient_City')])).unsat, 'Ancient City en 1.21.1 no es imposible');
  ok(at('MC_1_16_5', grp('AND', [stLeaf('a', 'Trial_Chambers')])).code === 'B', 'B: Trial Chambers en 1.16.5');
  ok(imp(grp('AND', [stLeaf('a', 'Village', { minCount: 5, maxCount: 2 })])).code === 'A', 'A: minimo > maximo');
  ok(imp(grp('AND', [stLeaf('a', 'Village', { minDist: 900, radius: 800 })])).code === 'C', 'C: distancia minima > radio');
  ok(imp(grp('AND', [stLeaf('a', 'Mansion', { minCount: 500, radius: 500 })])).code === 'C', 'C: demasiadas mansiones para el area');
  ok(!imp(grp('AND', [stLeaf('a', 'Mansion', { minCount: 1, radius: 100 })])).unsat, 'Una mansion en 100 bloques: rarisimo pero NO imposible');
  ok(!imp(grp('AND', [stLeaf('a', 'Mansion', { radius: 300 }), stLeaf('b', 'Ancient_City', { radius: 300 }), stLeaf('c', 'Monument', { radius: 300 })])).unsat, 'Combinacion extremadamente rara: no se declara imposible');
  const near = (d) => grp('AND', [leaf('n', { cond: 'structureNear', typeA: S('Village'), typeB: S('Village'), radius: 1500, maxDist: d })]);
  const minV = F.minAttemptDistance(now.structCfg(S('Village')));
  ok(imp(near(minV - 1)).code === 'C' && !imp(near(minV)).unsat, `C: dos aldeas a menos de ${minV} bloques no caben (espaciado); a ${minV} si`);
  ok(imp(grp('AND', [leaf('s', { cond: 'stronghold', minCount: 500, radius: 99999 })])).code === 'A', 'A: mas fortalezas de las que existen');
  ok(imp(grp('AND', [leaf('d', { cond: 'biomeDiversity', minDistinct: 500, radius: 500 })])).code === 'A', 'A: mas biomas distintos de los que existen');
  const sp = (id, ids) => leaf(id, { cond: 'spawnBiome', biomes: ids });
  ok(imp(grp('AND', [sp('a', [biomeId('desert')]), sp('b', [biomeId('snowy_plains')])])).code === 'A', 'A: spawn en dos biomas disjuntos a la vez');
  ok(!imp(grp('AND', [sp('a', [biomeId('desert'), biomeId('plains')]), sp('b', [biomeId('plains')])])).unsat, 'Conjuntos que se solapan: posible');
  const bad = stLeaf('x', 'Village', { minDist: 900, radius: 800 }), good = stLeaf('y', 'Village');
  ok(!imp(grp('OR', [bad, good])).unsat, 'OR con una rama posible: no es imposible');
  ok(imp(grp('OR', [bad, { ...bad, id: 'z' }])).unsat, 'OR con todas las ramas imposibles: imposible');
  ok(!imp(grp('NOT', [bad])).unsat, 'NOT de algo imposible no se declara imposible');
  ok(!imp(grp('AND', [{ ...bad, optional: true }, good])).unsat && !imp(grp('AND', [{ ...bad, enabled: false }, good])).unsat, 'Condiciones opcionales o desactivadas no cuentan');

  // Las cotas geometricas se verifican con semillas reales: nunca deben violarse.
  const types = ['Village', 'Mansion', 'Monument', 'Outpost', 'Ancient_City', 'Desert_Pyramid'];
  let boundOk = true, distOk = true, detail = '';
  for (const key of types) {
    const cfg = now.structCfg(S(key)), minD = F.minAttemptDistance(cfg);
    for (let s = 0n; s < 80n; s++) {
      const ctx = makeContext(e, s, 'fast');
      for (const R of [150, 400, 900]) {
        const r = scanStructure(ctx, structByKey(key), 0, 0, R, 0);
        if (r.found.length > F.maxAttemptsInDisc(cfg, R)) { boundOk = false; detail += `${key} R=${R} seed=${s} `; }
        for (let i = 0; i < r.found.length; i++) for (let j = i + 1; j < r.found.length; j++) if (Math.hypot(r.found[i].x - r.found[j].x, r.found[i].z - r.found[j].z) < minD) { distOk = false; detail += `${key} dist `; }
      }
    }
  }
  ok(boundOk, 'Cota maxAttemptsInDisc respetada en 6 estructuras x 80 semillas x 3 radios', detail);
  ok(distOk, 'Distancia minima entre intentos respetada en las mismas semillas', detail);
}

console.log('Veredictos');
{
  const tiers = DEFAULT_RARITY_TIERS, noImp = { unsat: false, warnings: [] };
  const upper = F.estimateFromStages([{ label: 'A', n: 1000, k: 100 }, { label: 'B', n: 100, k: 0 }]);
  const v1 = F.verdictFor({ imp: noImp, est: upper, tiers, rootLeafIds: ['a', 'b'], calib: { leaves: {} } });
  ok(v1.code === 'U' && v1.label.startsWith('Viabilidad desconocida: no existen datos suficientes para demostrar que sea imposible'), 'Sin coincidencias => "Viabilidad desconocida", no imposible');
  const v2 = F.verdictFor({ imp: noImp, est: upper, tiers, rootLeafIds: ['a', 'b'], calib: { leaves: { a: { pass: 3 }, b: { pass: 2 } } } });
  ok(v2.code === 'E', 'E: cada condicion vista por separado pero no la combinacion');
  ok(!['A', 'B', 'C'].includes(v1.code) && !['A', 'B', 'C'].includes(v2.code), 'Nunca A/B/C por no haber encontrado nada');
  const rare = F.estimateFromStages([{ label: 'A', n: 1e8, k: 100 }, { label: 'B', n: 100, k: 40 }]); // p = 4e-7
  ok(F.verdictFor({ imp: noImp, est: rare, tiers }).code === 'D', 'D: posible pero extremadamente raro');
  ok(F.verdictFor({ imp: noImp, est: F.estimateFromStages([{ label: 'A', n: 100, k: 60 }]), tiers }).code === 'OK', 'Frecuente: posible');
  ok(F.verdictFor({ imp: { unsat: true, code: 'C', text: 'x' }, est: upper, tiers }).code === 'C', 'Si hay demostracion, el veredicto la recoge');
  const f = F.postSearchVerdict(5e6);
  ok(f.code === 'F' && f.detail.includes('NO demuestra'), 'F: no encontrado tras agotar el presupuesto, sin afirmar imposibilidad');
}

console.log('Presupuesto');
{
  const est = F.estimateFromStages([{ label: 'A', n: 1e5, k: 1000 }, { label: 'B', n: 1000, k: 100 }]); // p = 1e-3
  const b = F.buildBudget({ est, speed: 500, desired: 3, maxMinutes: 30 });
  ok(b.basis === 'model' && b.rows.length === 6 && b.rows.every((r, i) => i === 0 || r.seeds >= b.rows[i - 1].seeds), 'Tabla 50/75/90/95/99/99,9 % creciente');
  ok(b.rows[0].q === 0.5 && b.rows[5].q === 0.999, 'Objetivos de exito 50 % ... 99,9 %');
  ok(F.probAtLeast(3, est.p, b.seedsInitial) >= 0.9 && b.successMax >= 0.99, 'Presupuesto inicial >= 90 %, ampliado >= 99 %');
  ok(close(b.timeInitial, b.seedsInitial / 500, 1e-9), 'Tiempo = semillas / velocidad medida');
  ok(b.rows[2].seedsOpt <= b.rows[2].seeds && b.rows[2].seeds <= b.rows[2].seedsPes, 'Rango optimista <= central <= pesimista (segun el IC)');
  const nb = F.buildBudget({ est: upper0(), speed: 500, desired: 1, maxMinutes: 10 });
  ok(nb.basis === 'time' && nb.successInitial === null && nb.seedsMax === 500 * 600, 'Sin frecuencia: presupuesto por tiempo y exito desconocido (no se inventa)');
  function upper0() { return F.estimateFromStages([{ label: 'A', n: 100, k: 10 }, { label: 'B', n: 10, k: 0 }]); }
  const s = F.successFor(est, 1, 2000);
  ok(close(s.p, 1 - Math.pow(1 - est.p, 2000), 1e-9) && s.lo < s.p && s.hi > s.p, 'successFor: 1-(1-p)^N con intervalo');
  ok(F.difficultyFor(5).level === 1 && F.difficultyFor(600).level === 3 && F.difficultyFor(1e9).level === 6, 'Dificultad computacional por tiempo');
}

console.log('Analisis completo');
{
  e.setup(V('MC_1_21_1'));
  const rules = grp('AND', [stLeaf('a', 'Village', { radius: 700 }), stLeaf('b', 'Mansion', { radius: 1500 })]);
  const compiled = compileRules(rules), st = stagesOf(compiled).map(() => ({ n: 0, k: 0, ms: 0 }));
  const t0 = performance.now(); let n = 0;
  while (performance.now() - t0 < 4000) { evaluateSeed(e, compiled, BigInt(n), 'normal', false, st); n++; }
  const pilot = { stages: st, speed: n / ((performance.now() - t0) / 1000), examined: n, matches: st[st.length - 1].k, calib: { leaves: {} } };
  const an = F.makeAnalysis({ rules, compiled, info: F.engineInfo(e), pilot, tiers: DEFAULT_RARITY_TIERS, cpu: { coresKnown: true, cores: 4 }, gpu: { supported: false }, plan: { workers: 2, simd: true }, desired: 3, maxMinutes: 30 });
  ok(an.est.kind === 'estimate' && an.tier && an.verdict.code !== 'A', `Analisis real: p = ${an.est.p.toExponential(2)} (${an.tier?.label}), ${Math.round(pilot.speed)} seeds/s`);
  ok(an.explanation[0].includes('porque requiere') && an.explanation.some((l) => l.includes('no se multiplican')), 'Explicacion automatica incluye condiciones y aviso de no independencia');
  ok(an.engine.gpuUsed === false && an.warnings.some((w) => w.includes('1-(1-p)^N')), 'Motor recomendado sin GPU y aviso sobre el modelo');
  ok(an.source.rank >= 3, `La fuente es ${an.source.short}: nunca oficial`);
}

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
