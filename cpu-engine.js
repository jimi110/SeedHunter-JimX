// Deteccion y planificacion de CPU / WebAssembly. Solo informa de lo que el navegador expone realmente.
import { PERFORMANCE_PROFILES, WASM_FILES } from './configuration.js';
import { wasmSimdSupported } from './utilities.js';

export function detectCpu() {
  const cores = navigator.hardwareConcurrency || null; // el navegador puede ocultar o redondear este dato
  return {
    cores, coresKnown: cores !== null,
    wasm: typeof WebAssembly === 'object', simd: wasmSimdSupported(),
    workers: typeof Worker !== 'undefined', crossOriginIsolated: !!globalThis.crossOriginIsolated,
    memoryGB: navigator.deviceMemory ?? null,
  };
}
export function planWorkers(profileKey, override, cpu) {
  const base = PERFORMANCE_PROFILES[profileKey].workers(cpu.cores || 4);
  const n = override ? Math.max(1, Math.min(64, Math.floor(override))) : base;
  return { workers: n, wasmUrl: cpu.simd ? WASM_FILES.simd : WASM_FILES.scalar, simd: cpu.simd };
}
