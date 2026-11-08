// Catalogo de estructuras. La disponibilidad por version se consulta al motor (getStructureConfig de Cubiomes).
import { GAME_DATA } from './game-data.js';

const ID = Object.fromEntries(GAME_DATA.structures.map(([id, key]) => [key, id]));

// dim: 0 Overworld, -1 Nether, 1 End. 'stronghold' no usa intentos por region: se calcula con el algoritmo de anillos.
export const STRUCTURES = [
  { key: 'Village', id: ID.Village, label: 'Aldea (Village)', dim: 0 },
  { key: 'Mansion', id: ID.Mansion, label: 'Mansión del bosque (Woodland Mansion)', dim: 0 },
  { key: 'Ancient_City', id: ID.Ancient_City, label: 'Ciudad ancestral (Ancient City)', dim: 0 },
  { key: 'stronghold', id: 'stronghold', label: 'Fortaleza (Stronghold)', dim: 0, special: true },
  { key: 'Trial_Chambers', id: ID.Trial_Chambers, label: 'Cámara de pruebas (Trial Chambers)', dim: 0 },
  { key: 'Monument', id: ID.Monument, label: 'Monumento oceánico (Ocean Monument)', dim: 0 },
  { key: 'Outpost', id: ID.Outpost, label: 'Puesto de saqueadores (Pillager Outpost)', dim: 0 },
  { key: 'Desert_Pyramid', id: ID.Desert_Pyramid, label: 'Pirámide del desierto (Desert Pyramid)', dim: 0 },
  { key: 'Jungle_Temple', id: ID.Jungle_Temple, label: 'Templo de la jungla (Jungle Temple)', dim: 0 },
  { key: 'Igloo', id: ID.Igloo, label: 'Iglú (Igloo)', dim: 0 },
  { key: 'Swamp_Hut', id: ID.Swamp_Hut, label: 'Cabaña de bruja (Swamp Hut)', dim: 0 },
  { key: 'Ruined_Portal', id: ID.Ruined_Portal, label: 'Portal en ruinas (Ruined Portal)', dim: 0 },
  { key: 'Shipwreck', id: ID.Shipwreck, label: 'Naufragio (Shipwreck)', dim: 0 },
  { key: 'Treasure', id: ID.Treasure, label: 'Tesoro enterrado (Buried Treasure)', dim: 0 },
  { key: 'Mineshaft', id: ID.Mineshaft, label: 'Mina abandonada (Mineshaft)', dim: 0 },
  { key: 'Trail_Ruins', id: ID.Trail_Ruins, label: 'Ruinas de sendero (Trail Ruins)', dim: 0 },
  { key: 'Ocean_Ruin', id: ID.Ocean_Ruin, label: 'Ruinas oceánicas (Ocean Ruins)', dim: 0 },
  { key: 'Desert_Well', id: ID.Desert_Well, label: 'Pozo del desierto (Desert Well)', dim: 0 },
  { key: 'Geode', id: ID.Geode, label: 'Geoda (Geode)', dim: 0 },
  { key: 'Fortress', id: ID.Fortress, label: 'Fortaleza del Nether (Nether Fortress)', dim: -1 },
  { key: 'Bastion', id: ID.Bastion, label: 'Bastión (Bastion Remnant)', dim: -1 },
  { key: 'Ruined_Portal_N', id: ID.Ruined_Portal_N, label: 'Portal en ruinas del Nether (Ruined Portal)', dim: -1 },
  { key: 'End_City', id: ID.End_City, label: 'Ciudad del End (End City)', dim: 1 },
  { key: 'End_Gateway', id: ID.End_Gateway, label: 'Pasarela del End (End Gateway)', dim: 1 },
].filter((s) => s.id !== undefined);

export const DIM_NAMES = { 0: 'Overworld', '-1': 'Nether', 1: 'End' };
export const structByKey = (key) => STRUCTURES.find((s) => s.key === key);
export const structById = (id) => STRUCTURES.find((s) => s.id === id);

/** Lista de estructuras disponibles en la version del motor (engine = WasmEngine ya configurado). */
export function availableStructures(engine) {
  return STRUCTURES.map((s) => ({ ...s, available: s.special ? true : !!engine.structCfg(s.id) }));
}
