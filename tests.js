// Pruebas de SeedHunter Jimx. Ejecutar: node tests.js   (Node >= 18, sin dependencias)
// Solo se informa de lo que realmente se ejecuta. Las pruebas de GPU y de navegador no se ejecutan aqui (ver README).
import fs from 'node:fs';
import { WasmEngine } from './wasm-engine.js';
import { VERSIONS } from './minecraft-versions.js';
import { structByKey } from './structure-engine.js';
import { compileRules, evaluateSeed, spawnBound } from './search-engine.js';
import { wilson, upperBoundZero, formatOneIn, classify, proportionSummary, percentile } from './rarity-engine.js';
import { parseSeed } from './utilities.js';
import { buildTxt } from './export-engine.js';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };
const close = (a, b, eps) => Math.abs(a - b) <= eps;
const V = (key) => VERSIONS.find((v) => v.key === key).id;

console.log('Estadistica');
{
  const w = wilson(5, 1000);
  ok(close(w.p, 0.005, 1e-12) && w.lo < 0.005 && w.hi > 0.005, 'Wilson contiene la proporcion');
  ok(close(w.lo, 0.00214, 2e-4) && close(w.hi, 0.01166, 3e-4), 'Wilson 5/1000 = [0.214 %, 1.166 %]', JSON.stringify(w));
  ok(close(upperBoundZero(1000), 0.002987, 1e-5), 'Limite superior 0/1000 (95 %) ~ 0.299 %');
  const z = proportionSummary(0, 1e6);
  ok(z.zero && !('p' in z) && !('oneIn' in z), 'Cero coincidencias: no se inventa frecuencia');
  ok(formatOneIn(5 / 1e6) === '1 entre 200.000', 'Ejemplo del enunciado: 5 de 1.000.000 => 1 entre 200.000', formatOneIn(5 / 1e6));
  ok(classify(5e-7).label === 'Extremadamente rara' || classify(5e-7).label === 'Excepcional', 'Clasificacion por umbrales');
  ok(percentile([1, 2, 3], 1, 'low').insufficient, 'Percentil con muestra insuficiente se marca');
}

console.log('Semillas');
ok(parseSeed('12345') === 12345n && parseSeed('-1') === -1n, 'Seed numerica');
ok(parseSeed('hello') === 99162322n, 'Seed de texto = hashCode de Java ("hello" = 99162322)');
ok(parseSeed('18446744073709551615') === -1n, 'Desbordamiento a 64 bits con signo');

console.log('Motor WebAssembly (Cubiomes)');
const wasmFiles = ['seedhunter-engine.wasm', 'seedhunter-engine-simd.wasm'];
const engines = {};
for (const f of wasmFiles) { engines[f] = await WasmEngine.fromBytes(fs.readFileSync(f)); ok(true, 'carga ' + f); }
const e = engines[wasmFiles[0]];

// Valores de referencia generados con Cubiomes NATIVO (gcc): ver reference-generator.c y README, apartado Validacion.
const REF = JSON.parse(fs.readFileSync('reference-values.json', 'utf8'));
for (const r of REF.cases) {
  for (const f of wasmFiles) {
    const tag = f.includes('simd') ? 'SIMD ' : '';
    const en = engines[f]; en.setup(V(r.version)); en.apply(0, BigInt(r.seed));
    const sp = en.spawn();
    ok(sp.x === r.spawn[0] && sp.z === r.spawn[1], `${tag}${r.version} seed ${r.seed}: spawn`, `${sp.x},${sp.z}`);
    ok(en.biomeAt(0, 0, { scale: 1, y: 63 }) === r.biome0 && en.biomeAt(-3000, 2500, { scale: 1, y: 63 }) === r.biome1, `${tag}${r.version} seed ${r.seed}: biomas`);
    for (const s of r.structs) {
      const id = structByKey(s.key).id;
      const p = en.structPos(id, BigInt(r.seed), s.rx, s.rz);
      const v = p ? en.viable(id, p.x, p.z) : false;
      ok(!!p === s.has && (!p || (p.x === s.x && p.z === s.z && v === s.viable)), `${tag}${r.version} seed ${r.seed}: ${s.key} region ${s.rx},${s.rz}`);
    }
  }
}

