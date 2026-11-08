# SeedHunter Jimx

Buscador, analizador y clasificador de semillas de Minecraft **Java Edition**, con un sistema de estadística de rareza («Rareza Hunter»). Funciona 100 % en el navegador: sin backend, sin cuentas, sin telemetría y sin guardar datos de usuario.

El motor de generación de mundo es [Cubiomes](https://github.com/Cubitect/cubiomes) (MIT), compilado a WebAssembly y ejecutado en Web Workers. **Todos los archivos están en la raíz del repositorio; no hay carpetas.**

> Estado: **versión 0.1 funcional**. Lo que está implementado y lo que está pendiente se detalla abajo, sin maquillar.

## Ejecutar en local

Requisitos: cualquier servidor estático (los módulos ES y los Workers no funcionan abriendo `index.html` con `file://`).

```bash
python3 -m http.server 8080      # o: npm run serve
# abre http://localhost:8080
```

Pruebas (Node ≥ 18, sin dependencias): `node tests.js` (o `npm test`).

## Publicar en GitHub Pages

1. Sube **todo el contenido de esta carpeta** a la raíz del repositorio (`git init`, `git add .`, `git commit`, `git remote add origin <url>`, `git push -u origin main`).
2. En GitHub: *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / carpeta `/ (root)`*.
3. La web quedará en `https://<usuario>.github.io/<repositorio>/`. Los `.wasm` ya están compilados y versionados, así que no hace falta ningún paso de build en Pages.

No se ha publicado nada en GitHub desde este entorno: los comandos anteriores los ejecutas tú con tus propias credenciales.

## Qué hace (implementado y comprobado)

| Área | Estado |
|---|---|
| Versiones | Java Edition, catálogo generado desde Cubiomes (hasta la rama 1.21 «Winter Drop»). Bedrock: **desactivado** (otros algoritmos). Versiones por año (26.x): **no incluidas** en Cubiomes, no se ofrecen. |
| Motor | Cubiomes → WebAssembly (`seedhunter-engine.wasm`, y variante `-simd.wasm` si el navegador soporta SIMD), un módulo por Worker. Compilado con clang + wasm-ld y una mini libc propia (`wasm-libc.c`), sin Emscripten. |
| Modos | Rápido / Normal / Avanzado hacen cálculos distintos (ver pestaña Búsqueda; cada modo lista qué ejecuta). |
| Reglas | Constructor AND / OR / NOT con grupos, prioridades, condiciones opcionales, duplicar/agrupar/ordenar y modo experto (JSON). |
| Condiciones | Bioma del spawn, biomas en un área (cobertura, todos/alguno), diversidad de biomas, estructura (cantidad, rango de distancia, radio), fortalezas, proximidad entre dos estructuras. |
| Catálogo | Estructuras del Overworld, Nether y End que Cubiomes conoce; las que no existen en la versión elegida aparecen desactivadas. |
| Búsqueda | Aleatoria (64 bits), secuencial/intervalo, lista manual; iniciar, pausar, reanudar, cancelar, reiniciar, límite de coincidencias opcional, progreso/velocidad/tiempo. |
| Rendimiento | Perfiles reducido/equilibrado/alto/máximo, nº de workers configurable, detección de WebAssembly/SIMD/WebGPU/núcleos. Solo se muestran datos que el navegador expone. |
| Rareza Hunter | Frecuencia conjunta observada con intervalo de Wilson (95 %), «1 entre X», clasificación con umbrales editables, explicación, frecuencias individuales por submuestra de calibración (nunca multiplicadas), cero coincidencias ⇒ solo cota superior, dominio y método siempre indicados. Comparador y ranking global de la búsqueda actual. |
| Mapa | Biomas, spawn, estructuras (puntos de inicio), zonas de búsqueda, 3 dimensiones, zoom, medición. Datos del motor real. |
| Exportación | TXT de una, varias o todas las seeds, con los campos elegidos; copiar seed/coordenadas. |
| Análisis previo | Al pulsar «Iniciar» se abre un panel que **mide en tu equipo** (piloto de 3/8/20 s con semillas aleatorias reales): rareza («1 entre X», IC 95 %), categoría, fuente/fiabilidad (5 niveles), viabilidad (A–F), dificultad, motor recomendado, tabla por etapa del filtro y presupuesto editable. Nada empieza hasta confirmar; «Modificar condiciones» vuelve a Reglas. |
| Estimación sin independencia | Regla de la cadena sobre las etapas reales del filtro: cada factor se mide solo en las semillas que llegaron a esa etapa; IC por método delta. Sin coincidencias ⇒ solo cota superior («desconocida»). Nunca se inventan probabilidades ni se presentan como oficiales (Mojang no publica ninguna). |
| Imposibilidad | Solo se declara con **demostración** (A reglas contradictorias, B inexistente en la versión/edición, C geometría de generación). «D posible pero extremadamente rara», «E datos insuficientes» y «F no encontrada tras agotar el presupuesto» **nunca** significan imposible. Siempre se puede buscar igualmente. |
| Presupuesto y éxito | Semillas del primer análisis / límite ampliado / tiempo máximo / resultados deseados; P(éxito)=1−(1−p)^N con objetivos 50…99,9 % y rangos según el IC (solo muestreo aleatorio uniforme). Parada tras 1/3/5/10, seguir buscando, completar presupuesto o manual; resultados parciales al instante; cancelación inmediata. |
| Rareza (7 categorías) | Normal … Extraordinariamente rara, umbrales editables, no oficiales, con explicación automática y contribución condicional por condición. |
| Privacidad | Sin `localStorage`/`sessionStorage`/IndexedDB/cookies/red de envío; CSP `connect-src 'self'`. Todo se pierde al recargar. Hay pruebas automáticas de esto. |

## Límites y pendientes (importante)

- **Cofres y loot: NO implementado.** Exige generar las piezas de cada estructura y aplicar las tablas de botín por versión. `loot-engine.js` solo declara el estado; la UI no muestra cofres ni contenido inventado.
- **Colisiones reales (intersección de piezas / bounding boxes): NO implementado.** Solo se mide proximidad entre **puntos de inicio** (verificados por bioma). No se declara ninguna colisión como comprobada.
- **Spawn estimado:** Cubiomes avisa de que el spawn real depende de bloques de hierba. Todo lo «desde el spawn» usa ese punto estimado, y se etiqueta así.
- **Estructuras:** se comprueba posición de intento + viabilidad por bioma. El terreno solo se aproxima en Desert Pyramid, Jungle Temple y Mansion (1.18+) en modo Avanzado.
- **Biomas por muestreo:** se evalúan celdas de 4/16/64 bloques según modo y radio; biomas diminutos pueden pasar desapercibidos en modos rápidos.
- **GPU/WebGPU:** solo detección. La generación de mundo (ruido por octavas, capas de enteros, 64 bits, ramas) no se beneficia de forma fiable de la GPU en el navegador, así que se ejecuta en CPU/WebAssembly. No se inventan aceleraciones ni métricas.
- **No implementado todavía:** spawn en isla/continente/península, terreno plano/elevado, lagos, cuevas 3D y barrancos, variantes de aldea, nuevas versiones por año (26.x).
- **Rareza:** las frecuencias individuales salen de una submuestra de calibración (1 de cada N semillas evaluada con todas las condiciones). Con pocas semillas son orientativas; la ficha muestra su intervalo y avisa.

## Validación realizada

`npm test` ejecuta `tests.js` (221 comprobaciones) y `tests-viability.js` (64: fórmula de éxito, categorías, regla de la cadena, demostraciones de imposibilidad contrastadas con semillas reales, veredictos, presupuesto), todas correctas en la última ejecución:

- Motor WebAssembly (escalar y SIMD) **idéntico a Cubiomes nativo** en spawn, biomas, posiciones y viabilidad de estructuras, para 3 versiones y 4 semillas (`reference-values.json`, generado con `reference-generator.c` compilado con gcc).
- 300 semillas con «mansión ≤ 1200 bloques»: mismo conjunto que el programa nativo.
- Lógica AND / OR / NOT, modo rápido vs. normal, existencia de estructuras por versión.
- Estadística (Wilson, cota superior con 0 coincidencias, «1 entre X», seeds de texto = `hashCode` de Java).
- Exportación TXT y reglas de privacidad (sin APIs de almacenamiento, sin carpetas, sin recursos externos).

Comprobación manual en Chromium (Playwright): arranque, búsqueda real, ficha de rareza, mapa, descarga TXT y `localStorage`/`sessionStorage`/cookies vacíos. **No** se ha contrastado contra otras herramientas externas ni probado en GPU.

Comprobación manual en Chromium (Playwright) de la extensión: análisis previo con condiciones normales, raras y demostrablemente imposibles (iniciar bloqueado hasta «Buscar igualmente»), parada por resultados y por tiempo, cancelación en ~0,1 s, resultados parciales visibles en <1 s, 0 coincidencias ⇒ «F» sin declarar imposible, escritorio (1360 px) y móvil (390 px, sin scroll horizontal), tema oscuro/claro, almacenamiento vacío, sin errores de consola. No se probó en iPhone/Android reales ni en Safari/Firefox; el pellizco táctil del mapa no se verificó en un dispositivo real.

## Limitaciones técnicas de la extensión

- Las estimaciones salen del piloto (unos miles de semillas): con pocas coincidencias son orientativas y se etiquetan «preliminares». El cálculo P(éxito) supone semillas aleatorias independientes; en intervalos secuenciales es solo aproximado.
- El piloto mide en el momento y en este equipo; la velocidad real puede variar (térmica, otras pestañas).
- Al parar por «N coincidencias» el lote en curso se completa, por lo que pueden mostrarse más de N (se avisa); se conservan para no sesgar la estadística.
- Carga de CPU = tiempo ocupado medido de los workers; el navegador no expone el uso real de CPU/GPU del sistema.

## Reconstruir el WebAssembly (opcional)

Requiere clang con target `wasm32` y `wasm-ld`:

```bash
bash build-wasm.sh        # genera seedhunter-engine.wasm y seedhunter-engine-simd.wasm
python3 generate-data.py  # regenera game-data.js (ids de biomas/versiones/estructuras) desde las cabeceras de Cubiomes
```

Para actualizar Cubiomes, reemplaza los `cubiomes-*.c/.h` (conservando el prefijo y los `#include` renombrados), regenera datos y recompila. Una versión nueva aparece automáticamente en el catálogo.

## Archivos (todos en la raíz)

- Interfaz: `index.html`, `styles.css`, `app.js`, `app-state.js`, `ui-rules.js`, `ui-results.js`, `map-engine.js`
- Motor: `search-engine.js`, `search-controller.js`, `search-worker.js`, `wasm-engine.js`, `cpu-engine.js`, `gpu-engine.js`
- Dominio: `minecraft-versions.js`, `biome-engine.js`, `structure-engine.js`, `collision-engine.js`, `loot-engine.js`, `rarity-engine.js`, `export-engine.js`, `configuration.js`, `utilities.js`, `game-data.js` (generado)
- WebAssembly: `seedhunter-engine.wasm`, `seedhunter-engine-simd.wasm`, `wasm-api.c`, `wasm-libc.c`, `wasm-libc.h`, `build-wasm.sh`, `generate-data.py`
- Cubiomes (MIT): `cubiomes-*.c`, `cubiomes-*.h`, `LICENSE-cubiomes`
- Viabilidad y análisis: `feasibility-engine.js` (estimación, imposibilidad, presupuesto), `ui-analysis.js` (panel previo), `icons.js` (iconos y logotipo propios)
- Pruebas: `tests.js`, `tests-viability.js`, `reference-generator.c`, `reference-values.json`
- Proyecto: `README.md`, `package.json`, `.gitignore`, `LICENSE`

`package-lock.json` no existe porque el proyecto no tiene dependencias npm.

## Privacidad

Todo el cálculo ocurre en tu navegador. No hay backend, cuentas, analítica ni telemetría. Seeds, resultados, filtros y datos de hardware viven solo en memoria y desaparecen al cerrar o recargar; incluso las preferencias de tema se pierden. Solo conservas una seed si pulsas «Descargar TXT».

## Licencias

SeedHunter Jimx: MIT (`LICENSE`). Cubiomes © Cubitect: MIT (`LICENSE-cubiomes`). Proyecto no oficial; no está afiliado a Mojang ni Microsoft.
