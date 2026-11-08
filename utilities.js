// Utilidades compartidas (sin estado, sin persistencia).

export const U64 = (1n << 64n);

/** Convierte texto en semilla de Minecraft (entero con signo de 64 bits). Texto no numerico => hashCode de Java. */
export function parseSeed(text) {
  const t = String(text).trim();
  if (t === '') return null;
  if (/^-?\d+$/.test(t)) return BigInt.asIntN(64, BigInt(t));
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return BigInt(h);
}
export const seedToString = (s) => BigInt.asIntN(64, BigInt(s)).toString();
export const toU64 = (s) => BigInt.asUintN(64, BigInt(s));

/** Semilla aleatoria uniforme de 64 bits (CSPRNG del navegador; no se almacena). */
export function randomSeed() {
  const a = new Uint32Array(2);
  (globalThis.crypto || {}).getRandomValues(a);
  return BigInt.asIntN(64, (BigInt(a[0]) << 32n) | BigInt(a[1]));
}

export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('es-ES') : '∞');
export function fmtNum(n, d = 2) { return Number.isFinite(n) ? n.toLocaleString('es-ES', { maximumFractionDigits: d }) : '—'; }
export function fmtTime(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export function titleCase(key) { return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
let _uid = 0;
export const uid = (p = 'n') => `${p}${++_uid}`;

/** Detecta SIMD de WebAssembly validando un modulo minimo. */
export function wasmSimdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

/** Crea un elemento DOM. attrs: {class, text, html(no usar con datos externos), on:{evento:fn}, ...atributos} */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Descarga un texto como archivo (accion explicita del usuario). */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
