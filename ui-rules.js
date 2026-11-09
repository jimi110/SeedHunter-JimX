// Constructor de reglas (AND / OR / NOT) sin programar + modo experto (JSON).
import { h } from './utilities.js';
import { state, newGroup, newLeaf, cloneNode, findParent, validateRules, notify } from './app-state.js';
import { LEAF_TYPES, compileRules } from './search-engine.js';
import { BIOMES, BIOME_GROUPS, groupIds, biomeId, biomeName } from './biome-engine.js';
import { STRUCTURES, DIM_NAMES, structByKey } from './structure-engine.js';

const OP_HELP = { AND: 'Se cumplen TODAS', OR: 'Se cumple ALGUNA', NOT: 'No se cumple NINGUNA' };

const PRESETS = [
  { label: 'Mansión a < 1.000 bloques', build: () => [newLeaf('structure', { struct: structByKey('Mansion').id, radius: 1000 })] },
  { label: '3 aldeas en 800 bloques', build: () => [newLeaf('structure', { struct: structByKey('Village').id, minCount: 3, radius: 800 })] },
  { label: 'Ancient City a < 500 bloques', build: () => [newLeaf('structure', { struct: structByKey('Ancient_City').id, radius: 500 })] },
  { label: 'Trial Chambers cerca de una aldea', build: () => [newLeaf('structureNear', { typeA: structByKey('Trial_Chambers').id, typeB: structByKey('Village').id, radius: 1500, maxDist: 400 })] },
  { label: 'Fortaleza del Nether + bastión próximos', build: () => [newLeaf('structureNear', { typeA: structByKey('Fortress').id, typeB: structByKey('Bastion').id, radius: 1000, maxDist: 250, center: 'origin' })] },
  { label: 'Cherry Grove junto a Snowy Slopes', build: () => [newLeaf('biomeArea', { biomes: [biomeId('cherry_grove'), biomeId('snowy_slopes')], match: 'all', radius: 600 })] },
  { label: 'Mushroom Fields cerca del spawn', build: () => [newLeaf('biomeArea', { biomes: [biomeId('mushroom_fields')], radius: 500 })] },
  { label: 'Jungle junto a Bamboo Jungle', build: () => [newLeaf('biomeArea', { biomes: [biomeId('jungle'), biomeId('bamboo_jungle')], match: 'all', radius: 500 })] },
  { label: 'Badlands junto a Desert', build: () => [newLeaf('biomeArea', { biomes: BIOMES.filter((b) => /badlands|mesa/.test(b.key)).map((b) => b.id).concat([biomeId('desert')]), match: 'all', radius: 600 })] },
  { label: 'Muchos biomas en radio pequeño', build: () => [newLeaf('biomeDiversity', { minDistinct: 10, radius: 300 })] },
];
const SPAWN_QUICK = [
  { label: 'Spawn en isla', cond: 'spawnLandform', extra: { form: 'island' } }, { label: 'Spawn en continente', cond: 'spawnLandform', extra: { form: 'continent' } }, { label: 'Spawn en península', cond: 'spawnLandform', extra: { form: 'peninsula' } },
  { label: 'Terreno plano en el spawn', cond: 'spawnTerrain', extra: { maxRange: 6 } }, { label: 'Spawn elevado (altura ≥ 90)', cond: 'spawnTerrain', extra: { maxRange: null, minHeight: 90 } },
  { label: 'Spawn nevado', cond: 'spawnBiome', group: 'snowy' }, { label: 'Spawn en bosque', cond: 'spawnBiome', group: 'forest' },
  { label: 'Spawn en desierto', cond: 'spawnBiome', group: 'desert' }, { label: 'Spawn en montañas', cond: 'spawnBiome', group: 'mountain' },
  { label: 'Océano cerca (≤ 300)', cond: 'biomeArea', group: 'ocean', radius: 300 }, { label: 'Río cerca (≤ 200)', cond: 'biomeArea', group: 'river', radius: 200 },
  { label: 'Junto a la costa (≤ 150)', cond: 'biomeArea', group: 'beach', radius: 150 }, { label: 'Cuevas (biomas) cerca', cond: 'biomeArea', group: 'cave', radius: 300 },
];
const UNAVAILABLE = [
  'Spawn junto a lagos (los lagos no son biomas; requieren generación de terreno)',
  'Estructuras próximas a cuevas o barrancos (requiere terreno 3D)',
  'Variantes de aldea y condiciones especiales por estructura (Cubiomes las ofrece, aún sin exponer en la interfaz)',
  'Cofres y loot (ver Rareza / loot-engine.js: pendiente)',
];

