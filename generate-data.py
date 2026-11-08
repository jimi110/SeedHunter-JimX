#!/usr/bin/env python3
"""Genera game-data.js (ids de biomas, versiones y estructuras) leyendo las cabeceras de Cubiomes.
Requiere gcc. Uso: python3 generate-data.py"""
import re, json, subprocess, tempfile, os
def entries(text, enum):
    body = re.search(r'enum ' + enum + r'\s*\{(.*?)\n\};', text, re.S).group(1)
    body = re.sub(r'//[^\n]*', '', body)
    out = []
    for part in body.split(','):
        m = re.match(r'^(\w+)\s*(=\s*(.+))?$', part.strip())
        if not m: continue
        name, _, val = m.groups()
        if val is not None and re.fullmatch(r'[A-Za-z_]\w*', val.strip()): continue  # alias
        out.append(name)
    return out
def dump(header, text, enum, skip=()):
    names = [n for n in entries(text, enum) if n not in skip]
    c = '#include "%s"\n#include <stdio.h>\nint main(){printf("[");' % header
    for i, n in enumerate(names): c += 'printf("%s[%%d,\\"%s\\"]",(int)%s);' % (',' if i else '', n, n)
    c += 'printf("]");return 0;}'
    d = tempfile.mkdtemp(); src = os.path.join(d, 'g.c'); exe = os.path.join(d, 'g')
    open(src, 'w').write(c)
    subprocess.check_call(['gcc', '-I.', src, '-o', exe])
    return json.loads(subprocess.check_output([exe]))
bh = open('cubiomes-biomes.h').read(); fh = open('cubiomes-finders.h').read()
data = {'biomes': dump('cubiomes-biomes.h', bh, 'BiomeID'),
        'versions': dump('cubiomes-biomes.h', bh, 'MCVersion'),
        'structures': dump('cubiomes-finders.h', fh, 'StructureType', skip=('FEATURE_NUM',))}
open('game-data.js', 'w').write('// Generado por generate-data.py desde Cubiomes (MIT). No editar a mano.\nexport const GAME_DATA = ' + json.dumps(data) + ';\n')
print({k: len(v) for k, v in data.items()})
