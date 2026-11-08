// Exportacion TXT. Solo se genera al pulsar el boton de descarga (accion explicita del usuario).
import { fmtInt } from './utilities.js';
import { biomeName } from './biome-engine.js';
import { formatPercent, formatOneIn, describeLeaf } from './rarity-engine.js';
import { structById, DIM_NAMES } from './structure-engine.js';

export const EXPORT_FIELDS = [
  { key: 'version', label: 'Versión y edición', default: true },
  { key: 'spawn', label: 'Spawn y bioma', default: true },
  { key: 'structures', label: 'Estructuras encontradas y distancias', default: true },
  { key: 'rarity', label: 'Rareza (porcentaje, 1 entre X, IC)', default: true },
  { key: 'explanation', label: 'Explicación de rareza', default: true },
  { key: 'method', label: 'Método estadístico y dominio', default: true },
  { key: 'rules', label: 'Reglas de la búsqueda', default: false },
];

export function buildTxt(cards, matchBySeed, ctx, fields) {
  const on = (k) => fields.includes(k);
  const L = [];
  L.push('SEEDHUNTER JIMX — exportación manual', `Generado: ${new Date().toLocaleString('es-ES')}`, '');
  if (on('rules')) { L.push('REGLAS DE LA BÚSQUEDA'); ctx.leaves.forEach((l) => L.push(' · ' + describeLeaf(l) + (l.optional ? ' (opcional)' : ''))); L.push(''); }
  for (const card of cards) {
    const m = matchBySeed.get(card.seed);
    L.push('='.repeat(60), `SEED: ${card.seed}`);
    if (on('version')) L.push(`Edición: ${ctx.edition} · Versión: ${ctx.versionLabel} · Modo: ${ctx.modeLabel}`);
    if (on('spawn')) L.push(`Spawn ESTIMADO (Cubiomes; puede diferir del real): X ${m.spawn.x}, Z ${m.spawn.z} · Bioma en ese punto: ${biomeName(m.spawnBiome)}`);
    if (on('structures')) {
      for (const x of card.perLeaf) {
        const r = x.result; if (!r) continue;
        L.push(`- ${x.text}: ${r.pass ? 'CUMPLE' : 'no cumple'} [verificación: ${r.verified}]`);
        for (const p of r.detail?.found || []) { const s = structById(x.leaf.struct); L.push(`    ${s ? s.label.split(' (')[0] : 'Estructura'}: X ${p.x}, Z ${p.z} (${DIM_NAMES[s?.dim ?? 0]}) a ${fmtInt(p.d)} bloques [${p.verified}]`); }
        if (r.detail?.pair) L.push(`    Par más próximo: ${fmtInt(r.detail.pair.d)} bloques (puntos de inicio; piezas NO comprobadas)`);
        if (r.detail?.pct !== undefined) L.push(`    Cobertura: ${r.detail.pct.toFixed(2)} % (muestreo de ${r.detail.scale} bloques)`);
        if (r.detail?.distinct !== undefined) L.push(`    Biomas distintos: ${r.detail.distinct}`);
      }
    }
    if (on('rarity')) {
      const j = card.joint;
      L.push(`Rareza (combinación completa): ${formatPercent(j.p)} · ${formatOneIn(j.p)} · ${fmtInt(j.k)} coincidencias de ${fmtInt(j.n)} semillas` + (card.tier ? ` · ${card.tier.label}` : ''));
      L.push(`IC 95 % (Wilson): ${formatOneIn(j.hi)} a ${formatOneIn(j.lo)}`);
    }
    if (on('explanation')) card.explanation.forEach((t) => L.push('  ' + t));
    if (on('method')) L.push(`Dominio: ${card.domain.text}`, 'Método: intervalo de Wilson (95 %); marginales por submuestra de calibración; sin multiplicar probabilidades.');
    L.push('');
  }
  L.push('Loot/cofres: no calculados (función pendiente).');
  return L.join('\n');
}
