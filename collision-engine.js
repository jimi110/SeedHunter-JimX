// Colisiones. Niveles que NO deben mezclarse (ver especificacion):
//  1) 'inicio'      Proximidad geometrica entre puntos de inicio (posiciones de intento ya verificadas por bioma). IMPLEMENTADO.
//  2) 'region'      Solapamiento de regiones de generacion. Informativo: se calcula con el tamano de region de Cubiomes.
//  3) 'piezas'      Interseccion real de piezas generadas / bounding boxes. NO IMPLEMENTADO (requiere generar la estructura).
export const COLLISION_LEVELS = {
  inicio: { label: 'Proximidad de puntos de inicio', implemented: true },
  region: { label: 'Solapamiento de regiones de generación', implemented: true },
  piezas: { label: 'Intersección real de piezas / bounding boxes', implemented: false,
    reason: 'Pendiente: requiere generar la geometría de cada estructura. Hasta entonces ninguna colisión se declara como comprobada.' },
};
export const levelOfPair = () => 'inicio';
/** Los puntos de inicio de dos regiones de distinto tipo pueden quedar a distancia arbitraria; esto solo describe la distancia. */
export function describePair(pair) {
  return pair ? `Puntos de inicio a ${Math.round(pair.d)} bloques (nivel: proximidad de inicio; intersección de piezas NO comprobada)` : 'Sin par';
}
