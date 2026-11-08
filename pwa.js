// Registro del service worker (app instalable) y boton "Instalar". No usa almacenamiento de datos del usuario.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

let deferred = null;
const buttons = [];
function addButton(parent, before) {
  if (!parent) return;
  const b = document.createElement('button');
  b.className = 'btn'; b.type = 'button'; b.hidden = true; b.textContent = 'Instalar app';
  b.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* sin accion */ }
    deferred = null; buttons.forEach((x) => { x.hidden = true; });
  });
  parent.insertBefore(b, before || null); buttons.push(b);
}
addEventListener('DOMContentLoaded', () => {
  const foot = document.querySelector('.side-foot'); addButton(foot, foot && foot.firstChild);
  const mb = document.querySelector('.mobilebar'); addButton(mb, document.getElementById('btn-theme-m'));
});
addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); deferred = ev; buttons.forEach((x) => { x.hidden = false; }); });
addEventListener('appinstalled', () => { deferred = null; buttons.forEach((x) => { x.hidden = true; }); });