export function renderRules(root, ctx) {
  root.replaceChildren();
  const rerender = () => { renderRules(root, ctx); notify('rules'); };
  const errs = validateRules(state.rules);

  root.append(
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted', text: 'Añadir condición:' }),
      ...Object.entries(LEAF_TYPES).map(([cond, t]) => h('button', { class: 'btn small', text: '+ ' + t.label, on: { click: () => { state.rules.children.push(newLeaf(cond)); rerender(); } } })),
      h('button', { class: 'btn small ghost', text: '+ Grupo OR', on: { click: () => { state.rules.children.push(newGroup('OR')); rerender(); } } }),
      h('button', { class: 'btn small ghost', text: '+ Grupo NOT', on: { click: () => { state.rules.children.push(newGroup('NOT')); rerender(); } } }),
      h('button', { class: 'btn small danger', text: 'Vaciar', on: { click: () => { state.rules = newGroup('AND'); rerender(); } } })),
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted', text: 'Plantillas:' }),
      h('select', { on: { change: (e) => { const p = PRESETS[e.target.value]; if (p) { state.rules.children.push(...p.build().filter((l) => !(l.biomes && l.biomes.some((b) => b === undefined)))); rerender(); } e.target.value = ''; } } },
        h('option', { value: '', text: 'Añadir plantilla de ejemplo…' }), ...PRESETS.map((p, i) => h('option', { value: i, text: p.label }))),
      h('select', { on: { change: (e) => { const q = SPAWN_QUICK[e.target.value]; if (q) { state.rules.children.push(newLeaf(q.cond, { ...(q.group ? { biomes: groupIds(q.group).filter(ctx.info.biomeAvailable) } : {}), ...(q.radius ? { radius: q.radius } : {}), ...(q.extra || {}) })); rerender(); } e.target.value = ''; } } },
        h('option', { value: '', text: 'Atajos de spawn / entorno…' }), ...SPAWN_QUICK.map((p, i) => h('option', { value: i, text: p.label })))),
    errs.length ? h('div', { class: 'notice warn' }, errs.map((e) => h('div', { text: '⚠ ' + e }))) : '',
    h('p', { class: 'muted small-text', text: 'Raíz: ' + OP_HELP[state.rules.op] + '. Dentro de cada grupo puedes cambiar el operador. Las condiciones «opcionales» no filtran: solo añaden información a las semillas que ya cumplen.' }),
    renderGroup(state.rules, null, ctx, rerender, true),
    h('details', { class: 'panel-sub' }, h('summary', { text: 'Modo experto (JSON)' }), expertEditor(ctx, rerender)),
    h('details', { class: 'panel-sub' }, h('summary', { text: 'Condiciones aún no disponibles (se muestran como pendientes, no simuladas)' }), h('ul', {}, UNAVAILABLE.map((t) => h('li', { text: t })))),
  );
}

