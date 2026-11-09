// Versiones de Java Edition POSTERIORES a lo que Cubiomes replica de forma verificada (rama 1.21 «Winter Drop», MC_1_21_WD).
// Cubiomes no conoce la numeracion por anyo (26.x). Aqui se declara, de forma honesta y con evidencia, que se sabe de cada una.
//
// Evidencia: `python3 check-version-data.py <versionBase> <versionNueva>` compara los datos de generacion publicados por el proyecto
// misode/mcmeta (registros, ruido, funciones de densidad, conjuntos de estructuras). Los resultados de abajo salen de esa comparacion
// (ejecutada en noviembre de 2026 contra 1.21.4). LIMITE: los datos NO incluyen el codigo del juego; en particular, la colocacion de
// biomas en el clima (OverworldBiomeBuilder) vive en codigo, no en datos, asi que no puede verificarse sin el .jar de Mojang.
//
// Para anadir una version futura: 1) ejecuta check-version-data.py contra la ultima version verificada; 2) si NO hay biomas, estructuras
// ni ruido nuevos o cambiados, anade una entrada con level 'data-equivalent'; 3) si los hay, anade una entrada 'approximate' que los liste
// en `differences`; 4) cuando Cubiomes (o tu propio port) soporte la version, retira la entrada y deja que game-data.js la ofrezca.

export const LEVELS = {
  'data-equivalent': 'Equivalente en datos (no contrastada con el juego)',
  approximate: 'Aproximada (hay diferencias conocidas)',
};

export const EXTRA_VERSIONS = [
  {
    tag: '26.1', label: '26.1 (equivalente en datos)', engineKey: 'MC_1_21_WD', level: 'data-equivalent',
    summary: 'Los datos de ruido, funciones de densidad, biomas y conjuntos de estructuras son idénticos a 1.21.4 (comparación con misode/mcmeta). Usa el motor 1.21 Winter Drop.',
    differences: [],
    unverified: ['La colocación de biomas por clima está en el código del juego, no en los datos: no se ha podido comprobar contra el .jar.'],
  },
  {
    tag: '26.2', label: '26.2 (aproximada)', engineKey: 'MC_1_21_WD', level: 'approximate',
    summary: 'Igual que 26.1 en ruido de clima y estructuras, con las diferencias de abajo. Usa el motor 1.21 Winter Drop.',
    differences: [
      'Bioma nuevo «sulfur_caves» (subterráneo): el motor no lo conoce; no afecta a biomas de superficie, pero sí a condiciones de cuevas.',
      'Cambian 5 funciones de densidad de terreno (sloped_cheese ×3, caves/entrances, caves/spaghetti_2d): la forma 3D del terreno difiere de 1.21; el motor solo usa una altura aproximada por ruido de clima.',
    ],
    unverified: ['La colocación de biomas por clima está en el código del juego, no en los datos.'],
  },
  {
    tag: '26.3', label: '26.3 (aproximada)', engineKey: 'MC_1_21_WD', level: 'approximate',
    summary: 'Versión «Wilderness Bound». Usa el motor 1.21 Winter Drop, que NO conoce sus novedades de generación.',
    differences: [
      'Bioma nuevo «Dappled Forest» (bosque otoñal en climas fríos): el motor no puede generarlo. Un foro lo sitúa en el hueco de «plains» frío y seco (análisis de la comunidad, no oficial), así que donde el motor dice «plains» el juego real puede tener Dappled Forest.',
      'Estructura nueva «Abandoned Camp» (18 variantes por bioma): no está en el motor; no se puede buscar.',
      'Bioma subterráneo «sulfur_caves» y cambios de funciones de densidad de terreno heredados de 26.2.',
      'Formato de ruido cambiado (base_amplitude / normalize): no se ha podido demostrar que los valores equivalgan a los antiguos; si no equivalen, TODO el clima cambia respecto a 1.21.',
    ],
    unverified: [
      'No se ha contrastado ninguna semilla con el juego real: sin el .jar de Mojang (no accesible desde este entorno) no hay forma de verificarlo aquí.',
      'Cualquier resultado que dependa de biomas (spawn, áreas, estructuras que exigen bioma) puede diferir del juego real.',
    ],
  },
];

export const extraByTag = (tag) => EXTRA_VERSIONS.find((v) => v.tag === tag) || null;