console.log('Versiones');
e.setup(V('MC_1_16_5')); ok(!e.structCfg(structByKey('Ancient_City').id), 'Ancient City no existe en 1.16.5');
ok(!e.structCfg(structByKey('Trial_Chambers').id), 'Trial Chambers no existe en 1.16.5');
e.setup(V('MC_1_21_1')); ok(!!e.structCfg(structByKey('Ancient_City').id), 'Ancient City existe en 1.21.1');
ok(!!e.structCfg(structByKey('Trial_Chambers').id), 'Trial Chambers existe en 1.21.1');
e.apply(0, 1n);
ok(e.strongholds(3).length === 3, 'Fortalezas: 3 posiciones');
ok(e.strongholds(128).length === 128, '128 fortalezas generadas');

console.log('Motor de reglas');
{
  e.setup(V('MC_1_21_1'));
  const leaf = (id, extra) => ({ kind: 'leaf', id, enabled: true, center: 'spawn', ...extra });
  const m = (id) => leaf(id, { cond: 'structure', struct: structByKey('Mansion').id, minCount: 1, radius: 1200 });
  const vil = leaf('b', { cond: 'structure', struct: structByKey('Village').id, minCount: 1, radius: 800 });
  const grp = (op, children) => compileRules({ kind: 'group', op, id: 'r', enabled: true, children });
  const count = (c, mode, n = 300) => { const o = []; for (let s = 0n; s < BigInt(n); s++) if (evaluateSeed(e, c, s, mode).pass) o.push(Number(s)); return o; };

  const hits = count(grp('AND', [m('a')]), 'normal');
  ok(hits.length > 0 && JSON.stringify(hits) === JSON.stringify(REF.mansionHits), `Mansion <=1200 bloques: ${hits.length} semillas, identicas a Cubiomes nativo`, hits.slice(0, 8).join(','));
  ok(count(grp('NOT', [m('a')]), 'normal').length === 300 - hits.length, 'NOT es el complemento exacto de la condicion');
  ok(count(grp('OR', [m('a'), vil]), 'normal').length >= hits.length, 'OR devuelve al menos tantas semillas como cada rama');
  ok(count(grp('AND', [m('a'), vil]), 'normal').length <= hits.length, 'AND devuelve como mucho las de cada rama');
  ok(count(grp('AND', [m('a')]), 'fast', 200).length >= count(grp('AND', [m('a')]), 'normal', 200).length, 'Modo rapido (sin viabilidad) no descarta mas que el normal');
  const rec = evaluateSeed(e, grp('AND', [m('a')]), BigInt(hits[0]), 'normal');
  ok(rec.pass && rec.record.leaves.a.verified === 'bioma', 'Estructura marcada como verificada por bioma (no por geometria)');
}