function renderGroup(g, parent, ctx, rerender, isRoot = false) {
  const card = h('div', { class: 'node group' + (g.enabled === false ? ' off' : '') });
  const head = h('div', { class: 'node-head' },
    h('span', { class: 'tag', text: isRoot ? 'RAÍZ' : 'GRUPO' }),
    h('select', { on: { change: (e) => { g.op = e.target.value; rerender(); } } }, ...['AND', 'OR', 'NOT'].map((o) => h('option', { value: o, text: `${o} — ${OP_HELP[o]}`, selected: g.op === o }))),
    h('label', { class: 'inline' }, 'prioridad ', numField(g, 'priority', { min: 0, max: 99, step: 1, w: 56 })),
    !isRoot ? nodeActions(g, parent, rerender) : null);
  card.append(head);
  const body = h('div', { class: 'node-body' });
  for (const k of g.children) body.append(k.kind === 'group' ? renderGroup(k, g, ctx, rerender) : renderLeaf(k, g, ctx, rerender));
  if (!g.children.length) body.append(h('p', { class: 'muted', text: 'Grupo vacío.' }));
  card.append(body);
  return card;
}

function nodeActions(n, parent, rerender) {
  const idx = () => parent.children.indexOf(n);
  return h('span', { class: 'actions' },
    h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: n.enabled !== false, on: { change: (e) => { n.enabled = e.target.checked; rerender(); } } }), ' activa'),
    n.kind === 'leaf' ? h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: !!n.optional, on: { change: (e) => { n.optional = e.target.checked; rerender(); } } }), ' opcional') : null,
    h('button', { class: 'btn tiny', title: 'Subir', text: '↑', on: { click: () => { const i = idx(); if (i > 0) { parent.children.splice(i - 1, 0, parent.children.splice(i, 1)[0]); rerender(); } } } }),
    h('button', { class: 'btn tiny', title: 'Bajar', text: '↓', on: { click: () => { const i = idx(); if (i < parent.children.length - 1) { parent.children.splice(i + 1, 0, parent.children.splice(i, 1)[0]); rerender(); } } } }),
    h('button', { class: 'btn tiny', title: 'Duplicar', text: '⧉', on: { click: () => { parent.children.splice(idx() + 1, 0, cloneNode(n)); rerender(); } } }),
    h('button', { class: 'btn tiny', title: 'Agrupar en un grupo AND', text: '▣', on: { click: () => { const i = idx(); parent.children[i] = newGroup('AND', [n]); rerender(); } } }),
    h('button', { class: 'btn tiny danger', title: 'Eliminar', text: '✕', on: { click: () => { parent.children.splice(idx(), 1); rerender(); } } }));
}

function numField(obj, key, { min = 0, max, step = 1, w = 80, nullable = false } = {}) {
  return h('input', { type: 'number', min, max, step, style: `width:${w}px`, value: obj[key] ?? '', on: { input: (e) => { const v = e.target.value; obj[key] = v === '' ? (nullable ? null : 0) : Number(v); } } });
}
const field = (label, el) => h('label', { class: 'field' }, h('span', { text: label }), el);
const centerSel = (l) => h('select', { on: { change: (e) => { l.center = e.target.value; } } },
  h('option', { value: 'spawn', text: 'Spawn', selected: l.center === 'spawn' }), h('option', { value: 'origin', text: 'Origen (0,0)', selected: l.center === 'origin' }));

function structSelect(obj, key, ctx) {
  return h('select', { on: { change: (e) => { obj[key] = e.target.value === 'stronghold' ? 'stronghold' : Number(e.target.value); } } },
    ...STRUCTURES.filter((s) => !s.special).map((s) => {
      const av = ctx.info.structAvailable(s.id);
      return h('option', { value: s.id, selected: obj[key] === s.id, disabled: !av, text: `${s.label} · ${DIM_NAMES[s.dim]}${av ? '' : ' (no existe en esta versión)'}` });
    }));
}

