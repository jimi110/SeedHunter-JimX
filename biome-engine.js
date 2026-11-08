// Catalogo de biomas (ids reales de Cubiomes) y utilidades de agrupacion/colores.
import { GAME_DATA } from './game-data.js';
import { titleCase } from './utilities.js';

export const BIOMES = GAME_DATA.biomes
  .filter(([id, key]) => id >= 0 && key !== 'the_void')
  .map(([id, key]) => ({ id, key, name: titleCase(key) }));
const BY_ID = new Map(BIOMES.map((b) => [b.id, b]));
export const biomeName = (id) => (BY_ID.get(id)?.name ?? `Bioma ${id}`);
export const biomeId = (key) => GAME_DATA.biomes.find(([, k]) => k === key)?.[0];

// Grupos tematicos por patron de nombre (los miembros reales dependen de la version: se filtran con biomeExists).
export const BIOME_GROUPS = [
  { key: 'ocean', label: 'Océanos', test: (k) => /ocean/.test(k) },
  { key: 'river', label: 'Ríos', test: (k) => /river/.test(k) },
  { key: 'beach', label: 'Costa (playas / orillas)', test: (k) => /beach|stone_shore|stony_shore/.test(k) },
  { key: 'snowy', label: 'Nevado', test: (k) => /snowy|frozen|ice_spikes|grove|jagged|ice/.test(k) && !/ocean|river/.test(k) },
  { key: 'forest', label: 'Bosques', test: (k) => /forest|birch|cherry|taiga|pale_garden/.test(k) && !/snowy|frozen/.test(k) },
  { key: 'desert', label: 'Desierto / Badlands', test: (k) => /desert|badlands|mesa/.test(k) },
  { key: 'mountain', label: 'Montañas', test: (k) => /mountain|peaks|slopes|windswept|extreme_hills|hills/.test(k) },
  { key: 'jungle', label: 'Jungla', test: (k) => /jungle|bamboo/.test(k) },
  { key: 'swamp', label: 'Pantano', test: (k) => /swamp|mangrove/.test(k) },
  { key: 'savanna', label: 'Sabana', test: (k) => /savanna/.test(k) },
  { key: 'mushroom', label: 'Setas', test: (k) => /mushroom/.test(k) },
  { key: 'cave', label: 'Cuevas (biomas subterráneos)', test: (k) => /lush_caves|dripstone|deep_dark/.test(k) },
];
export const groupIds = (groupKey) => BIOMES.filter((b) => BIOME_GROUPS.find((g) => g.key === groupKey).test(b.key)).map((b) => b.id);

const PALETTE = {
  ocean: '#1e3a8a', deep_ocean: '#14275c', warm_ocean: '#2563a8', lukewarm_ocean: '#2a4d9c', cold_ocean: '#274a8f', frozen_ocean: '#8aa4d6',
  deep_lukewarm_ocean: '#1c3a80', deep_cold_ocean: '#1b3472', deep_frozen_ocean: '#5f78a8', river: '#3b82f6', frozen_river: '#b9d3f5',
  plains: '#8ec65a', sunflower_plains: '#b7d842', forest: '#2f8f3a', flower_forest: '#58a84a', birch_forest: '#6faa5a', dark_forest: '#255c2a',
  taiga: '#3b7a5a', snowy_taiga: '#a9c9bd', old_growth_pine_taiga: '#4d6b4a', old_growth_spruce_taiga: '#4a6644',
  desert: '#e3c868', badlands: '#c7632d', eroded_badlands: '#d0723a', wooded_badlands: '#a85a35',
  savanna: '#bdb34a', savanna_plateau: '#a89b3e', windswept_savanna: '#9c9250', jungle: '#2fa84f', sparse_jungle: '#58b84f', bamboo_jungle: '#6dc24a',
  swamp: '#4b6b4a', mangrove_swamp: '#56733a', mushroom_fields: '#c27ac0', beach: '#efe0a6', snowy_beach: '#e8eef0', stony_shore: '#8a8a8a',
  snowy_plains: '#f1f6f8', ice_spikes: '#cfeaff', meadow: '#7fc37f', grove: '#cfe3d9', snowy_slopes: '#e6eef2', jagged_peaks: '#dfe6ec',
  frozen_peaks: '#cfdbe6', stony_peaks: '#9a9a96', cherry_grove: '#f3a8c8', pale_garden: '#a7b0a0', lush_caves: '#6fd36f', dripstone_caves: '#9c7a5a', deep_dark: '#0e2b33',
  nether_wastes: '#7a2a2a', crimson_forest: '#a8283a', warped_forest: '#1f8f8a', soul_sand_valley: '#5a4a3a', basalt_deltas: '#4f4a4a',
  the_end: '#d9d6a0', end_highlands: '#e6e0a8', end_midlands: '#d0cb90', small_end_islands: '#bdb985', end_barrens: '#a9a578',
};
export function biomeColor(id) {
  const b = BY_ID.get(id);
  if (b && PALETTE[b.key]) return PALETTE[b.key];
  const hue = (id * 47) % 360;
  return `hsl(${hue} 40% 45%)`;
}
export const biomeColorRGB = (() => {
  const cache = new Map();
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.fillStyle = biomeColor(id); x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data; const rgb = [d[0], d[1], d[2]];
    cache.set(id, rgb); return rgb;
  };
})();