console.log('Exportacion y privacidad');
{
  const card = { seed: '1', joint: { p: 0.01, k: 10, n: 1000, hi: 0.02, lo: 0.005 }, tier: { label: 'Frecuente' }, perLeaf: [], explanation: ['x'], domain: { text: 'd' } };
  const txt = buildTxt([card], new Map([['1', { spawn: { x: 1, z: 2 }, spawnBiome: 1 }]]), { edition: 'Java Edition', versionLabel: '1.21.1', modeLabel: 'Normal', leaves: [] }, ['version', 'spawn', 'rarity']);
  ok(txt.includes('SEED: 1') && txt.includes('1 entre 100') && txt.includes('ESTIMADO'), 'TXT contiene seed, frecuencia y marca de spawn estimado');
  const forbidden = /\b(localStorage|sessionStorage|indexedDB)\s*[.\[]|document\.cookie|sendBeacon|new\s+XMLHttpRequest|new\s+WebSocket|new\s+EventSource/; // uso real de la API (la pestana de Privacidad solo las menciona en texto)
  const strip = (t) => t.replace(/\/\/.*$/gm, '');
  const files = fs.readdirSync('.').filter((f) => f.endsWith('.js') && f !== 'tests.js');
  ok(files.filter((f) => forbidden.test(strip(fs.readFileSync(f, 'utf8')))).length === 0, 'Ningun modulo usa almacenamiento persistente ni canales de envio');
  ok(files.filter((f) => /fetch\(/.test(fs.readFileSync(f, 'utf8'))).every((f) => f === 'wasm-engine.js' || f === 'sw.js'), 'Solo wasm-engine.js (carga el .wasm local) y sw.js (cache de los archivos de la app, mismo origen) usan fetch');
  const html = fs.readFileSync('index.html', 'utf8');
  ok(/connect-src 'self'/.test(html) && !/(src|href)="https?:/.test(html), 'CSP limita conexiones al propio origen; sin recursos externos');
  const dirs = fs.readdirSync('.', { withFileTypes: true }).filter((d) => d.isDirectory() && !['node_modules', '.git'].includes(d.name));
  ok(dirs.length === 0, 'No hay carpetas de codigo en la raiz', dirs.map((d) => d.name).join(','));
  // --- PWA (app instalable): manifiesto, iconos, service worker y archivos en cache ---
  const man = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  ok(man.name && man.start_url && man.display === 'standalone' && /^#[0-9a-f]{6}$/i.test(man.theme_color), 'Manifiesto PWA valido (nombre, start_url, standalone, color)');
  const pngSize = (f) => { const b = fs.readFileSync(f); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  ok(man.icons.every((i) => fs.existsSync(i.src) && pngSize(i.src) === i.sizes), 'Los iconos del manifiesto existen y tienen el tamano declarado');
  ok(man.icons.some((i) => i.purpose === 'maskable') && man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512'), 'Iconos 192, 512 y maskable presentes');
  ok(fs.existsSync('apple-touch-icon.png') && pngSize('apple-touch-icon.png') === '180x180', 'apple-touch-icon 180x180 presente');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const swFiles = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  ok(swFiles.filter((f) => f !== './').every((f) => fs.existsSync(f)), 'Todos los archivos precacheados por sw.js existen', swFiles.filter((f) => f !== './' && !fs.existsSync(f)).join(','));
  const imported = new Set();
  for (const f of files.concat(['app.js'])) for (const m of fs.readFileSync(f, 'utf8').matchAll(/from '\.\/([^']+)'/g)) imported.add(m[1]);
  ok([...imported].every((f) => swFiles.includes(f)), 'Todo modulo importado esta en la cache sin conexion', [...imported].filter((f) => !swFiles.includes(f)).join(','));
  ok(swFiles.includes('search-worker.js') && swFiles.includes('seedhunter-engine.wasm') && swFiles.includes('seedhunter-engine-simd.wasm'), 'Worker y ambos .wasm se cachean para uso sin conexion');
  ok(/rel="manifest"/.test(html) && /src="pwa\.js"/.test(html) && /apple-touch-icon/.test(html), 'index.html enlaza manifiesto, pwa.js y apple-touch-icon');
}


console.log('Turbo (prefiltro antes del spawn)');
{
  const leaf = (st, radius) => ({ kind: 'leaf', id: 'c' + st + radius, cond: 'structure', enabled: true, optional: false, priority: 50, center: 'spawn', struct: structByKey(st).id, minCount: 1, maxCount: null, radius, minDist: 0 });
  const mkRules = (a, b) => compileRules({ kind: 'group', op: 'AND', id: 'r', enabled: true, priority: 50, children: [a, b] });
  const RULES = { MC_1_21_1: mkRules(leaf('Mansion', 1500), leaf('Village', 800)), MC_1_16_5: mkRules(leaf('Village', 600), leaf('Desert_Pyramid', 700)) };
  for (const key of ['MC_1_21_1', 'MC_1_16_5']) {
    const rules = RULES[key];
    const eng = engines['seedhunter-engine-simd.wasm']; eng.setup(V(key), false);
    const bound = spawnBound(V(key));
    let rnd = 987654321n; const next = () => { rnd = BigInt.asUintN(64, rnd * 6364136223846793005n + 1442695040888963407n); return BigInt.asIntN(64, rnd); };
    const seeds = Array.from({ length: 250 }, next);
    const exact = seeds.filter((s) => evaluateSeed(eng, rules, s, 'normal', false, null, null).pass).map(String);
    const turbo = seeds.filter((s) => evaluateSeed(eng, rules, s, 'normal', false, null, { slack: bound }).pass).map(String);
    ok(Number.isFinite(bound) && JSON.stringify(exact) === JSON.stringify(turbo), `Turbo con margen = cota teorica (${bound}) da exactamente las mismas semillas (${key}, ${exact.length} validas de 250)`);
    const turbo1000 = seeds.filter((s) => evaluateSeed(eng, rules, s, 'normal', false, null, { slack: 1000 }).pass).map(String);
    ok(turbo1000.every((s) => exact.includes(s)), `Turbo nunca produce falsos positivos (${key})`);
  }
  ok(!Number.isFinite(spawnBound(V('MC_1_12_2'))), 'Sin cota teorica del spawn en <= 1.12: Turbo se declara siempre aproximado');
}

console.log(`\n${pass} correctas, ${fail} fallidas`);
console.log('No ejecutado aqui: WebGPU (solo se detecta), interfaz en navegador (prueba manual) y contraste con otras herramientas externas.');
process.exit(fail ? 1 : 0);