function biomePicker(l, ctx) {
  const avail = BIOMES.filter((b) => ctx.info.biomeAvailable(b.id));
  const chips = h('div', { class: 'chips' });
  const refresh = () => { chips.replaceChildren(...l.biomes.map((id) => h('span', { class: 'chip', text: biomeName(id) }))); sum.textContent = `Biomas (${l.biomes.length})`; };
  const grid = h('div', { class: 'biome-grid' }, ...avail.map((b) => h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: l.biomes.includes(b.id), 'data-id': b.id, on: { change: (e) => { l.biomes = e.target.checked ? [...l.biomes, b.id] : l.biomes.filter((x) => x !== b.id); delete l._set; refresh(); } } }), ' ' + b.name)));
  const groupBtns = h('div', { class: 'toolbar' }, ...BIOME_GROUPS.map((g) => h('button', { class: 'btn tiny', text: '+ ' + g.label, on: { click: () => { const ids = groupIds(g.key).filter(ctx.info.biomeAvailable); l.biomes = [...new Set([...l.biomes, ...ids])]; delete l._set; grid.querySelectorAll('input').forEach((i) => { i.checked = l.biomes.includes(Number(i.dataset.id)); }); refresh(); } } })),
    h('button', { class: 'btn tiny danger', text: 'Limpiar', on: { click: () => { l.biomes = []; delete l._set; grid.querySelectorAll('input').forEach((i) => { i.checked = false; }); refresh(); } } }));
  const sum = h('summary', { text: '' });
  const det = h('details', {}, sum, groupBtns, grid);
  refresh();
  return h('div', {}, chips, det);
}

