#!/usr/bin/env bash
# Compila Cubiomes (MIT) a WebAssembly con clang + wasm-ld (sin Emscripten).
# Requisitos: clang >= 14 con target wasm32 y wasm-ld.  Uso: bash build-wasm.sh
# Salida: seedhunter-engine.wasm y seedhunter-engine-simd.wasm en la raiz (sin carpetas).
set -euo pipefail
cd "$(dirname "$0")"
SHIM="$(mktemp -d)"; trap 'rm -rf "$SHIM"' EXIT
for h in stdio stdlib string math inttypes pthread; do echo '#include "wasm-libc.h"' > "$SHIM/$h.h"; done
mkdir -p "$SHIM/sys"; echo '#include "wasm-libc.h"' > "$SHIM/sys/types.h"; echo '#include "wasm-libc.h"' > "$SHIM/sys/stat.h"
SRC="cubiomes-biomenoise.c cubiomes-biomes.c cubiomes-finders.c cubiomes-generator.c cubiomes-layers.c cubiomes-noise.c wasm-libc.c wasm-api.c"
build() { # $1 = salida, resto = flags extra
  out="$1"; shift
  objs=""
  for f in $SRC; do
    o="$SHIM/$(basename "$f" .c)-$(basename "$out" .wasm).o"
    clang --target=wasm32 -O3 -ffreestanding -fwrapv -fno-builtin-printf -fvisibility=hidden -Wno-unused-command-line-argument \
      -isystem "$SHIM" -I. "$@" -c "$f" -o "$o"
    objs="$objs $o"
  done
  wasm-ld --no-entry --export-dynamic --allow-undefined -z stack-size=1048576 --initial-memory=33554432 --max-memory=2147483648 $objs -o "$out"
  echo "OK $out ($(wc -c < "$out") bytes)"
}
build seedhunter-engine.wasm
build seedhunter-engine-simd.wasm -msimd128
