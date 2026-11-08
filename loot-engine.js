// Cofres y loot. ESTADO: PENDIENTE (no implementado).
// Calcular cofres reales exige generar la estructura completa (piezas, habitaciones, semillas de cofre por pieza) y aplicar
// las tablas de botin de cada version. Cubiomes no incluye esa generacion. Para no inventar coordenadas ni contenidos,
// este modulo solo declara el estado y la etiqueta de precision que tendra cada dato cuando se implemente.
export const LOOT = {
  available: false,
  reason: 'Pendiente: no hay generación de piezas de estructura ni tablas de botín verificadas. No se muestran cofres ni contenidos.',
  precision: { calculated: 'calculado (estructura generada + tabla de botín de la versión)', estimated: 'estimado (distribución de probabilidades, sin cofre concreto)' },
};
export function searchLoot() { throw new Error(LOOT.reason); }
