// Iconografia propia (trazos de 1.8 px, 24x24) y logotipo original de SeedHunter Jimx. Sin recursos externos.
const P = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  rules: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="8.5" cy="17" r="2.2"/>',
  gauge: '<path d="M4.6 17.2a8.4 8.4 0 1 1 14.8 0"/><path d="M12 13.2l3.6-3.8"/><circle cx="12" cy="13.4" r="1.2"/>',
  results: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="18" r=".9"/>',
  spark: '<path d="M11 3.5l1.9 5.4 5.4 1.9-5.4 1.9L11 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z"/><path d="M18.6 15.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  map: '<path d="M9 5.2L3.8 7.2v11.6L9 16.8l6 2 5.2-2V5.2L15 7.2z"/><path d="M9 5.2v11.6M15 7.2v11.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7"/>',
  play: '<path d="M8 5.6v12.8L18.8 12z" fill="currentColor"/>',
  pause: '<path d="M8.5 6v12M15.5 6v12" stroke-width="2.6"/>',
  stop: '<rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2.4" fill="currentColor"/>',
  restart: '<path d="M4.8 12a7.2 7.2 0 1 0 2.3-5.3"/><path d="M4.6 4.4v4.2h4.2"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  warn: '<path d="M12 4.2l9 15.6H3z"/><path d="M12 10v4.2M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5M12 8h.01"/>',
  chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2.5 4-6"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5v-1a2.4 2.4 0 0 0-2.4-2.4H7a2.4 2.4 0 0 0-2.4 2.4v6.1A2.4 2.4 0 0 0 7 15.5h1.5"/>',
};

/** Devuelve un <span class="icon"> con el SVG (los trazos son estaticos y propios; no contienen datos del usuario). */
export function icon(name, size = 20) {
  const s = document.createElement('span');
  s.className = 'icon';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return s;
}

/** Logotipo: hexagono de cristal con una «semilla» central y marcas de mira (el cazador). */
export const LOGO_SVG = `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
  <defs>
    <linearGradient id="lg1" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:#7aa8ff"/></linearGradient>
    <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <path d="M24 3.5l17.5 10.2v20.6L24 44.5 6.5 34.3V13.7z" fill="url(#lg1)" fill-opacity=".16" stroke="url(#lg1)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M24 3.5l17.5 10.2L24 23.9 6.5 13.7z" fill="url(#lg2)" opacity=".5"/>
  <circle cx="24" cy="24.5" r="6.2" fill="none" stroke="url(#lg1)" stroke-width="2"/>
  <circle cx="24" cy="24.5" r="2.4" fill="url(#lg1)"/>
  <path d="M24 13.8v4.4M24 30.8v4.4M13.4 24.5h4.4M30.2 24.5h4.4" stroke="url(#lg1)" stroke-width="2" stroke-linecap="round"/>
</svg>`;
