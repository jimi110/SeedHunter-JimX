// Catalogo de versiones. Los ids son los del enum MCVersion de Cubiomes (ver game-data.js).
// Para anadir una version nueva: actualiza Cubiomes, ejecuta `python3 generate-data.py` y `bash build-wasm.sh`;
// aparecera aqui automaticamente como "experimental" hasta que se anote en VERSION_LABELS.
import { GAME_DATA } from './game-data.js';

const LABELS = {
  MC_B1_7: 'Beta 1.7', MC_B1_8: 'Beta 1.8', MC_1_0_0: '1.0', MC_1_1_0: '1.1', MC_1_2_5: '1.2.5', MC_1_3_2: '1.3.2',
  MC_1_4_7: '1.4.7', MC_1_5_2: '1.5.2', MC_1_6_4: '1.6.4', MC_1_7_10: '1.7.10', MC_1_8_9: '1.8.9', MC_1_9_4: '1.9.4',
  MC_1_10_2: '1.10.2', MC_1_11_2: '1.11.2', MC_1_12_2: '1.12.2', MC_1_13_2: '1.13.2', MC_1_14_4: '1.14.4',
  MC_1_15_2: '1.15.2', MC_1_16_1: '1.16.1', MC_1_16_5: '1.16.5', MC_1_17_1: '1.17.1', MC_1_18_2: '1.18.2',
  MC_1_19_2: '1.19.2', MC_1_19_4: '1.19.4', MC_1_20_6: '1.20.6', MC_1_21_1: '1.21.1', MC_1_21_3: '1.21.3',
  MC_1_21_WD: '1.21 Winter Drop (según Cubiomes)',
};

export const EDITIONS = [
  { id: 'java', label: 'Java Edition', enabled: true },
  { id: 'bedrock', label: 'Bedrock Edition', enabled: false,
    reason: 'No disponible: Cubiomes solo replica la generación de Java Edition. Bedrock usa algoritmos distintos y no se mezclan resultados.' },
];

export const VERSIONS = GAME_DATA.versions
  .map(([id, key]) => ({ id, key, label: LABELS[key] || key, known: !!LABELS[key] }))
  .reverse(); // la mas reciente primero

export const NEWEST = VERSIONS[0];
export const DEFAULT_VERSION = VERSIONS.find((v) => v.key === 'MC_1_21_1') || NEWEST;

/** Aviso mostrado al usuario sobre cobertura real (investigado en noviembre de 2026). */
export const VERSION_NOTICE =
  'Cubiomes llega hasta la rama 1.21 (Winter Drop). Java Edition ya usa numeración por año (26.1, 26.2, 26.3…) y esas versiones ' +
  'no están en el catálogo del motor: no se ofrecen para no mezclar resultados que podrían ser incorrectos.';

export const versionById = (id) => VERSIONS.find((v) => v.id === Number(id));
export const versionAtLeast = (id, key) => Number(id) >= GAME_DATA.versions.find(([, k]) => k === key)[0];
