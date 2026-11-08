// Envoltorio JS del motor WebAssembly (Cubiomes compilado con build-wasm.sh). Funciona en Workers y en Node.
import { toU64 } from './utilities.js';

export class WasmEngine {
  static async fromBytes(bytes) {
    const { instance } = await WebAssembly.instantiate(bytes, { env: {} });
    return new WasmEngine(instance.exports);
  }
  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
    return WasmEngine.fromBytes(await res.arrayBuffer());
  }

  constructor(exports) {
    this.x = exports;
    this.mc = null;
    this.scratch = this.x.sh_alloc(256);   // zona de intercambio reutilizable (64 enteros)
    this.scratchF = this.x.sh_alloc(16);
  }
  get i32() { return new Int32Array(this.x.memory.buffer); }   // se recrea porque la memoria puede crecer
  get f32() { return new Float32Array(this.x.memory.buffer); }

  setup(mc, large = false) { this.mc = Number(mc); this.x.sh_setup(this.mc, large ? 1 : 0); }
  apply(dim, seed) { this.x.sh_apply(dim, toU64(seed)); }
  biomeExists(id, mc = this.mc) { return !!this.x.sh_biome_exists(mc, id); }
  biomeAt(x, z, { scale = 1, y = 63, dimY } = {}) { return this.x.sh_biome_at(scale, x, dimY ?? y, z); }
  spawn() { this.x.sh_spawn(this.scratch); const m = this.i32, o = this.scratch >> 2; return { x: m[o], z: m[o + 1] }; }

  /** Biomas de un area. Origen y tamano en unidades de 'scale' bloques. Devuelve Int32Array (w*h). */
  area(scale, x, z, w, h, y = scale === 1 ? 63 : 15) {
    const bytes = w * h * 4, p = this.x.sh_alloc(bytes);
    if (!p) throw new Error('Sin memoria para el area solicitada');
    try {
      const rc = this.x.sh_gen_area(scale, x, z, w, h, y, p);
      if (rc !== 0) throw new Error('Cubiomes no pudo generar el area (codigo ' + rc + ')');
      return new Int32Array(this.x.memory.buffer.slice(p, p + bytes));
    } finally { this.x.sh_free(p); }
  }

  /** Configuracion de estructura en la version actual, o null si no existe. */
  structCfg(type) {
    if (!this.x.sh_struct_cfg(type, this.scratch, this.scratchF)) return null;
    const m = this.i32, o = this.scratch >> 2;
    return { salt: m[o], regionSize: m[o + 1], chunkRange: m[o + 2], dim: m[o + 3], rarity: this.f32[this.scratchF >> 2] };
  }
  /** Posicion del intento de generacion en la region (rx,rz), o null. Solo depende de los 48 bits bajos de la semilla. */
  structPos(type, seed, rx, rz) {
    if (!this.x.sh_struct_pos(type, toU64(seed), rx, rz, this.scratch)) return null;
    const m = this.i32, o = this.scratch >> 2; return { x: m[o], z: m[o + 1] };
  }
  viable(type, x, z) { return !!this.x.sh_struct_viable(type, x, z); }
  terrainOk(type, x, z) { return !!this.x.sh_struct_terrain(type, x, z); }
  strongholds(n = 128) {
    const p = this.x.sh_alloc(n * 8);
    try {
      const c = this.x.sh_strongholds(n, p), m = new Int32Array(this.x.memory.buffer, p, c * 2), out = [];
      for (let i = 0; i < c; i++) out.push({ x: m[2 * i], z: m[2 * i + 1] });
      return out;
    } finally { this.x.sh_free(p); }
  }
}