function renderLeaf(l, parent, ctx, rerender) {
  const t = LEAF_TYPES[l.cond];
  const card = h('div', { class: 'node leaf' + (l.enabled === false ? ' off' : '') + (l.optional ? ' optional' : '') });
  card.append(h('div', { class: 'node-head' }, h('span', { class: 'tag alt', text: t.label.toUpperCase() }),
    h('label', { class: 'inline' }, 'prioridad ', numField(l, 'priority', { min: 0, max: 99, w: 56 })), nodeActions(l, parent, rerender)));
  const f = h('div', { class: 'fields' });
  const dim = (id) => STRUCTURES.find((s) => s.id === id)?.dim ?? 0;
  switch (l.cond) {
    case 'spawnBiome': f.append(biomePicker(l, ctx)); break;
    case 'biomeArea':
      f.append(biomePicker(l, ctx),
        field('Coincidencia', h('select', { on: { change: (e) => { l.match = e.target.value; } } }, h('option', { value: 'any', text: 'Alguno de los biomas', selected: l.match === 'any' }), h('option', { value: 'all', text: 'Todos los biomas', selected: l.match === 'all' }))),
        field('Radio (bloques)', numField(l, 'radius', { min: 16, step: 16 })), field('Cobertura mínima (%)', numField(l, 'minPct', { min: 0, max: 100, step: 0.5 })), field('Desde', centerSel(l)));
      break;
    case 'spawnLandform':
      f.append(field('Forma', h('select', { on: { change: (e) => { l.form = e.target.value; } } }, ...[['island', 'Isla (tierra cerrada y pequeña)'], ['continent', 'Continente (la tierra llega al borde de la ventana)'], ['peninsula', 'Península (continente rodeado de mucha agua)']].map(([v, t]) => h('option', { value: v, text: t, selected: l.form === v })))),
        field('Ventana de análisis (radio)', numField(l, 'scanRadius', { min: 200, step: 100 })), field('Isla: área máx. (bloques²)', numField(l, 'maxIslandArea', { min: 1000, step: 10000 })),
        field('Península: radio local', numField(l, 'peninsulaRadius', { min: 50, step: 50 })), field('Península: agua mín. (0–1)', numField(l, 'minWaterFrac', { min: 0, max: 1, step: 0.05 })), field('Desde', centerSel(l)),
        h('p', { class: 'muted small-text', text: 'Estimación por muestreo de biomas (océano = agua; ríos y playas = tierra), con la resolución del modo elegido (se indica en cada resultado). Los umbrales son tuyos: no hay definición oficial de «isla» o «península».' }));
      break;
    case 'spawnTerrain':
      f.append(field('Radio (bloques)', numField(l, 'radius', { min: 8, step: 8 })), field('Relieve máx. (máx−mín, vacío = sin tope)', numField(l, 'maxRange', { min: 0, step: 1, nullable: true })),
        field('Altura media mín. (vacío = sin tope)', numField(l, 'minHeight', { step: 5, nullable: true })), field('Altura media máx. (vacío = sin tope)', numField(l, 'maxHeight', { step: 5, nullable: true })), field('Desde', centerSel(l)),
        h('p', { class: 'muted small-text', text: 'Altura aproximada que calcula Cubiomes (solo Overworld 1.18+, sin el ruido 3D fino de la superficie). Plano ≈ relieve ≤ 6; elevado ≈ altura media ≥ 90. El nivel del mar es 63.' }));
      break;
    case 'biomeDiversity': f.append(field('Biomas distintos (mín.)', numField(l, 'minDistinct', { min: 1 })), field('Radio (bloques)', numField(l, 'radius', { min: 16, step: 16 })), field('Desde', centerSel(l))); break;
    case 'structure':
      f.append(field('Estructura', structSelect(l, 'struct', ctx)), field('Cantidad mín.', numField(l, 'minCount', { min: 0, w: 60 })), field('Cantidad máx. (vacío = sin tope)', numField(l, 'maxCount', { min: 0, w: 60, nullable: true })),
        field('Distancia mín.', numField(l, 'minDist', { min: 0, step: 16 })), field('Distancia máx. (radio)', numField(l, 'radius', { min: 16, step: 16 })), field('Desde', centerSel(l)));
      if (dim(l.struct) !== 0) f.append(h('p', { class: 'muted small-text', text: `Coordenadas de ${DIM_NAMES[dim(l.struct)]} (no equivalen a las del Overworld). Con «Spawn» se usa el spawn del Overworld sin convertir; prefiere «Origen».` }));
      break;
    case 'stronghold': f.append(field('Cantidad mín.', numField(l, 'minCount', { min: 1, w: 60 })), field('Radio (bloques)', numField(l, 'radius', { min: 16, step: 16 })), field('Desde', centerSel(l))); break;
    case 'structureNear':
      f.append(field('Estructura A', structSelect(l, 'typeA', ctx)), field('Estructura B', structSelect(l, 'typeB', ctx)), field('A a ≤ (bloques)', numField(l, 'radius', { min: 16, step: 16 })), field('A–B a ≤ (bloques)', numField(l, 'maxDist', { min: 1, step: 8 })), field('Desde', centerSel(l)));
      if (dim(l.typeA) !== dim(l.typeB)) f.append(h('p', { class: 'notice warn', text: '⚠ A y B están en dimensiones distintas: la distancia no es comparable.' }));
      f.append(h('p', { class: 'muted small-text', text: 'Mide proximidad entre PUNTOS DE INICIO (verificados por bioma). La intersección real de piezas no se comprueba.' }));
      break;
  }
  card.append(f);
  return card;
}

function expertEditor(ctx, rerender) {
  const ta = h('textarea', { rows: 12, spellcheck: 'false', class: 'mono' });
  const msg = h('div', { class: 'muted' });
  ta.value = JSON.stringify(state.rules, (k, v) => (k === '_set' ? undefined : v), 2);
  return h('div', {},
    h('p', { class: 'muted small-text', text: 'Edita el árbol directamente. Cada hoja usa: cond, y según el tipo biomes / struct / typeA / typeB / radius / minCount / maxCount / minDist / maxDist / minPct / minDistinct / match / center.' }),
    ta, msg,
    h('button', { class: 'btn small', text: 'Aplicar JSON', on: { click: () => {
      try {
        const obj = JSON.parse(ta.value);
        if (obj.kind !== 'group') throw new Error('La raíz debe ser un grupo (kind:"group").');
        compileRules(obj); // valida operadores y tipos
        const errs = validateRules(obj); if (errs.length) throw new Error(errs[0]);
        state.rules = obj; rerender();
      } catch (e) { msg.textContent = '✕ ' + e.message; msg.className = 'notice warn'; }
    } } }));
}
