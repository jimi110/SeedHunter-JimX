#!/usr/bin/env python3
"""Compara los DATOS de generacion de dos versiones de Java Edition usando el proyecto publico misode/mcmeta (raw.githubusercontent.com).
Sirve para decidir con evidencia si una version nueva exige cambios en el motor.

Uso:  python3 check-version-data.py 1.21.4 26.3

Informa de: biomas / estructuras / conjuntos de estructuras anadidos o quitados, y de que archivos de ruido y funciones de densidad cambian.
LIMITES: solo ve datos (JSON). La colocacion de biomas por clima (OverworldBiomeBuilder) y el codigo de generacion NO estan en los datos.
Si el formato de un archivo cambio entre versiones (ocurrio en 26.3 con el ruido), todos los archivos saldran «distintos» y hay que mirarlos a mano."""
import json, sys, urllib.request, concurrent.futures as cf

RAW = 'https://raw.githubusercontent.com/misode/mcmeta/refs/tags/%s-%s'
def fetch(url):
    return json.loads(urllib.request.urlopen(url, timeout=40).read())
def registries(v):
    return fetch(RAW % (v, 'summary') + '/registries/data.min.json')
def data(v, path):
    try: return fetch(RAW % (v, 'data-json') + '/data/minecraft/%s.json' % path)
    except Exception: return None

def main(a, b):
    ra, rb = registries(a), registries(b)
    for key in ['worldgen/biome', 'worldgen/structure', 'worldgen/structure_set']:
        sa, sb = set(ra.get(key, [])), set(rb.get(key, []))
        print(f'{key}: anadidos {sorted(sb - sa)}  quitados {sorted(sa - sb)}')
    for key in ['worldgen/noise', 'worldgen/density_function', 'worldgen/structure_set']:
        common = sorted(set(ra.get(key, [])) & set(rb.get(key, [])))
        with cf.ThreadPoolExecutor(16) as ex:
            res = list(ex.map(lambda n: (n, data(a, f'{key}/{n}') == data(b, f'{key}/{n}')), common))
        diff = [n for n, ok in res if not ok]
        print(f'{key}: {len(res)} comparados, {len(diff)} distintos' + (f': {diff[:30]}' if diff else ''))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
