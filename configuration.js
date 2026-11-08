// Configuracion por defecto. Todo vive en memoria: nada se guarda en el navegador (ver README, apartado Privacidad).

export const SEARCH_MODES = {
  fast: {
    label: 'Rápido', batch: 400, biomeScale: [64], biomeCells: 2500, viability: false, terrain: false,
    runs: ['Bioma en el spawn', 'Posiciones de intento de estructuras (sin comprobar bioma)', 'Muestreo grueso de biomas (celdas de 64 bloques)', 'Fortalezas (posición de Cubiomes)'],
    notes: 'Las estructuras se cuentan por su posición de intento: NO están verificadas por bioma.',
  },
  normal: {
    label: 'Normal', batch: 120, biomeScale: [16, 64], biomeCells: 10000, viability: true, terrain: false,
    runs: ['Bioma en el spawn', 'Intentos de estructura + comprobación de bioma (viabilidad)', 'Muestreo de biomas (celdas de 16 bloques)'],
    notes: 'Viabilidad por bioma comprobada; la geometría de las piezas no se genera.',
  },
  advanced: {
    label: 'Avanzado', batch: 30, biomeScale: [4, 16, 64], biomeCells: 40000, viability: true, terrain: true,
    runs: ['Todo lo del modo Normal', 'Comprobación aproximada de terreno (Cubiomes) en estructuras que la soportan', 'Muestreo fino de biomas (celdas de 4 bloques cuando el radio lo permite)', 'Proximidad geométrica de puntos de inicio entre estructuras'],
    notes: 'La intersección real de piezas y los cofres NO se calculan (pendiente: requiere generar la estructura completa).',
  },
};

export const PERFORMANCE_PROFILES = {
  reduced: { label: 'Reducido', workers: () => 1 },
  balanced: { label: 'Equilibrado', workers: (c) => Math.max(1, Math.ceil(c / 2)) },
  high: { label: 'Alto', workers: (c) => Math.max(1, c - 1) },
  max: { label: 'Máximo', workers: (c) => Math.max(1, c) },
};

// Categorias de rareza propias de SeedHunter (NO son una clasificacion oficial de Minecraft). Umbrales configurables.
// minP: la categoria se asigna si la frecuencia estimada es >= minP (se comprueban de la mas frecuente a la mas rara).
export const DEFAULT_RARITY_TIERS = [
  { label: 'Normal', minP: 1e-2, color: '#7fd18b' },                    // mas frecuente que 1 entre 100
  { label: 'Poco común', minP: 1e-4, color: '#b6d96b' },                 // 1 entre 100 ... 1 entre 10.000
  { label: 'Rara', minP: 1e-5, color: '#f2d04a' },                       // hasta 1 entre 100.000
  { label: 'Muy rara', minP: 1e-6, color: '#f2a03d' },                   // hasta 1 entre 1.000.000
  { label: 'Extremadamente rara', minP: 1e-7, color: '#ee6a4a' },        // hasta 1 entre 10.000.000
  { label: 'Ultra rara', minP: 1e-9, color: '#d94fa0' },                 // hasta 1 entre 1.000.000.000
  { label: 'Extraordinariamente rara', minP: 0, color: '#9b6bff' },      // mas rara todavia
];

export const ACCENTS = ['#3ddc97', '#4cc2ff', '#ffb454', '#ff6b8b', '#a98bff'];
export const UI_SIZES = { small: 13, medium: 15, large: 17 };

export const CALIBRATION_EVERY = 25;      // 1 de cada N semillas se evalua con TODAS las condiciones (para frecuencias marginales)
export const CALIBRATION_STORE_CAP = 4000; // muestras maximas por condicion en memoria
export const CI_Z = 1.959964;              // 95 %
export const WASM_FILES = { scalar: './seedhunter-engine.wasm', simd: './seedhunter-engine-simd.wasm' };

// Valores por defecto del analisis previo y del presupuesto (editables en el dialogo de analisis).
export const ANALYSIS = { pilotQualities: { fast: 3000, normal: 8000, deep: 20000 }, defaultQuality: 'normal', desiredResults: 3, maxMinutes: 30, stopOptions: [1, 3, 5, 10] };
