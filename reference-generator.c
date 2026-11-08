/* Genera reference-values.json con Cubiomes NATIVO (no WebAssembly) para contrastar el motor wasm en tests.js.
 * Compilar (con una copia de Cubiomes): gcc -O2 -fwrapv reference-generator.c cubiomes-*.c -lm -o ref && ./ref > reference-values.json
 * Los .c/.h de Cubiomes de esta raiz ya estan renombrados con prefijo cubiomes-; este archivo usa esos nombres. */
#include "cubiomes-generator.h"
#include "cubiomes-finders.h"
#include <stdio.h>
#include <math.h>

int main(void) {
    const char *names[3] = {"MC_1_16_5", "MC_1_18_2", "MC_1_21_1"};
    int mcs[3] = {MC_1_16_5, MC_1_18_2, MC_1_21_1};
    long long seeds[4] = {1, 262, -1234567890123LL, 987654321987LL};
    int types[3] = {Village, Monument, Mansion};
    const char *tn[3] = {"Village", "Monument", "Mansion"};
    printf("{\"cases\":[");
    int first = 1;
    for (int m = 0; m < 3; m++) for (int s = 0; s < 4; s++) {
        Generator g; setupGenerator(&g, mcs[m], 0); applySeed(&g, DIM_OVERWORLD, (uint64_t)seeds[s]);
        Pos sp = getSpawn(&g);
        printf("%s{\"version\":\"%s\",\"seed\":\"%lld\",\"spawn\":[%d,%d],\"biome0\":%d,\"biome1\":%d,\"structs\":[",
               first ? "" : ",", names[m], seeds[s], sp.x, sp.z, getBiomeAt(&g, 1, 0, 63, 0), getBiomeAt(&g, 1, -3000, 63, 2500));
        first = 0; int f2 = 1;
        for (int t = 0; t < 3; t++) for (int rz = -1; rz <= 0; rz++) {
            Pos p; int ok = getStructurePos(types[t], mcs[m], (uint64_t)seeds[s], 1, rz, &p);
            int v = ok ? isViableStructurePos(types[t], &g, p.x, p.z, 0) : 0;
            printf("%s{\"key\":\"%s\",\"rx\":1,\"rz\":%d,\"has\":%s,\"x\":%d,\"z\":%d,\"viable\":%s}", f2 ? "" : ",", tn[t], rz,
                   ok ? "true" : "false", ok ? p.x : 0, ok ? p.z : 0, v ? "true" : "false");
            f2 = 0;
        }
        printf("]}");
    }
    printf("],\"mansionHits\":[");
    Generator g; setupGenerator(&g, MC_1_21_1, 0); int c = 0;
    for (long long s = 0; s < 300; s++) {
        applySeed(&g, DIM_OVERWORLD, (uint64_t)s); Pos sp = getSpawn(&g);
        int rb = 512, R = 1200, cnt = 0;
        for (int rz = (int)floor((sp.z - R) / (double)rb); rz <= (int)floor((sp.z + R) / (double)rb); rz++)
            for (int rx = (int)floor((sp.x - R) / (double)rb); rx <= (int)floor((sp.x + R) / (double)rb); rx++) {
                Pos p; if (!getStructurePos(Mansion, MC_1_21_1, (uint64_t)s, rx, rz, &p)) continue;
                if (hypot(sp.x - p.x, sp.z - p.z) > R) continue;
                if (isViableStructurePos(Mansion, &g, p.x, p.z, 0)) cnt++;
            }
        if (cnt) { printf("%s%lld", c ? "," : "", s); c++; }
    }
    printf("]}\n");
    return 0;
}
