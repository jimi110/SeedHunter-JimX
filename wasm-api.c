/* API minima de WebAssembly sobre Cubiomes (MIT). Cada Worker instancia su propio modulo. */
#include "cubiomes-generator.h"
#include "cubiomes-finders.h"
#include "wasm-libc.h"

#define EXPORT(n) __attribute__((export_name(n)))

static Generator G;
static int G_mc = MC_NEWEST;
static int G_ready = 0;

EXPORT("sh_alloc") void *sh_alloc(int n) { return malloc((size_t)n); }
EXPORT("sh_free") void sh_free(void *p) { free(p); }
EXPORT("sh_mc_newest") int sh_mc_newest(void) { return MC_NEWEST; }

/* Prepara el generador para una version (enum MCVersion de Cubiomes) y flags (1 = LARGE_BIOMES). */
EXPORT("sh_setup") void sh_setup(int mc, unsigned int flags) {
    G_mc = mc;
    setupGenerator(&G, mc, flags);
    G_ready = 1;
}
/* Aplica una semilla de 64 bits a una dimension (0 Overworld, -1 Nether, 1 End). */
EXPORT("sh_apply") void sh_apply(int dim, unsigned long long seed) { if (G_ready) applySeed(&G, dim, seed); }

/* 1 si el bioma existe en la version configurada. */
EXPORT("sh_biome_exists") int sh_biome_exists(int mc, int id) { return biomeExists(mc, id); }

/* Bioma en una posicion con escala 1 o 4 (cada unidad = 1 o 4 bloques). Devuelve -1 si hay error. */
EXPORT("sh_biome_at") int sh_biome_at(int scale, int x, int y, int z) { return G_ready ? getBiomeAt(&G, scale, x, y, z) : -1; }

/* Spawn del mundo (bloques). out[0]=x, out[1]=z. */
EXPORT("sh_spawn") void sh_spawn(int *out) { Pos p = getSpawn(&G); out[0] = p.x; out[1] = p.z; }

/* Genera un area de biomas escala 'scale' (1,4,16,64,256) con origen (x,z) en unidades de esa escala. */
EXPORT("sh_gen_area") int sh_gen_area(int scale, int x, int z, int w, int h, int y, int *out) {
    Range r = { scale, x, z, w, h, y, 1 };
    int *cache = allocCache(&G, r);
    if (!cache) return -1;
    int rc = genBiomes(&G, cache, r);
    if (rc == 0) memcpy(out, cache, (size_t)w * (size_t)h * sizeof(int));
    free(cache);
    return rc;
}

/* Altura aproximada de la superficie (Cubiomes mapApproxHeight, solo Overworld 1.18+): rejilla w*h con paso de 4 bloques desde (x,z) en
 * unidades de 4 bloques. Rellena out_y (float) y out_ids (int, bioma). Devuelve 0 si es valida, otro valor si no esta soportado. */
EXPORT("sh_height") int sh_height(int x4, int z4, int w, int h, float *out_y, int *out_ids) {
    if (!G_ready || G.dim != DIM_OVERWORLD || G.mc < MC_1_18) return -1;
    return mapApproxHeight(out_y, out_ids, &G, NULL, x4, z4, w, h);
}

/* Configuracion de estructura por version: out = {salt, regionSize, chunkRange, dim}; out_rarity[0]=rarity. */
EXPORT("sh_struct_cfg") int sh_struct_cfg(int type, int *out, float *rarity) {
    StructureConfig sc;
    if (!getStructureConfig(type, G_mc, &sc)) return 0;
    out[0] = sc.salt; out[1] = sc.regionSize; out[2] = sc.chunkRange; out[3] = sc.dim;
    rarity[0] = sc.rarity;
    return 1;
}
/* Intento de generacion en la region (regX,regZ). out = {x,z} en bloques. Devuelve 1 si hay intento. */
EXPORT("sh_struct_pos") int sh_struct_pos(int type, unsigned long long seed, int regX, int regZ, int *out) {
    Pos p;
    if (!getStructurePos(type, G_mc, seed, regX, regZ, &p)) return 0;
    out[0] = p.x; out[1] = p.z; return 1;
}
/* Comprueba la viabilidad por bioma de un intento (usa la semilla ya aplicada). */
EXPORT("sh_struct_viable") int sh_struct_viable(int type, int x, int z) { return isViableStructurePos(type, &G, x, z, 0); }
/* Comprobacion adicional de terreno (aproximada; ver documentacion de Cubiomes). */
EXPORT("sh_struct_terrain") int sh_struct_terrain(int type, int x, int z) { return isViableStructureTerrain(type, &G, x, z); }

/* Fortalezas: escribe hasta 'n' posiciones (x,z) en out. Devuelve el numero escrito. Requiere semilla aplicada. */
EXPORT("sh_strongholds") int sh_strongholds(int n, int *out) {
    StrongholdIter sh;
    Pos p = initFirstStronghold(&sh, G_mc, G.seed);
    int i = 0;
    out[0] = p.x; out[1] = p.z; i = 1;
    while (i < n) {
        if (nextStronghold(&sh, &G) <= 0) break;
        out[2 * i] = sh.pos.x; out[2 * i + 1] = sh.pos.z; i++;
    }
    return i;
}
