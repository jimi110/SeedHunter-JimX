// WebGPU: solo deteccion. La generacion de mundo de Minecraft (ruido Perlin/Simplex por octavas, capas de enteros,
// ramas condicionales y 64 bits) no se beneficia de forma fiable de la GPU en el navegador: el motor la ejecuta en
// CPU/WebAssembly. No se inventan metricas de GPU ni aceleraciones.
export async function detectGpu() {
  const out = { supported: false, adapter: null, usedForWorldgen: false, reason: '' };
  if (!('gpu' in navigator)) { out.reason = 'WebGPU no está disponible en este navegador.'; return out; }
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) { out.reason = 'WebGPU existe pero no hay adaptador disponible.'; return out; }
    out.supported = true;
    const info = a.info || {};
    out.adapter = { vendor: info.vendor || null, architecture: info.architecture || null, description: info.description || null };
    out.reason = 'WebGPU detectada, pero la generación de mundo se ejecuta en CPU/WebAssembly (no es adecuada para GPU). La GPU queda reservada para futuros cálculos masivos de estadística.';
  } catch (e) { out.reason = 'Error al consultar WebGPU: ' + (e?.message || e); }
  return out;
}
