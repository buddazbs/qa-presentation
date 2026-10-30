"""Neo-Tokyo vertical megastructure: procedural Blender build from scene_spec.json.

The script is the construction record of the city. Every dimension, material
value, camera and slide mount comes from scene_spec.json (revision R3); the
layout is deterministic (fixed seed), so a rebuild gives the same city.

Sign, ad and tower-monitor atlases are printed first by the original
presentation's own sign code (signal/signage.js) in headless Chrome:

    node atlas/bake.js                 # textures/src/*.png + atlases.json

    blender -b --factory-startup -P build_city.py -- --stage all
    blender -b --factory-startup -P build_city.py -- --stage build      # city.blend only
    blender -b --factory-startup -P build_city.py -- --stage render     # verification renders
    blender -b --factory-startup -P build_city.py -- --stage export     # GLB for the browser
    add --quick for small, low-sample renders while iterating

Outputs (next to this file unless noted):
    city.blend                     source scene, collections as in BLENDER_HANDOFF.md section 4
    textures/*.png                 generated facade textures and detail maps (base, normal, roughness)
    textures/src/*                 sign / ad / monitor atlases from atlas/bake.js
    renders_blender/*.jpg          verification renders (section 11 checklist)
    build_report.json              triangle, material, bridge and clearance checks
    ../tower/assets/city.glb       desktop export (99_EXPORT)
    ../tower/assets/city_lite.glb  mobile LOD: no small details
    ../tower/assets/props.glb      flying vehicles VEH-01..04, sakura petal, free air lanes
"""

import json
import math
import os
import random
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, 'scene_spec.json'), encoding='utf-8'))
TEX_DIR = os.path.join(HERE, 'textures')
SRC_DIR = os.path.join(TEX_DIR, 'src')
if not os.path.exists(os.path.join(SRC_DIR, 'atlases.json')):
    raise SystemExit('textures/src/atlases.json is missing: run `node atlas/bake.js` first')
ATLAS = json.load(open(os.path.join(SRC_DIR, 'atlases.json'), encoding='utf-8'))
RENDER_DIR = os.path.join(HERE, 'renders_blender')
ASSET_DIR = os.path.join(HERE, '..', 'tower', 'assets')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
STAGE = argv[argv.index('--stage') + 1] if '--stage' in argv else 'all'
QUICK = '--quick' in argv

BOUNDS = SPEC['scene']['bounds_m']
Z_MIN, Z_MAX = BOUNDS['min_z'], BOUNDS['max_z']
R_MAX = BOUNDS['max_radius']
SHAFT = BOUNDS['inner_viewing_shaft_radius']
BANDS = {b['name']: (b['min_radius'], b['max_radius']) for b in SPEC['scene']['radial_layout']['depth_bands_m']}
SEAMS = SPEC['scene']['vertical_modules']['boundaries_z'][1:-1]
SECTORS = SPEC['scene']['radial_layout']['sector_count']
MOUNTS = SPEC['slide_mounts']
OBJ = {o['id']: o for o in SPEC['objects']}

TILE = 48.0            # facade texture tile, m: 20 bays x 20 floors of 2.4 m
RING_ROADS = ((62.0, 66.0), (92.0, 96.0))   # annuli kept free of stacks for transit rings
TRANSIT_LEVELS = ((RING_ROADS[0], (-110, -62, -18, 34, 78)), (RING_ROADS[1], (-124, -78, -30, 12, 58, 104)))
HERO_CANYON_DEG = 7.0  # half-width of the gap in front of the hero camera (azimuth -90 deg)

rng = random.Random(20261029)


def log(*a):
    print('[city]', *a, flush=True)


# ─────────────────────────────────────────────────────────────── scene reset
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = SPEC['scene']['meters_per_blender_unit']
    return sc


COLL_NAMES = ['00_REFERENCE', '01_BLOCKOUT', '05_FOUNDATION', '10_MAIN_TOWERS', '20_BUILDINGS', '25_FAR_CITY',
              '30_FACADES', '40_BRIDGES_PLATFORMS', '50_ROADS_INFRASTRUCTURE', '60_SIGNS_SCREENS', '70_NEON_LIGHTS',
              '80_DETAILS', '90_CAMERAS_LIGHTING', '99_EXPORT', 'ASSETS', 'PROPS']
COLL = {}


def make_collections(sc):
    for name in COLL_NAMES:
        c = bpy.data.collections.new(name)
        sc.collection.children.link(c)
        COLL[name] = c
    # Shared source meshes for instances are never rendered or exported themselves
    COLL['ASSETS'].hide_render = True
    COLL['ASSETS'].hide_viewport = True
    COLL['99_EXPORT'].hide_render = True
    # Vehicles and the petal are exported on their own (props.glb), never rendered with the city
    COLL['PROPS'].hide_render = True


# ──────────────────────────────────────────────────────────────── textures
def save_image(name, rgba, data=False):
    """rgba: float array (h, w, 4) in 0..1, row 0 = bottom (Blender convention).

    data: normal / roughness / grime maps — stored as is, read as Non-Color.
    """
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    os.makedirs(TEX_DIR, exist_ok=True)
    img.filepath_raw = os.path.join(TEX_DIR, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


FACADES = {
    # name: base panel, glass, window fraction (w, h), lit probability, lit palette
    'office': dict(panel='#1c242e', glass='#0b1c27', win=(0.86, 0.62), lit=0.5,
                   colors=[('#ffc978', 5), ('#ffe6bf', 3), ('#9fe9ff', 1)], mull=2),
    'resid': dict(panel='#232a32', glass='#0a1820', win=(0.42, 0.5), lit=0.45,
                  colors=[('#ffb15a', 6), ('#ffd7a0', 3), ('#ff7e5a', 1)], mull=1, balcony=True),
    'indus': dict(panel='#2a2f34', glass='#101a20', win=(0.22, 0.2), lit=0.18,
                  colors=[('#ff9b3d', 6), ('#ff3548', 1)], mull=0, stripes=True),
    'glass': dict(panel='#141d26', glass='#071923', win=(0.94, 0.84), lit=0.4,
                  colors=[('#bff6ff', 3), ('#ffd9a0', 3), ('#ff7ad9', 1)], mull=4),
}


def facade_textures(kind, cfg, size=1024):
    """One 48 x 48 m tile: 20 bays x 20 floors. Base color and emission (lit windows)."""
    r = np.random.default_rng(sum(map(ord, kind)))   # str hash is salted per process
    grid = 20
    cell = size // grid
    base = np.zeros((size, size, 3))
    emit = np.zeros((size, size, 3))
    panel = srgb_to_linear(hexrgb(cfg['panel']))
    glass = srgb_to_linear(hexrgb(cfg['glass']))
    base[:] = panel
    # Panel noise and floor slabs
    base *= (0.85 + 0.3 * r.random((size, size, 1)) ** 3)
    yy, xx = np.mgrid[0:cell, 0:cell]
    ww, wh = cfg['win']
    x0, x1 = int(cell * (1 - ww) / 2), int(cell * (1 + ww) / 2)
    y0 = int(cell * 0.12)
    y1 = min(cell - 4, y0 + int(cell * wh))
    palette = [(srgb_to_linear(hexrgb(c)), wgt) for c, wgt in cfg['colors']]
    weights = np.array([w for _, w in palette], dtype=float)
    weights /= weights.sum()
    for fy in range(grid):
        # Occupancy per floor: lit windows run in bands, not as a uniform scatter
        occ = 0.3 + 1.4 * r.random() ** 2
        for fx in range(grid):
            sy, sx = fy * cell, fx * cell
            tile = base[sy:sy + cell, sx:sx + cell]
            tile[y0:y1, x0:x1] = glass * (0.8 + 0.4 * r.random())
            # Mullions split the window into panes
            for m in range(1, cfg['mull'] + 1):
                mx = x0 + (x1 - x0) * m // (cfg['mull'] + 1)
                tile[y0:y1, mx - 1:mx + 2] = panel * 0.7
            if cfg.get('balcony'):
                tile[y0 - 3:y0, 3:cell - 3] = panel * 1.6
            if cfg.get('stripes') and fx % 3 == 0:
                tile[:, cell - 7:cell - 3] = srgb_to_linear(hexrgb('#5a5f64'))
            # Floor slab line
            tile[0:4, :] = panel * 0.55
            # Unlit glass still glows faintly with the city light
            emit[sy + y0:sy + y1, sx + x0:sx + x1] = glass * 0.9
            if r.random() < cfg['lit'] * occ:
                col = palette[r.choice(len(palette), p=weights)][0]
                level = 0.45 + 0.55 * r.random()
                # Interior falloff: brighter at the window head, curtains on some
                grad = (0.75 + 0.25 * (yy[y0:y1, x0:x1] - y0) / max(1, y1 - y0))[..., None]
                e = col * level * grad
                if r.random() < 0.3:
                    e[:, : (x1 - x0) // 3] *= 0.25
                emit[sy + y0:sy + y1, sx + x0:sx + x1] = e
                base[sy + y0:sy + y1, sx + x0:sx + x1] = np.maximum(tile[y0:y1, x0:x1], col * 0.25)
            for m in range(1, cfg['mull'] + 1):
                mx = sx + x0 + (x1 - x0) * m // (cfg['mull'] + 1)
                emit[sy + y0:sy + y1, mx - 1:mx + 1] = 0
    # Sparse vertical service strip (one optional strip per FAC-01 module)
    if kind in ('office', 'glass'):
        sx = cell * 13 + cell - 8
        emit[:, sx:sx + 5] = srgb_to_linear(hexrgb('#00d9ff')) * 0.6
    # Height: window reveals recessed, mullions and slab lines proud, panel seams per bay
    height = np.ones((size, size)) * 0.6
    win = np.zeros((size, size), bool)
    for fy in range(grid):
        for fx in range(grid):
            sy, sx = fy * cell, fx * cell
            win[sy + y0:sy + y1, sx + x0:sx + x1] = True
    height[win] = 0.15
    seam = (np.arange(size) % cell < 2)
    height[seam, :] = 0.35
    height[:, seam] = 0.4
    for m in range(1, cfg['mull'] + 1):
        for fx in range(grid):
            mx = fx * cell + x0 + (x1 - x0) * m // (cfg['mull'] + 1)
            height[:, mx - 1:mx + 2] = np.where(win[:, mx - 1:mx + 2], 0.55, height[:, mx - 1:mx + 2])
    dirt = fbm(r, size)
    # Grime: rain streaks run down from every window sill, darker under the slabs
    grime = np.clip(0.55 * dirt + 0.45 * vstreaks(r, size) ** 2, 0, 1)
    base[~win] *= (1.0 - 0.45 * grime[~win])[:, None]
    rough = np.where(win, 0.06 + 0.1 * dirt, 0.5 + 0.35 * grime)
    metal = np.where(win, 0.1, 0.35)
    alpha = np.ones((size, size, 1))
    b = save_image(f'facade_{kind}_base', np.concatenate([base, alpha], axis=2))
    e = save_image(f'facade_{kind}_emit', np.concatenate([emit, alpha], axis=2))
    n = save_image(f'facade_{kind}_normal', np.concatenate([normal_from_height(height + 0.05 * dirt, 2.5), alpha], axis=2), data=True)
    mr = save_image(f'facade_{kind}_mr', np.stack([np.ones_like(rough), rough, metal, np.ones_like(rough)], axis=2), data=True)
    return b, e, n, mr


# ─────────────────────────────────────────────── detail maps (R10 materials)
def tnoise(r, size, cells):
    """Tileable value noise: random cells x cells grid, periodic smooth interpolation."""
    g = r.random((cells, cells))
    t = np.arange(size) * cells / size
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
    b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def fbm(r, size, octaves=(4, 8, 16, 32, 64)):
    out = sum(tnoise(r, size, c) * 0.55 ** k for k, c in enumerate(octaves))
    return (out - out.min()) / (out.max() - out.min())


def vstreaks(r, size, cells=128, run=64):
    """Vertical rain streaks: fine noise averaged over `run` rows — dirt washes down a wall."""
    n = tnoise(r, size, cells)
    c = np.cumsum(np.concatenate([n[-run:], n]), axis=0)
    avg = (c[run:] - c[:-run]) / run
    return (avg - avg.min()) / (np.ptp(avg) + 1e-6)


def normal_from_height(h, strength):
    """Tangent-space normal map (OpenGL, +Y up; row 0 is the bottom) from a tileable height field."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


DETAIL_TILE = 6.0      # m: one repeat of a detail map (concrete, metal, panel, asphalt)
VEH_TILE = 3.0         # m: panel relief on vehicle paint
LANE_CLEAR = 3.0       # m: body centre of a lane (1 m above the car origin) to the nearest surface


def panel_field(size, panels, seam, r, rivets=True):
    """Height of a panel grid: grooves between panels, fasteners along the edges."""
    h = np.ones((size, size)) * 0.6
    step = size // panels
    yy, xx = np.mgrid[0:size, 0:size]
    groove = (yy % step < seam) | (xx % step < seam)
    h[groove] = 0.2
    if rivets:
        pitch = step // 4
        cy, cx = (yy % pitch) - pitch // 2, (xx % step) - seam * 3
        cy2, cx2 = (yy % step) - seam * 3, (xx % pitch) - pitch // 2
        bolt = (np.hypot(cx, cy) < 2.6) | (np.hypot(cx2, cy2) < 2.6)
        h[bolt] = 0.85
    # Panels sit at slightly different depths: the wall is assembled, not cast
    lift = r.random((panels, panels)) * 0.08
    h += lift[(yy // step) % panels, (xx // step) % panels]
    return h, groove


def scratches(r, size, count, horiz=0.7):
    s = np.zeros((size, size))
    for _ in range(count):
        x, y = r.random() * size, r.random() * size
        ang = r.normal(0, 0.3) if r.random() < horiz else r.random() * math.pi
        ln = r.uniform(8, 60)
        for t in np.linspace(0, ln, int(ln)):
            s[int(y + math.sin(ang) * t) % size, int(x + math.cos(ang) * t) % size] = 1
    return s


def detail_maps(kind, size=512):
    """Grime multiplier, metallic-roughness (G rough, B metal) and normal for one surface family."""
    r = np.random.default_rng(sum(map(ord, kind)) * 7)
    dirt = fbm(r, size)
    runs = vstreaks(r, size)
    if kind == 'metal':
        h, groove = panel_field(size, 4, 3, r)
        sc = scratches(r, size, 420)
        grime = np.clip(0.5 * dirt + 0.5 * (runs * tnoise(r, size, 32)) + 0.3 * groove, 0, 1)
        mult = (1 - 0.5 * grime) + 0.35 * sc
        rough = np.clip(0.3 + 0.45 * grime - 0.18 * sc, 0.08, 1)
        metal = np.clip(0.95 - 0.5 * grime, 0, 1)
        h = h - 0.06 * sc + 0.04 * dirt
        strength = 3.0
    elif kind == 'concrete':
        h, groove = panel_field(size, 2, 2, r, rivets=False)
        yy, xx = np.mgrid[0:size, 0:size]
        step = size // 2
        tie = np.zeros((size, size), bool)
        for ox in (0.25, 0.75):
            for oy in (0.25, 0.75):
                tie |= np.hypot((xx % step) - step * ox, (yy % step) - step * oy) < 4
        pits = fbm(r, size, (32, 64, 128))
        h = h - 0.25 * tie + 0.18 * pits
        grime = np.clip(0.45 * dirt + 0.6 * runs * tnoise(r, size, 24) + 0.4 * tie, 0, 1)
        mult = 1 - 0.55 * grime
        rough = np.clip(0.78 + 0.18 * pits - 0.25 * runs * tnoise(r, size, 24), 0, 1)
        metal = np.zeros_like(h)
        strength = 2.2
    elif kind == 'panel':
        h, groove = panel_field(size, 8, 2, r)
        sc = scratches(r, size, 160)
        grime = np.clip(0.4 * dirt + 0.35 * runs + 0.25 * groove, 0, 1)
        mult = (1 - 0.4 * grime) + 0.2 * sc
        rough = np.clip(0.38 + 0.35 * grime - 0.1 * sc, 0, 1)
        metal = np.clip(0.55 - 0.3 * grime, 0, 1)
        strength = 2.6
    else:  # asphalt: puddles are smooth and dark, the rest is coarse
        pits = fbm(r, size, (48, 96, 192))
        puddle = np.clip((fbm(r, size, (3, 6, 12)) - 0.55) * 6, 0, 1)
        h = 0.5 + 0.3 * pits * (1 - puddle)
        mult = 1 - 0.35 * puddle + 0.1 * pits
        rough = np.clip(0.75 - 0.7 * puddle + 0.1 * pits, 0.03, 1)
        metal = np.zeros_like(h)
        strength = 1.6
    alpha = np.ones((size, size, 1))
    g = save_image(f'detail_{kind}_grime', np.concatenate([np.repeat(np.clip(mult, 0, 1.2)[..., None] / 1.2, 3, 2), alpha], axis=2), data=True)
    mr = save_image(f'detail_{kind}_mr', np.stack([np.ones_like(rough), rough, metal, np.ones_like(rough)], axis=2), data=True)
    n = save_image(f'detail_{kind}_normal', np.concatenate([normal_from_height(h, strength), alpha], axis=2), data=True)
    return g, mr, n


# ─────────────────────────────────────────────────────────────── materials
MAT = {}


def principled(name, base, metallic, roughness, emission=None, strength=0.0, base_tex=None, emit_tex=None,
               normal_tex=None, mr_tex=None, normal_strength=1.0, double=False):
    """Principled BSDF in the shape the glTF exporter understands.

    mr_tex: G = roughness, B = metallic (glTF metallicRoughness). Detail maps repeat through the
    UVs (MB.face tile per material), not a Mapping node: KHR_texture_transform would keep the UVs
    unquantized in the GLB.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    def tex(img):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        return t
    if normal_tex:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tex(normal_tex).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if mr_tex:
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tex(mr_tex).outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(hexrgb(base)), 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission and strength > 0:
        bsdf.inputs['Emission Color'].default_value = (*srgb_to_linear(hexrgb(emission)), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    if base_tex:
        nt.links.new(tex(base_tex).outputs['Color'], bsdf.inputs['Base Color'])
    if emit_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = emit_tex
        emit_tex.colorspace_settings.name = 'sRGB'
        nt.links.new(t.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = strength
    MAT[name] = m
    return m


# Surface family of each spec material (R10 atlas): detail maps and a base texture tinted per material
DETAIL_OF = {'M_DarkMetal': 'metal', 'M_WornSteel': 'metal', 'M_Concrete': 'concrete', 'M_CoatedPanel': 'panel',
             'M_TechPolymer': 'panel', 'M_AsphaltWet': 'asphalt', 'M_AsphaltDry': 'asphalt'}


def tinted(name, hex_color, grime):
    """Base color texture: the material colour times its family grime map."""
    g = np.array(grime.pixels[:]).reshape(grime.size[1], grime.size[0], 4)[..., :3] * 1.2
    col = hexrgb(hex_color)    # the image is sRGB: store display values, not linear ones
    return save_image(name, np.concatenate([np.clip(g * col, 0, 1), np.ones(g.shape[:2] + (1,))], axis=2))


def atlas_image(name):
    img = bpy.data.images.load(os.path.join(SRC_DIR, name + '.png'), check_existing=True)
    img.name = 'atlas_' + name
    return img


def make_materials():
    fam = {k: detail_maps(k) for k in ('metal', 'concrete', 'panel', 'asphalt')}
    for p in SPEC['materials']:
        kind = DETAIL_OF.get(p['name'])
        if kind:
            g, mr, n = fam[kind]
            principled(p['name'], p['base_color_hex'], p['metallic'], p['roughness'],
                       base_tex=tinted('base_' + p['name'][2:].lower(), p['base_color_hex'], g),
                       normal_tex=n, mr_tex=mr)
        else:
            principled(p['name'], p['base_color_hex'], p['metallic'], p['roughness'],
                       p['emission_color_hex'] if p['emission_strength'] > 0 else None, p['emission_strength'])
    preset = {p['name']: p for p in SPEC['materials']}
    # Facade families (revision R1): base values from the panel and glass presets; R3 adds relief and wear
    src = {'office': 'M_TintedGlass', 'resid': 'M_CoatedPanel', 'indus': 'M_Concrete', 'glass': 'M_TintedGlass'}
    for kind, cfg in FACADES.items():
        b, e, n, mr = facade_textures(kind, cfg)
        p = preset[src[kind]]
        principled(f'M_Facade_{kind.capitalize()}', p['base_color_hex'], p['metallic'],
                   max(p['roughness'], 0.3), base_tex=b, emit_tex=e, strength=1.3, normal_tex=n, mr_tex=mr)
    # Video screens, one material per channel: the browser plays an animated channel on the face
    # (tower/screens.js); in Blender renders it is a lit panel in the channel's colour. A small
    # texture of its own keeps each one a separate material: gltf-transform merges untextured
    # materials into one palette and their names are lost
    for k, hex_color in enumerate(('#0e3a4c', '#3a2a08', '#3a0a1c', '#0a2a3a', '#2a0a36', '#0a3424')):
        c = srgb_to_linear(hexrgb(hex_color))
        rows = np.linspace(0.6, 1.0, 16)[:, None, None] * np.ones((16, 16, 1)) * c[None, None, :]
        img = save_image(f'video_{k}', np.concatenate([rows, np.ones((16, 16, 1))], axis=2))
        principled(f'M_Video_{k}', '#05080c', 0.0, 0.2, base_tex=img, emit_tex=img, strength=1.2)
    # Sign, ad and monitor atlases printed by atlas/bake.js with the original presentation's sign code
    for name, img, strength in (('M_SignAtlas_V', 'signs_v', 2.6), ('M_SignAtlas_H', 'signs_h', 2.6),
                                ('M_Ads', 'ads', 2.2), ('M_Monitors', 'monitors', 1.4)):
        a = atlas_image(img)
        principled(name, '#05080c', 0.05, 0.22, base_tex=a, emit_tex=a, strength=strength)
    # Vehicles (R3): paint over panel relief, glass canopy, lamps
    g, mr, n = fam['panel']
    for name, hex_color in (('M_VehPaint_Graphite', '#2b3038'), ('M_VehPaint_Crimson', '#5e1220'),
                            ('M_VehPaint_Ivory', '#a8a397'), ('M_VehPaint_Teal', '#123c44')):
        principled(name, hex_color, 0.6, 0.35, base_tex=tinted('base_' + name[2:].lower(), hex_color, g),
                   normal_tex=n, mr_tex=mr, normal_strength=0.6)
    principled('M_VehGlass', '#0b1820', 0.2, 0.04)
    principled('M_Headlight', '#ffffff', 0.0, 0.2, '#eef6ff', 5.0)
    principled('M_Taillight', '#ff2a3c', 0.0, 0.3, '#ff2a3c', 3.5)
    principled('M_EngineGlow', '#7cf0ff', 0.0, 0.3, '#7cf0ff', 3.0)
    principled('M_Petal', '#f6bccd', 0.0, 0.55, '#ff9ec0', 0.35, double=True)


# ─────────────────────────────────────────────────────────── mesh builder
Z = Vector((0, 0, 1))


class MB:
    """Accumulates faces with per-face vertices (flat shading), UVs and material slots."""

    def __init__(self):
        self.V, self.F, self.UV, self.M, self.mats = [], [], [], [], []
        self.off = (0.0, 0.0)

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def face(self, pts, mat, uvs=None):
        pts = [Vector(p) for p in pts]
        if uvs is None:
            n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            ou, ov = self.off
            tile = DETAIL_TILE if mat in DETAIL_OF else VEH_TILE if mat.startswith('M_VehPaint') else TILE
            if n.length < 1e-9 or abs(n.normalized().z) > 0.7:
                uvs = [(p.x / tile + ou, p.y / tile + ov) for p in pts]
            else:
                t = Z.cross(n).normalized()
                uvs = [(p.dot(t) / tile + ou, p.z / tile + ov) for p in pts]
            # Tiling textures: an integer shift per face changes nothing on screen but keeps the
            # values small, and snapping to 1/512 of a tile leaves float mantissas meshopt packs
            # well (tiling UVs exceed 0..1, so the GLB keeps them float32)
            du, dv = math.floor(min(u for u, _ in uvs)), math.floor(min(v for _, v in uvs))
            uvs = [(round((u - du) * 512) / 512, round((v - dv) * 512) / 512) for u, v in uvs]
        base = len(self.V)
        self.V.extend(pts)
        self.F.append(tuple(range(base, base + len(pts))))
        self.UV.extend(uvs)
        self.M.append(self._mi(mat))

    def prism(self, poly, z0, z1, mat, cap=None, top=True, bottom=True):
        cap = cap or mat
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            self.face([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], mat)
        if top:
            self.face([(p[0], p[1], z1) for p in poly], cap)
        if bottom:
            self.face([(p[0], p[1], z0) for p in reversed(poly)], cap)

    def obox(self, p0, p1, w, h, mat, up=Z):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        if d.length < 1e-6:
            return
        side = d.cross(up)
        if side.length < 1e-6:
            side = d.cross(Vector((1, 0, 0)))
        side = side.normalized() * (w / 2)
        upv = side.cross(d).normalized() * (h / 2)
        c = [p0 - side - upv, p0 + side - upv, p0 + side + upv, p0 - side + upv]
        e = [q + d for q in c]
        self.face([c[0], c[3], c[2], c[1]], mat)
        self.face([e[0], e[1], e[2], e[3]], mat)
        for i in range(4):
            j = (i + 1) % 4
            self.face([c[i], c[j], e[j], e[i]], mat)

    def tube(self, p0, p1, r, mat, n=6):
        p0, p1 = Vector(p0), Vector(p1)
        d = (p1 - p0)
        if d.length < 1e-6:
            return
        a = d.cross(Z if abs(d.normalized().z) < 0.9 else Vector((1, 0, 0))).normalized()
        b = d.cross(a).normalized()
        ring = [a * math.cos(2 * math.pi * k / n) * r + b * math.sin(2 * math.pi * k / n) * r for k in range(n)]
        for k in range(n):
            q, s = ring[k], ring[(k + 1) % n]
            self.face([p0 + q, p1 + q, p1 + s, p0 + s], mat)

    def ring(self, r_in, r_out, z0, z1, mat, n=48, a0=0.0, a1=2 * math.pi, cx=0.0, cy=0.0):
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        pts = [(a0 + (a1 - a0) * k / n) for k in range(n + 1)]
        P = lambda rr, a: (cx + rr * math.cos(a), cy + rr * math.sin(a))
        for k in range(n):
            a, b = pts[k], pts[k + 1]
            for rr, outward in ((r_out, True), (r_in, False)):
                pa, pb = P(rr, a), P(rr, b)
                q = [(pa[0], pa[1], z0), (pb[0], pb[1], z0), (pb[0], pb[1], z1), (pa[0], pa[1], z1)]
                self.face(q if outward else q[::-1], mat)
            oa, ob, ia, ib = P(r_out, a), P(r_out, b), P(r_in, a), P(r_in, b)
            self.face([(ia[0], ia[1], z1), (oa[0], oa[1], z1), (ob[0], ob[1], z1), (ib[0], ib[1], z1)], mat)
            self.face([(ib[0], ib[1], z0), (ob[0], ob[1], z0), (oa[0], oa[1], z0), (ia[0], ia[1], z0)], mat)
        if not full:
            for a in (a0, a1):
                o, i = P(r_out, a), P(r_in, a)
                self.face([(i[0], i[1], z0), (o[0], o[1], z0), (o[0], o[1], z1), (i[0], i[1], z1)], mat)

    def loft_x(self, sections, mat, caps=True):
        """Hull along +X from chamfered cross-sections (x, half-width, z-bottom, z-top, chamfer)."""
        profs = []
        for x, hw, zb, zt, c in sections:
            c = min(c, hw * 0.9, (zt - zb) * 0.45)
            pts = [(-hw, zb + c), (-hw + c, zb), (hw - c, zb), (hw, zb + c), (hw, zt - c), (hw - c, zt), (-hw + c, zt), (-hw, zt - c)]
            profs.append([(x, y, z) for y, z in pts])
        for A, B in zip(profs, profs[1:]):
            for j in range(8):
                j2 = (j + 1) % 8
                self.face([A[j], A[j2], B[j2], B[j]], mat)
        if caps:
            self.face(profs[-1], mat)
            self.face(profs[0][::-1], mat)

    def to_object(self, name, coll, location=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        uv = me.uv_layers.new(name='UVMap')
        uv.data.foreach_set('uv', [c for p in self.UV for c in p])
        for m in self.mats:
            me.materials.append(MAT[m])
        me.polygons.foreach_set('material_index', self.M)
        me.update()
        ob = bpy.data.objects.new(name, me)
        if location is not None:
            ob.location = location
        coll.objects.link(ob)
        return ob


def rect(cx, cy, w, d, rot):
    c, s = math.cos(rot), math.sin(rot)
    pts = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


def ngon(cx, cy, r, n, rot=0.0):
    return [(cx + r * math.cos(rot + 2 * math.pi * k / n), cy + r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]


def polar(r, a):
    return r * math.cos(a), r * math.sin(a)


SIGNS_V = ATLAS['signs_v']['rects']
SIGNS_H = ATLAS['signs_h']['rects']
ADS = ATLAS['ads']['rects']
MONITORS = ATLAS['monitors']['rects']


def atlas_rect(atlas, text):
    return next(r for r in ATLAS[atlas]['rects'] if r['text'] == text)


def panel(mb, c, normal, w, z0, z1, mat, uv, back=None):
    """Display plane centred at c (XY) facing `normal`, mapped to an atlas rect uv = (u0, v0, u1, v1).

    back: depth of a second, mirrored face behind it — a two-sided blade reads correctly from both sides.
    """
    n = Vector((normal[0], normal[1], 0)).normalized()
    t = Z.cross(n)
    c = Vector((c[0], c[1], 0))
    u0, v0, u1, v1 = uv
    a, b = c - t * w / 2, c + t * w / 2
    mb.face([(a.x, a.y, z0), (b.x, b.y, z0), (b.x, b.y, z1), (a.x, a.y, z1)], mat, uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    if back:
        a, b = a - n * back, b - n * back
        mb.face([(b.x, b.y, z0), (a.x, a.y, z0), (a.x, a.y, z1), (b.x, b.y, z1)], mat, uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


def rail_ring(mb, r, z, n=32, cx=0.0, cy=0.0, h=1.1, a0=0.0, a1=2 * math.pi):
    """Railing on a deck edge: posts about every 1.2 m, top and knee rails."""
    mb.ring(r - 0.05, r + 0.05, z + h - 0.08, z + h, 'M_WornSteel', n=n, a0=a0, a1=a1, cx=cx, cy=cy)
    mb.ring(r - 0.03, r + 0.03, z + h * 0.5 - 0.04, z + h * 0.5, 'M_WornSteel', n=n, a0=a0, a1=a1, cx=cx, cy=cy)
    posts = max(4, int(abs(a1 - a0) * r / 1.2))
    for k in range(posts + (0 if abs(a1 - a0 - 2 * math.pi) < 1e-6 else 1)):
        a = a0 + (a1 - a0) * k / posts
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        mb.obox((x, y, z), (x, y, z + h), 0.06, 0.06, 'M_WornSteel')


def cable(mb, p0, p1, sag, r=0.05, n=10, mat='M_DarkMetal'):
    """Hanging cable between two points: a catenary-like parabola sagging by `sag` m."""
    p0, p1 = Vector(p0), Vector(p1)
    pts = [p0.lerp(p1, k / n) - Z * (sag * 4 * (k / n) * (1 - k / n)) for k in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        mb.tube(a, b, r, mat, n=4)


def dish(mb, c, axis, rad, depth, seg=16, rings=4):
    """Satellite dish: paraboloid shell opening along `axis`, rim, feed horn on three struts, back mount."""
    c, axis = Vector(c), Vector(axis).normalized()
    u = axis.cross(Z if abs(axis.z) < 0.95 else Vector((1, 0, 0))).normalized()
    v = axis.cross(u)
    ring = lambda k, off: [c + axis * (depth * (k / rings) ** 2 + off) + (u * math.cos(a) + v * math.sin(a)) * rad * k / rings
                           for a in (2 * math.pi * j / seg for j in range(seg))]
    for k in range(rings):
        A, B = ring(k, 0), ring(k + 1, 0)
        Ab, Bb = ring(k, -0.06), ring(k + 1, -0.06)
        for j in range(seg):
            j2 = (j + 1) % seg
            mb.face([A[j], B[j], B[j2], A[j2]], 'M_WornSteel')
            mb.face([Ab[j], Ab[j2], Bb[j2], Bb[j]], 'M_DarkMetal')
    rim = ring(rings, 0)
    for a, b in zip(rim, rim[1:] + rim[:1]):
        mb.tube(a, b, 0.04, 'M_DarkMetal', n=4)
    feed = c + axis * depth * 2.2
    for j in (0, seg // 3, 2 * seg // 3):
        mb.tube(rim[j], feed, 0.03, 'M_WornSteel', n=4)
    mb.obox(feed - axis * 0.15, feed + axis * 0.15, 0.16, 0.16, 'M_TechPolymer')
    mb.obox(c - axis * 0.1, c - axis * 0.9, 0.3, 0.3, 'M_DarkMetal')


EMIT_WEIGHTED = ['M_CyanEmission'] * 4 + ['M_MagentaEmission'] * 3 + ['M_AmberEmission'] * 2 + ['M_RedEmission']


# ──────────────────────────────────────────────────────────── shared assets
ASSET = {}


def build_assets():
    """Source meshes placed as linked instances (ROOF-01, vents, beacons, sign frames)."""
    roof = MB()
    roof.prism(rect(0, 0, 10, 8, 0), 0, 0.6, 'M_WornSteel')
    for k, (x, y) in enumerate(((-2.8, -1.8), (0.4, -1.8), (-2.8, 1.6))):
        roof.prism(rect(x, y, 2.6, 2.6, 0), 0.6, 2.6, 'M_TechPolymer')
        roof.ring(0.6, 1.1, 2.6, 2.9, 'M_DarkMetal', n=10, cx=x, cy=y)
    roof.prism(rect(3.2, 1.8, 2.4, 3.2, 0), 0.6, 4.0, 'M_DarkMetal')
    roof.tube((3.2, 1.8, 4.0), (3.2, 1.8, 9.0), 0.12, 'M_WornSteel', n=5)
    roof.obox((-4.5, 3.4, 0.9), (4.5, 3.4, 0.9), 0.5, 0.5, 'M_WornSteel')
    roof.prism(rect(3.2, -2.6, 1.0, 0.6, 0), 2.4, 2.8, 'M_AmberEmission')
    ASSET['ROOF-01'] = roof.to_object('ASSET_ROOF-01', COLL['ASSETS']).data

    vent = MB()
    vent.prism(rect(0, 0, 3.0, 1.8, 0), 0, 1.6, 'M_TechPolymer')
    for k in range(4):
        vent.obox((-1.3, -0.95, 0.3 + k * 0.32), (1.3, -0.95, 0.3 + k * 0.32), 0.08, 0.1, 'M_WornSteel')
    ASSET['VENT'] = vent.to_object('ASSET_VENT', COLL['ASSETS']).data

    beacon = MB()
    beacon.prism(ngon(0, 0, 0.45, 6), 0, 0.9, 'M_RedEmission')
    ASSET['BEACON'] = beacon.to_object('ASSET_BEACON', COLL['ASSETS']).data


def place_instance(asset, name, coll, loc, rot=0.0, scale=1.0):
    ob = bpy.data.objects.new(name, ASSET[asset])
    ob.location = loc
    ob.rotation_euler = (0, 0, rot)
    ob.scale = (scale, scale, scale)
    coll.objects.link(ob)
    return ob


# ───────────────────────────────────────────────────────────── layout model
class Volume:
    """One extruded segment of a stack: oriented rectangle or n-gon."""

    def __init__(self, cx, cy, w, d, rot, z0, z1, round_=False):
        self.cx, self.cy, self.w, self.d, self.rot, self.z0, self.z1, self.round = cx, cy, w, d, rot, z0, z1, round_

    def poly(self):
        return ngon(self.cx, self.cy, self.w / 2, 12, self.rot) if self.round else rect(self.cx, self.cy, self.w, self.d, self.rot)

    def contains_z(self, z, margin=2.0):
        return self.z0 + margin < z < self.z1 - margin

    def surface_toward(self, target):
        """Point on this footprint boundary towards target (XY), at the footprint centre height."""
        c = Vector((self.cx, self.cy, 0))
        d = (Vector((target[0], target[1], 0)) - c)
        d.normalize()
        if self.round:
            return c + d * (self.w / 2)
        # Ray from the centre against the oriented rectangle
        lx = Vector((math.cos(self.rot), math.sin(self.rot), 0))
        ly = Vector((-math.sin(self.rot), math.cos(self.rot), 0))
        tx = (self.w / 2) / max(1e-6, abs(d.dot(lx)))
        ty = (self.d / 2) / max(1e-6, abs(d.dot(ly)))
        return c + d * min(tx, ty)


class Stack:
    def __init__(self, sid, az, r, kind, band):
        self.id, self.az, self.r, self.kind, self.band = sid, az, r, kind, band
        self.x, self.y = polar(r, az)
        self.volumes = []
        self.radius = 0.0

    def at(self, z):
        for v in self.volumes:
            if v.contains_z(z):
                return v
        return None

    @property
    def top(self):
        return max(v.z1 for v in self.volumes) if self.volumes else Z_MIN


STACKS = []
STATS = {'bridges': [], 'signs': 0, 'instances': 0}


def helix_angle(z):
    return (MOUNTS['top_z_m'] - z) / MOUNTS['spacing_z_m'] * MOUNTS['turn_rad_per_slide']


def blender_az(a):
    """Slide-convention angle (from +X towards -Y) to a Blender azimuth (from +X towards +Y)."""
    return -a


def in_canyon(az, r):
    d = math.degrees((az + math.pi / 2 + math.pi) % (2 * math.pi) - math.pi)
    return r > 60 and abs(d) < HERO_CANYON_DEG


def free_spot(x, y, rad, z0, z1, margin=3.0):
    for s in STACKS:
        if math.hypot(s.x - x, s.y - y) < (s.radius + rad) * 0.82 + margin:
            if not (z1 < min(v.z0 for v in s.volumes) or z0 > s.top):
                return False
    return True


def make_stack(sid, az, r, band, top, base=Z_MIN, footprint=None, kind=None):
    """A building stack from the lowest zone upwards: industrial base, mid-rise body, tower top."""
    s = Stack(sid, az, r, kind or band, band)
    w0, d0 = footprint or {'inner': (rng.uniform(9, 14), rng.uniform(8, 12)),
                           'middle': (rng.uniform(14, 24), rng.uniform(12, 20)),
                           'outer': (rng.uniform(16, 26), rng.uniform(14, 22))}[band]
    rot = az + math.pi / 2 + rng.uniform(-0.25, 0.25)
    rnd = rng.random() < (0.12 if band != 'inner' else 0.05)
    z = base
    w, d = w0, d0
    cx, cy = s.x, s.y
    while z < top - 4:
        if z < -96:
            h = rng.uniform(18, 34)
        elif z < 48:
            h = rng.uniform(26, 62)
        else:
            h = rng.uniform(30, 80)
        h = min(h, top - z)
        s.volumes.append(Volume(cx, cy, w, d, rot, z, z + h, rnd))
        z += h
        if rng.random() < 0.22 and z < top - 30:
            z += rng.uniform(6, 10)    # open structural frame level between blocks
            s.volumes[-1].frame_above = True
        # Setback: shrink and shift, never grow — a readable stepped silhouette
        k = 1.0 if rng.random() < 0.45 else rng.uniform(0.8, 0.95)
        w, d = w * k, d * k
        cx += rng.uniform(-1.5, 1.5)
        cy += rng.uniform(-1.5, 1.5)
        if w < 5:
            break
    s.radius = math.hypot(w0, d0) / 2
    STACKS.append(s)
    return s


def layout():
    inner, middle, outer = BANDS['inner'], BANDS['middle'], BANDS['outer']
    # Inner pylons at the shaft edge: opposite the slide helix, between slides
    for k in (1, 4, 7, 10):
        zb = MOUNTS['top_z_m'] - MOUNTS['spacing_z_m'] * (k + 0.5)
        a = blender_az(helix_angle(zb)) + math.pi
        make_stack(f'IPY-{k:02d}', a, 53.0, 'inner', top=zb + rng.uniform(30, 60), footprint=(10, 8), kind='pylon')
    # Primary towers TWR-01..04 in distinct sectors
    mains = []
    for tid, az_deg, r in (('TWR-01', 28, 78), ('TWR-02', 128, 104), ('TWR-03', 212, 74), ('TWR-04', 305, 58)):
        o = OBJ[tid]['dimensions_m']
        s = Stack(tid, math.radians(az_deg), r, 'main', 'middle')
        s.radius = math.hypot(o['x'], o['y']) / 2 + 2
        s.volumes.append(Volume(s.x, s.y, o['x'], o['y'], math.radians(az_deg) + math.pi / 2, Z_MIN, Z_MIN + o['z'], tid == 'TWR-04'))
        STACKS.append(s)
        mains.append(s)
    # Fill: per sector a density, then rejection sampling by band
    per_band = {'inner': 5, 'middle': 12, 'outer': 16}
    sizes = {'inner': ((6, 10), (6, 9)), 'middle': ((8, 18), (7, 15)), 'outer': ((9, 22), (8, 18))}
    # Upper zone (R2): needle towers with ring decks reach +104..+128, lattice spires up to +144
    for k in range(16):
        for _ in range(60):
            az = 2 * math.pi * (k + rng.uniform(0.1, 0.9)) / 16
            r = rng.uniform(70, R_MAX - 10)
            if any(abs(r - (a + b) / 2) < 13 for a, b in RING_ROADS) or in_canyon(az, r):
                continue
            x, y = polar(r, az)
            if free_spot(x, y, 11, Z_MIN, Z_MAX, margin=3.0):
                make_spire_tower(f'SPR-{k:02d}', az, r, rng.uniform(104, 128))
                break
    tops = {'inner': (-10, 100), 'middle': (20, 136), 'outer': (50, 144)}
    for sec in range(SECTORS):
        density = rng.choice([0.6, 0.8, 1.0, 1.0, 1.2])
        a0 = math.radians(sec * 360 / SECTORS)
        for band, (r0, r1) in (('inner', inner), ('middle', middle), ('outer', outer)):
            want = max(1, round(per_band[band] * density))
            placed, tries = 0, 0
            while placed < want and tries < 900:
                tries += 1
                (wa, wb), (da, db) = sizes[band]
                fp = (rng.uniform(wa, wb), rng.uniform(da, db))
                rad = math.hypot(*fp) / 2
                az = a0 + rng.uniform(0.02, 1) * math.radians(360 / SECTORS)
                r = rng.uniform(max(r0, SHAFT + rad + 1.5), min(r1, R_MAX - rad))
                # Footprint must clear the shaft, the transit annuli and the hero canyon
                if r - rad < SHAFT + 3.5 or any(abs(r - (a + b) / 2) < 4 + rad + 1.5 for a, b in RING_ROADS) or in_canyon(az, r):
                    continue
                x, y = polar(r, az)
                top = rng.uniform(*tops[band])
                if not free_spot(x, y, rad, Z_MIN, top, margin=1.2):
                    continue
                make_stack(f'S{sec:02d}-{band[0].upper()}{placed:02d}', az, r, band, top, footprint=fp)
                placed += 1
    return mains


# ──────────────────────────────────────────────────────────── construction
def facade_for(s, v):
    if s.kind in ('pylon',):
        return 'M_Facade_Glass'
    if v.z1 < -80:
        return 'M_Facade_Indus'
    return {'inner': 'M_Facade_Glass', 'middle': rng.choice(['M_Facade_Office', 'M_Facade_Resid']),
            'outer': rng.choice(['M_Facade_Office', 'M_Facade_Glass', 'M_Facade_Resid'])}.get(s.band, 'M_Facade_Office')


def facade_details(mb, s, v, i):
    """R08 / R09 vocabulary on one segment: ledges, pilasters, truss bay, balconies, service core."""
    if v.round:
        # Round shafts: ring ledges every 12 m, light line on every third
        for k, z in enumerate(np.arange(v.z0 + 8, v.z1 - 2, 12.0)):
            mb.ring(v.w / 2, v.w / 2 + 0.7, z, z + 0.45, 'M_DarkMetal', n=16, cx=v.cx, cy=v.cy)
            if k % 3 == 1:
                mb.ring(v.w / 2 + 0.6, v.w / 2 + 0.75, z + 0.1, z + 0.3, rng.choice(EMIT_WEIGHTED), n=16, cx=v.cx, cy=v.cy)
        return
    pts = rect(v.cx, v.cy, v.w, v.d, v.rot)
    # Floor ledges: thin slabs every 9-15 m, a stepped horizontal rhythm
    step = rng.choice([9.6, 12.0, 14.4])
    for z in np.arange(v.z0 + step, v.z1 - 2, step):
        mb.prism(rect(v.cx, v.cy, v.w + 0.9, v.d + 0.9, v.rot), z, z + 0.4, 'M_DarkMetal')
    # Corner pilasters
    for (x, y) in pts:
        mb.prism(rect(x, y, 1.1, 1.1, v.rot), v.z0, v.z1, 'M_WornSteel', top=True, bottom=False)
    faces = [(Vector((*pts[k], 0)), Vector((*pts[(k + 1) % 4], 0))) for k in range(4)]
    centre = Vector((v.cx, v.cy, 0))

    def outward(a, b):
        m = (a + b) / 2
        return (m - centre).normalized(), m

    h = v.z1 - v.z0
    # Exposed truss bay on one face (R08 third tower): verticals and X braces 1.4 m off the wall
    if h > 20 and rng.random() < 0.38:
        a, b = faces[rng.randrange(4)]
        n_, m = outward(a, b)
        a2, b2 = a + n_ * 1.4 + (b - a) * 0.12, b + n_ * 1.4 - (b - a) * 0.12
        bay = 8.0
        for p in (a2, b2):
            mb.obox((p.x, p.y, v.z0 + 2), (p.x, p.y, v.z1 - 1), 0.5, 0.5, 'M_WornSteel')
        for z in np.arange(v.z0 + 2, v.z1 - bay, bay):
            mb.obox((a2.x, a2.y, z), (b2.x, b2.y, z), 0.3, 0.3, 'M_WornSteel')
            mb.obox((a2.x, a2.y, z), (b2.x, b2.y, z + bay), 0.22, 0.22, 'M_DarkMetal')
            mb.obox((b2.x, b2.y, z), (a2.x, a2.y, z + bay), 0.22, 0.22, 'M_DarkMetal')
    # Balconies with rails on residential segments (R08 fourth building)
    if s.kind != 'main' and h > 14 and rng.random() < 0.45:
        a, b = faces[rng.randrange(4)]
        n_, m = outward(a, b)
        t = (b - a).normalized()
        span = (b - a).length * 0.8
        for z in np.arange(v.z0 + 4.8, v.z1 - 3, 7.2):
            c = m + n_ * 0.7
            p0, p1 = c - t * span / 2, c + t * span / 2
            mb.obox((p0.x, p0.y, z), (p1.x, p1.y, z), 1.4, 0.25, 'M_DarkMetal')
            q0, q1 = p0 + n_ * 0.65, p1 + n_ * 0.65
            mb.obox((q0.x, q0.y, z + 1.05), (q1.x, q1.y, z + 1.05), 0.08, 0.08, 'M_WornSteel')
            if rng.random() < 0.3:
                mb.obox((q0.x, q0.y, z + 0.2), (q1.x, q1.y, z + 0.2), 0.06, 0.1, 'M_AmberEmission')
    # Service core: a narrow shaft on one side with a vertical light strip (R08 first tower)
    if h > 30 and rng.random() < 0.3:
        a, b = faces[rng.randrange(4)]
        n_, m = outward(a, b)
        c = m + n_ * 1.6 + (b - a) * rng.uniform(-0.25, 0.25)
        mb.prism(rect(c.x, c.y, 3.4, 3.2, math.atan2(n_.y, n_.x) + math.pi / 2), v.z0, v.z1 + 3, 'M_CoatedPanel', cap='M_DarkMetal')
        q = c + n_ * 1.65
        mb.obox((q.x, q.y, v.z0 + 2), (q.x, q.y, v.z1 + 2), 0.25, 0.2, rng.choice(EMIT_WEIGHTED))


def roof_plant(s, top):
    """ROOF-01 pack, AC units and a lattice mast with a beacon (R08 roof pack, R09 antenna)."""
    place_instance('ROOF-01', f'ROOF-01_{s.id}', COLL['80_DETAILS'], (top.cx, top.cy, top.z1 + 0.4), top.rot, min(1.0, top.w / 11))
    STATS['instances'] += 1
    for k in range(rng.randint(1, 3)):
        off = Vector((rng.uniform(-0.3, 0.3) * top.w, rng.uniform(-0.3, 0.3) * top.d, 0))
        place_instance('VENT', f'VENT_{s.id}_{k}', COLL['80_DETAILS'], (top.cx + off.x, top.cy + off.y, top.z1 + 0.4), top.rot)
        STATS['instances'] += 1
    if top.z1 > 30 and rng.random() < 0.75:
        det = MB()
        h = rng.uniform(12, 30) if top.z1 < 120 else rng.uniform(8, 16)
        h = min(h, Z_MAX - top.z1)
        x0, y0 = top.cx, top.cy
        r = 0.9
        legs = [(x0 + r * math.cos(a), y0 + r * math.sin(a)) for a in (0, 2.09, 4.19)]
        for (x, y) in legs:
            det.obox((x, y, top.z1), (x0, y0, top.z1 + h), 0.16, 0.16, 'M_WornSteel')
        for z in np.arange(top.z1 + 2, top.z1 + h - 2, 2.5):
            f = 1 - (z - top.z1) / h
            for k in range(3):
                (ax, ay), (bx, by) = legs[k], legs[(k + 1) % 3]
                det.obox((x0 + (ax - x0) * f, y0 + (ay - y0) * f, z), (x0 + (bx - x0) * f, y0 + (by - y0) * f, z), 0.08, 0.08, 'M_DarkMetal')
        if rng.random() < 0.5:
            det.prism(ngon(x0 + 0.9, y0, 0.7, 8), top.z1 + h * 0.5, top.z1 + h * 0.5 + 0.15, 'M_WornSteel')
        det.to_object(f'MAST_{s.id}', COLL['80_DETAILS'])
        place_instance('BEACON', f'BEACON_{s.id}', COLL['70_NEON_LIGHTS'], (x0, y0, top.z1 + h), 0, 0.6)
    # Rooftop sign on a lattice frame, facing the axis (R01 skyline signs)
    if top.z1 < 132 and not top.round and rng.random() < 0.55:
        r_ = rng.choice(SIGNS_H)
        wdt = min(rng.uniform(5.0, 8.0) * r_['aspect'], top.w * 0.95)
        hgt = wdt / r_['aspect']
        inward = (Vector((0, 0, 0)) - Vector((top.cx, top.cy, 0))).normalized()
        side = Z.cross(inward)
        c = Vector((top.cx, top.cy, 0)) + inward * min(top.w, top.d) * 0.25
        z0 = top.z1 + 0.4 + 2.2
        rs = MB()
        rs.obox(c - side * wdt / 2 - inward * 0.3 + Z * (z0 + hgt / 2), c + side * wdt / 2 - inward * 0.3 + Z * (z0 + hgt / 2), 0.5, hgt + 0.3, 'M_DarkMetal')
        panel(rs, c, inward, wdt, z0, z0 + hgt, 'M_SignAtlas_H', r_['uv'])
        for t in (-0.42, 0, 0.42):
            q = c + side * wdt * t - inward * 0.3
            rs.obox((q.x, q.y, top.z1 + 0.4), (q.x, q.y, z0), 0.25, 0.25, 'M_WornSteel')
            q2 = q - inward * 2.0
            rs.obox((q2.x, q2.y, top.z1 + 0.4), (q.x, q.y, z0 + hgt * 0.6), 0.12, 0.12, 'M_WornSteel')
        rs.to_object(f'SIGN-ROOF_{s.id}', COLL['60_SIGNS_SCREENS'])
        STATS['signs'] += 1


def build_stack(s):
    mb = MB()
    mb.off = (rng.random(), rng.random())
    for i, v in enumerate(s.volumes):
        fac = facade_for(s, v)
        mb.prism(v.poly(), v.z0, v.z1, fac, cap='M_DarkMetal', bottom=(i == 0 and v.z0 > Z_MIN + 1))
        mb.prism(rect(v.cx, v.cy, v.w + 1.2, v.d + 1.2, v.rot) if not v.round else ngon(v.cx, v.cy, v.w / 2 + 0.6, 12, v.rot),
                 v.z1 - 0.6, v.z1 + 0.4, 'M_DarkMetal')
        if getattr(v, 'frame_above', False) and i + 1 < len(s.volumes):
            nxt = s.volumes[i + 1]
            # Exposed structural frame: corner columns, X braces and a recessed core up to the next block
            corners = rect(nxt.cx, nxt.cy, nxt.w * 0.9, nxt.d * 0.9, nxt.rot)
            for k, (x, y) in enumerate(corners):
                mb.obox((x, y, v.z1), (x, y, nxt.z0), 1.0, 1.0, 'M_WornSteel')
                bx, by = corners[(k + 1) % 4]
                mb.obox((x, y, v.z1), (bx, by, nxt.z0), 0.35, 0.35, 'M_DarkMetal')
            mb.prism(rect(nxt.cx, nxt.cy, nxt.w * 0.6, nxt.d * 0.6, nxt.rot), v.z1, nxt.z0, 'M_Concrete')
            mb.prism(rect(nxt.cx, nxt.cy, nxt.w * 0.62, nxt.d * 0.62, nxt.rot), (v.z1 + nxt.z0) / 2, (v.z1 + nxt.z0) / 2 + 0.3,
                     'M_AmberEmission')
        facade_details(mb, s, v, i)
        # Neon edges on some segments
        if v.z0 > -110 and rng.random() < 0.35 and not v.round:
            mat = rng.choice(EMIT_WEIGHTED)
            pts = rect(v.cx, v.cy, v.w + 0.2, v.d + 0.2, v.rot)
            for k in rng.sample(range(4), 2):
                x, y = pts[k]
                mb.obox((x, y, v.z0 + 2), (x, y, v.z1 - 1), 0.3, 0.3, mat)
        if v.z0 > -60 and rng.random() < 0.3:
            mat = rng.choice(EMIT_WEIGHTED)
            pts = v.poly()
            zb = v.z1 - 3
            for k in range(len(pts)):
                a, b = pts[k], pts[(k + 1) % len(pts)]
                mb.obox((a[0], a[1], zb), (b[0], b[1], zb), 0.25, 0.35, mat)
    coll = COLL['10_MAIN_TOWERS'] if s.kind == 'main' else COLL['20_BUILDINGS']
    ob = mb.to_object(f'BLD_{s.id}', coll)
    ob['stack_id'] = s.id
    roof_plant(s, s.volumes[-1])
    return ob


def make_spire_tower(sid, az, r, top):
    """Upper-zone needle tower (R04 top row, R05A): tapered tiers, ring decks, lattice spire."""
    s = Stack(sid, az, r, 'spire', 'middle' if r < 94 else 'outer')
    w = rng.uniform(11, 16)
    rnd = rng.random() < 0.45
    rot = az + math.pi / 2
    z = Z_MIN
    tiers = [(Z_MIN, rng.uniform(-30, 20), 1.0), (None, rng.uniform(55, 85), 0.78), (None, top, 0.55)]
    for z0, z1, k in tiers:
        z0 = z if z0 is None else z0
        s.volumes.append(Volume(s.x, s.y, w * k, w * k * (1 if rnd else 0.85), rot, z0, z1, rnd))
        z = z1
    s.radius = w / 2 * 1.2 + 5
    s.decks = sorted(rng.sample([v.z1 for v in s.volumes[:-1]] + [top - rng.uniform(8, 18)], 2))
    STACKS.append(s)
    return s


def build_spire_tower(s):
    mb = MB()
    top = s.volumes[-1]
    for i, v in enumerate(s.volumes):
        mb.prism(v.poly(), v.z0, v.z1, 'M_Facade_Glass' if i else 'M_Facade_Office', cap='M_DarkMetal')
        facade_details(mb, s, v, i)
        # Vertical light strips running the tier height
        for k in (0, 2):
            x, y = v.poly()[k * (len(v.poly()) // 4)]
            mb.obox((x, y, v.z0 + 2), (x, y, v.z1 - 1), 0.25, 0.25, rng.choice(['M_CyanEmission', 'M_MagentaEmission']))
    # Saucer ring decks with a neon rim (R01 right tower, R04)
    for z in s.decks:
        v = s.at(z - 1) or top
        r0 = v.w / 2
        mb.ring(r0, r0 + 5.5, z - 1.2, z, 'M_DarkMetal', n=28, cx=s.x, cy=s.y)
        mb.ring(r0 + 5.2, r0 + 5.6, z, z + 1.1, 'M_WornSteel', n=28, cx=s.x, cy=s.y)
        mb.ring(r0 + 5.5, r0 + 5.7, z - 0.9, z - 0.4, rng.choice(['M_CyanEmission', 'M_MagentaEmission', 'M_AmberEmission']), n=28, cx=s.x, cy=s.y)
        mb.ring(r0 + 0.2, r0 + 1.6, z - 4, z - 1.2, 'M_TechPolymer', n=16, cx=s.x, cy=s.y)
    # Lattice spire on the crown
    h = min(Z_MAX - top.z1, rng.uniform(14, 26))
    base = top.w * 0.32
    legs = [(s.x + base * math.cos(a), s.y + base * math.sin(a)) for a in (0.4, 2.5, 4.6)]
    for (x, y) in legs:
        mb.obox((x, y, top.z1), (s.x, s.y, top.z1 + h), 0.3, 0.3, 'M_WornSteel')
    for z in np.arange(top.z1 + 3, top.z1 + h - 3, 3.0):
        f = 1 - (z - top.z1) / h
        for k in range(3):
            (ax, ay), (bx, by) = legs[k], legs[(k + 1) % 3]
            mb.obox((s.x + (ax - s.x) * f, s.y + (ay - s.y) * f, z), (s.x + (bx - s.x) * f, s.y + (by - s.y) * f, z), 0.12, 0.12, 'M_DarkMetal')
    mb.tube((s.x, s.y, top.z1 + h * 0.6), (s.x, s.y, top.z1 + h), 0.12, rng.choice(['M_CyanEmission', 'M_MagentaEmission']), n=5)
    ob = mb.to_object(f'BLD_{s.id}', COLL['20_BUILDINGS'])
    ob['stack_id'] = s.id
    place_instance('BEACON', f'BEACON_{s.id}', COLL['70_NEON_LIGHTS'], (s.x, s.y, top.z1 + h), 0, 0.7)


VIDEO_WIDE, VIDEO_TALL = 4, 2   # channels 0-3 are 16:9, 4-5 are 9:16 (tower/screens.js)


def build_screens(s):
    """Large video screens on faces that look into the shaft (R01, R05A): bezel, brackets back to
    the wall, a service catwalk and a light bar. The face carries M_Video_<channel>."""
    if s.kind == 'main':
        return
    chance = {'inner': 0.6, 'middle': 0.55, 'outer': 0.45}[s.band]
    for v in s.volumes:
        if v.round or v.z1 - v.z0 < 16 or not (-110 < v.z1 and v.z0 < 135) or rng.random() > chance:
            continue
        inward = (Vector((0, 0, 0)) - Vector((v.cx, v.cy, 0))).normalized()
        side = Z.cross(inward).normalized()
        p = v.surface_toward((0, 0)) + inward * 1.2
        half = (v.surface_toward((v.cx + side.x * 1000, v.cy + side.y * 1000)) - Vector((v.cx, v.cy, 0))).length
        if rng.random() < 0.6:
            ch = rng.randrange(VIDEO_WIDE)
            wdt = min(2 * half * 0.92, rng.uniform(14, 24))
            hgt = wdt * 9 / 16
        else:
            ch = VIDEO_WIDE + rng.randrange(VIDEO_TALL)
            hgt = min(v.z1 - v.z0 - 4, rng.uniform(14, 22))
            wdt = hgt * 9 / 16
        if hgt > v.z1 - v.z0 - 4 or wdt < 6:
            continue
        zb = rng.uniform(v.z0 + 2, v.z1 - hgt - 2)
        if any(zb < b + 1.5 and zb + hgt > a - 1.5 for a, b in getattr(v, 'used', [])):
            continue
        v.used = getattr(v, 'used', []) + [(zb, zb + hgt)]
        mb = MB()
        a, b = p - side * wdt / 2, p + side * wdt / 2
        panel(mb, p, inward, wdt, zb, zb + hgt, f'M_Video_{ch}', (0, 0, 1, 1))
        # Bezel: a frame in front of the face edge, corner caps, brackets to the wall
        fa, fb = a + inward * 0.15, b + inward * 0.15
        for z in (zb - 0.35, zb + hgt + 0.35):
            mb.obox((fa.x, fa.y, z), (fb.x, fb.y, z), 0.7, 0.7, 'M_DarkMetal')
        for q in (fa, fb):
            mb.obox((q.x, q.y, zb - 0.7), (q.x, q.y, zb + hgt + 0.7), 0.7, 0.7, 'M_DarkMetal')
        for t in (0.15, 0.5, 0.85):
            q = a + (b - a) * t
            w_ = q - inward * 1.2
            for z in (zb + 1.5, zb + hgt - 1.5):
                mb.obox((q.x, q.y, z), (w_.x, w_.y, z), 0.3, 0.3, 'M_WornSteel')
            mb.obox((q.x, q.y, zb + 1.5), (w_.x, w_.y, zb + hgt * 0.5), 0.16, 0.16, 'M_WornSteel')
        # Catwalk with rail and floodlights under the screen, a light bar on top
        walk = p + inward * 0.4 + Z * (zb - 1.1)
        mb.obox(walk - side * wdt / 2, walk + side * wdt / 2, 1.4, 0.15, 'M_DarkMetal')
        rail = walk + inward * 0.65 + Z * 1.0
        mb.obox(rail - side * wdt / 2, rail + side * wdt / 2, 0.06, 0.06, 'M_WornSteel')
        for t in np.linspace(-0.42, 0.42, 4):
            q = walk + side * wdt * t + inward * 0.55
            mb.obox(q, q + Z * 1.0, 0.06, 0.06, 'M_WornSteel')
        mb.obox((fa.x, fa.y, zb + hgt + 0.95), (fb.x, fb.y, zb + hgt + 0.95), 0.22, 0.16, rng.choice(['M_CyanEmission', 'M_MagentaEmission', 'M_AmberEmission']))
        mb.to_object(f'SCREEN_{s.id}_{int(zb)}', COLL['60_SIGNS_SCREENS'])
        STATS['signs'] += 1


def build_trains():
    """Short trains on the TRN-01 decks: cars with lit window bands (R01, R05A)."""
    mb = MB()
    for ring, levels in TRANSIT_LEVELS:
        rc = (ring[0] + ring[1]) / 2
        for z in levels:
            for t in range(rng.randint(1, 2)):
                a0 = rng.uniform(0, 2 * math.pi)
                if abs(((a0 + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < 0.5:
                    continue
                lane = rc + rng.choice([-1.8, 1.8])
                for car in range(rng.randint(3, 5)):
                    a = a0 + car * 13.5 / lane
                    b = a + 12.5 / lane
                    p0, p1 = Vector((*polar(lane, a), z + 0.4)), Vector((*polar(lane, b), z + 0.4))
                    mb.obox(p0 + Z * 1.6, p1 + Z * 1.6, 3.0, 3.0, 'M_CoatedPanel')
                    n_ = Vector((math.cos((a + b) / 2), math.sin((a + b) / 2), 0))
                    for sgn in (-1, 1):
                        mb.obox(p0 + Z * 2.2 + n_ * sgn * 1.52, p1 + Z * 2.2 + n_ * sgn * 1.52, 0.05, 0.9,
                                'M_AmberEmission' if car % 2 else 'M_CyanEmission')
    mb.to_object('TRN-01_trains', COLL['50_ROADS_INFRASTRUCTURE'])


def build_pipes(s):
    """PIPE-01: three to six pipes up the outward face, brackets every 4 m, through module seams."""
    if rng.random() > 0.55:
        return
    v0 = s.volumes[0]
    if v0.round:
        return
    mb = MB()
    n = rng.randint(3, 6)
    out = Vector((math.cos(s.az), math.sin(s.az), 0))
    c = Vector((v0.cx, v0.cy, 0))
    p = v0.surface_toward((v0.cx + out.x * 100, v0.cy + out.y * 100))
    side = Z.cross(out).normalized()
    z1 = min(s.top - 6, rng.uniform(-30, 70))
    # A pipe bundle may only run as high as the facade it is mounted on
    for v in s.volumes:
        if v.z1 >= z1:
            z1 = min(z1, v.z1)
            break
    for k in range(n):
        q = p + out * 1.0 + side * (k - n / 2) * 1.1
        mb.tube((q.x, q.y, Z_MIN), (q.x, q.y, z1), 0.38, 'M_WornSteel', n=6)
    for z in np.arange(Z_MIN + 3, z1, 4.0):
        a = p + side * (-n / 2 - 0.6) + out * 0.5
        b = p + side * (n / 2 + 0.1) + out * 0.5
        mb.obox((a.x, a.y, z), (b.x, b.y, z), 0.25, 0.35, 'M_DarkMetal')
    mb.to_object(f'PIPE-01_{s.id}', COLL['50_ROADS_INFRASTRUCTURE'])


def build_signs(s):
    """Signs on the faces that look into the shaft (R01, R05A, R09): tategaki blades protruding from the
    side faces, lit boxes over the floors, framed ad screens with a service catwalk.

    Every inscription is a rect of the atlases printed by atlas/bake.js from the original presentation
    (signal/city.js SIGNS / FAR_SIGNS, signal/future.js ADS): meaningful Japanese with a translation.
    """
    if s.kind == 'main':
        return
    mb = MB()
    for v in s.volumes:
        v.used = []
        if v.round or v.z1 - v.z0 < 12 or not (-130 < (v.z0 + v.z1) / 2 < 130):
            continue
        count = rng.choice([0, 1, 1, 2, 2, 3] if s.band == 'inner' else [0, 0, 1, 1, 2])
        centre = Vector((v.cx, v.cy, 0))
        inward = (Vector((0, 0, 0)) - centre).normalized()
        side = Z.cross(inward).normalized()
        face = v.surface_toward((0, 0))
        half = (v.surface_toward((v.cx + side.x * 1000, v.cy + side.y * 1000)) - centre).length
        for _ in range(count):
            tall_face = v.z1 - v.z0 > 24 and s.band != 'outer'
            kind = rng.choices(['blade', 'box', 'ad', 'mega'], weights=[0.4, 0.3, 0.15, 0.35 if tall_face else 0])[0]
            if kind == 'mega':
                r_ = rng.choice([r for r in SIGNS_V if len(r['text']) <= 4])
                wdt = rng.uniform(3.5, 5.0)
                hgt = wdt / r_['aspect']
            elif kind == 'blade':
                r_ = rng.choice(SIGNS_V)
                hgt = min(len(r_['text']) * 2.5 + 2.5, 4.2 / r_['aspect'])
                wdt = hgt * r_['aspect']
            elif kind == 'box':
                r_ = rng.choice(SIGNS_H)
                hgt = rng.uniform(2.8, 4.2)
                wdt = hgt * r_['aspect']
                if wdt > 2 * half * 0.9:
                    wdt = 2 * half * 0.9
                    hgt = wdt / r_['aspect']
            else:
                r_ = rng.choice(ADS)
                if r_['tall']:
                    hgt = rng.uniform(12, 20)
                    wdt = hgt * r_['aspect']
                else:
                    wdt = min(2 * half * 0.85, rng.uniform(12, 18))
                    hgt = wdt / r_['aspect']
            if hgt > v.z1 - v.z0 - 3 or wdt > 2 * half * 0.95:
                continue
            zb = rng.uniform(v.z0 + 1.5, v.z1 - hgt - 1.5)
            if any(zb < b + 1 and zb + hgt > a - 1 for a, b in v.used):
                continue
            v.used.append((zb, zb + hgt))
            uv, zc = r_['uv'], zb + hgt / 2
            if kind == 'mega':
                # Corner of the shaft face, 2 m proud: a deep lit box, both faces along the shaft,
                # a neon tube frame on the front edge, heavy brackets and a service ladder
                sgn = rng.choice([-1, 1])
                root = face + side * sgn * half
                c = root + side * sgn * (0.9 + wdt / 2) + inward * 1.0
                mb.obox(c - side * wdt / 2 + Z * zc, c + side * wdt / 2 + Z * zc, 0.9, hgt + 0.8, 'M_DarkMetal')
                panel(mb, c + inward * 0.46, inward, wdt, zb, zb + hgt, 'M_SignAtlas_V', uv, back=0.92)
                tube = rng.choice(EMIT_WEIGHTED)
                fr = c + inward * 0.5
                for dz in (zb - 0.25, zb + hgt + 0.25):
                    mb.obox(fr - side * (wdt / 2 + 0.25) + Z * dz, fr + side * (wdt / 2 + 0.25) + Z * dz, 0.1, 0.1, tube)
                for ds in (-1, 1):
                    q = fr + side * ds * (wdt / 2 + 0.25)
                    mb.obox(q + Z * (zb - 0.25), q + Z * (zb + hgt + 0.25), 0.1, 0.1, tube)
                for z in np.linspace(zb + 1, zb + hgt - 1, 4):
                    mb.obox(root - inward * 0.5 + Z * z, c - side * sgn * wdt * 0.3 + Z * z, 0.35, 0.35, 'M_WornSteel')
                lad = root + side * sgn * 0.45 + inward * 1.6
                for dl in (-0.25, 0.25):
                    mb.obox(lad + side * dl + Z * (zb - 0.4), lad + side * dl + Z * (zb + hgt), 0.05, 0.05, 'M_WornSteel')
                for z in np.arange(zb, zb + hgt, 0.45):
                    mb.obox(lad - side * 0.25 + Z * z, lad + side * 0.25 + Z * z, 0.04, 0.04, 'M_WornSteel')
            elif kind == 'blade':
                # Out of a side face, 1.5 m behind the shaft face: both display faces look along the shaft axis
                sgn = rng.choice([-1, 1])
                root = face + side * sgn * half - inward * 1.5
                c = root + side * sgn * (0.7 + wdt / 2)
                mb.obox(root + Z * zc, root + side * sgn * (1.1 + wdt) + Z * zc, 0.4, hgt + 0.5, 'M_DarkMetal')
                panel(mb, c + inward * 0.21, inward, wdt, zb, zb + hgt, 'M_SignAtlas_V', uv, back=0.42)
                for z in (zb + hgt + 1.4, zb + hgt * 0.5):
                    mb.obox(root + Z * z, c + side * sgn * wdt * 0.35 + Z * (zb + hgt + 0.25), 0.08, 0.08, 'M_WornSteel')
                mb.tube(root + side * sgn * 0.4 + Z * (zb - 0.2), root + side * sgn * 0.4 + Z * (v.z0 + 0.5), 0.08, 'M_DarkMetal', n=4)
            elif kind == 'box':
                lim = max(0.0, half - wdt / 2) * 0.9
                c = face + side * rng.uniform(-lim, lim) + inward * 0.55
                mb.obox(c - side * wdt / 2 - inward * 0.35 + Z * zc, c + side * wdt / 2 - inward * 0.35 + Z * zc, 0.6, hgt + 0.3, 'M_DarkMetal')
                panel(mb, c + inward * 0.01, inward, wdt, zb, zb + hgt, 'M_SignAtlas_H', uv)
                hood = c + inward * 0.35 + Z * (zb + hgt + 0.3)
                mb.obox(hood - side * wdt / 2, hood + side * wdt / 2, 0.7, 0.12, 'M_DarkMetal')
                mb.obox(hood - side * wdt * 0.45 - Z * 0.1, hood + side * wdt * 0.45 - Z * 0.1, 0.06, 0.05, rng.choice(EMIT_WEIGHTED))
            else:
                lim = max(0.0, half - wdt / 2) * 0.8
                c = face + side * rng.uniform(-lim, lim) + inward * 1.1
                panel(mb, c, inward, wdt, zb, zb + hgt, 'M_Ads', uv)
                fa, fb = c - side * (wdt / 2 + 0.25) - inward * 0.2, c + side * (wdt / 2 + 0.25) - inward * 0.2
                for z in (zb - 0.25, zb + hgt + 0.25):
                    mb.obox((fa.x, fa.y, z), (fb.x, fb.y, z), 0.7, 0.5, 'M_DarkMetal')
                for q in (fa, fb):
                    mb.obox((q.x, q.y, zb - 0.5), (q.x, q.y, zb + hgt + 0.5), 0.7, 0.5, 'M_DarkMetal')
                for t in (0.15, 0.5, 0.85):
                    q = fa + (fb - fa) * t
                    w_ = q - inward * 0.9
                    for z in (zb + 1, zb + hgt - 1):
                        mb.obox((q.x, q.y, z), (w_.x, w_.y, z), 0.25, 0.25, 'M_WornSteel')
                    mb.obox((q.x, q.y, zb + 1), (w_.x, w_.y, zb + hgt * 0.5), 0.15, 0.15, 'M_WornSteel')
                # Service catwalk with a rail and two floodlights under the screen
                walk = c + inward * 0.3 + Z * (zb - 0.9)
                mb.obox(walk - side * wdt / 2, walk + side * wdt / 2, 1.3, 0.15, 'M_DarkMetal')
                rail = walk + inward * 0.6 + Z * 1.0
                mb.obox(rail - side * wdt / 2, rail + side * wdt / 2, 0.06, 0.06, 'M_WornSteel')
                for t in (-0.35, 0.35):
                    q = walk + side * wdt * t + inward * 0.5
                    mb.obox(q, q + Z * 0.9, 0.06, 0.06, 'M_WornSteel')
                    mb.obox(q + Z * 0.15, q + Z * 0.15 + inward * 0.25, 0.35, 0.22, 'M_Headlight')
            STATS['signs'] += 1
    if mb.F:
        mb.to_object(f'SIGNS_{s.id}', COLL['60_SIGNS_SCREENS'])


def bridge(name, pa, pb, z, enclosed, coll, extra=None):
    """BRG-01 / BRG-02 between two facade points: deck, beams, rails, end plates, two braces."""
    pa, pb = Vector((pa.x, pa.y, z)), Vector((pb.x, pb.y, z))
    span = (pb - pa).length
    mb = MB()
    w = 5.0 if enclosed else 2.2
    mb.obox(pa, pb, w, 0.6, 'M_DarkMetal')
    d = (pb - pa).normalized()
    side = Z.cross(d).normalized()
    # Underside beams and cable tray
    mb.obox(pa - Z * 0.8 + side * (w / 2 - 0.3), pb - Z * 0.8 + side * (w / 2 - 0.3), 0.4, 0.8, 'M_WornSteel')
    mb.obox(pa - Z * 0.8 - side * (w / 2 - 0.3), pb - Z * 0.8 - side * (w / 2 - 0.3), 0.4, 0.8, 'M_WornSteel')
    mb.obox(pa - Z * 1.4, pb - Z * 1.4, 0.8, 0.3, 'M_TechPolymer')
    if enclosed:
        for sgn in (-1, 1):
            mb.obox(pa + side * sgn * (w / 2) + Z * 1.9, pb + side * sgn * (w / 2) + Z * 1.9, 0.15, 3.2, 'M_TintedGlass')
        mb.obox(pa + Z * 3.6, pb + Z * 3.6, w + 0.4, 0.4, 'M_DarkMetal')
        mb.obox(pa + Z * 0.45 + side * (w / 2 - 0.2), pb + Z * 0.45 + side * (w / 2 - 0.2), 0.12, 0.12, 'M_CyanEmission')
        # Frame ribs every 4 m
        for t in np.arange(2, span - 1, 4.0):
            c = pa + d * t
            mb.obox(c + side * (w / 2) - Z * 0.3, c + side * (w / 2) + Z * 3.6, 0.3, 0.3, 'M_DarkMetal')
            mb.obox(c - side * (w / 2) - Z * 0.3, c - side * (w / 2) + Z * 3.6, 0.3, 0.3, 'M_DarkMetal')
    else:
        for sgn in (-1, 1):
            mb.obox(pa + side * sgn * (w / 2) + Z * 1.1, pb + side * sgn * (w / 2) + Z * 1.1, 0.1, 0.1, 'M_WornSteel')
            for t in np.arange(1, span, 2.5):
                c = pa + d * t + side * sgn * (w / 2)
                mb.obox(c, c + Z * 1.1, 0.08, 0.08, 'M_WornSteel')
    # Attachment plates and diagonal braces at both ends: two support relationships
    for end, inward in ((pa, d), (pb, -d)):
        mb.obox(end - Z * 1.5, end + Z * (4.2 if enclosed else 1.6), w + 1.0, 0.5, 'M_WornSteel', up=d)
        mb.obox(end - Z * 6, end + inward * min(6, span / 3) - Z * 0.6, 0.5, 0.5, 'M_WornSteel')
    ob = mb.to_object(name, coll)
    rec = {'id': name, 'span_m': round(span, 1), 'z': round(z, 1), 'type': 'BRG-01' if enclosed else 'BRG-02'}
    if extra:
        rec.update(extra)
    STATS['bridges'].append(rec)
    return ob


def build_bridges():
    pairs = []
    for i, a in enumerate(STACKS):
        for b in STACKS[i + 1:]:
            dist = math.hypot(a.x - b.x, a.y - b.y)
            if 18 < dist < 52:
                pairs.append((dist, a, b))
    rng.shuffle(pairs)
    made = 0
    for dist, a, b in pairs:
        if made >= 70:
            break
        lo, hi = max(Z_MIN + 20, min(a.volumes[0].z0, b.volumes[0].z0) + 10), min(a.top, b.top) - 6
        if hi - lo < 10:
            continue
        for _ in range(6):
            z = rng.uniform(lo, hi)
            va, vb = a.at(z), b.at(z)
            if va and vb:
                break
        else:
            continue
        pa, pb = va.surface_toward((vb.cx, vb.cy)), vb.surface_toward((va.cx, va.cy))
        span = (pb - pa).length
        if not 8 <= span <= 42:
            continue
        # Never cross the camera shaft or another stack at that height
        mid = (pa + pb) / 2
        if min(pa.length, pb.length, mid.length) < SHAFT + 4:
            continue
        if in_canyon(math.atan2(mid.y, mid.x), mid.length):
            continue
        blocked = False
        for s in STACKS:
            if s in (a, b) or not s.at(z):
                continue
            seg = pb - pa
            t = max(0, min(1, (Vector((s.x, s.y, 0)) - pa).dot(seg) / seg.length_squared))
            if (pa + seg * t - Vector((s.x, s.y, 0))).length < s.radius + 2:
                blocked = True
                break
        if blocked:
            continue
        enclosed = span >= 18
        bridge(f"{'BRG-01' if enclosed else 'BRG-02'}_{a.id}_{b.id}", pa, pb, z, enclosed, COLL['40_BRIDGES_PLATFORMS'],
               {'from': a.id, 'to': b.id})
        made += 1


def build_transit():
    """TRN-01 rings in the two reserved annuli; columns run down through every module."""
    mb = MB()
    sup = MB()
    for (r0, r1), levels in TRANSIT_LEVELS:
        rc = (r0 + r1) / 2
        for z in levels:
            # Both rings open in front of the hero camera: a clear canyon to the spire
            gap = -math.pi / 2
            a0, a1 = gap + 0.35, gap + 2 * math.pi - 0.35
            mb.ring(rc - 4, rc + 4, z - 1.1, z + 0.4, 'M_AsphaltDry', n=72, a0=a0, a1=a1)
            mb.ring(rc - 4, rc - 3.6, z + 0.4, z + 1.5, 'M_DarkMetal', n=72, a0=a0, a1=a1)
            mb.ring(rc + 3.6, rc + 4, z + 0.4, z + 1.5, 'M_DarkMetal', n=72, a0=a0, a1=a1)
            mb.ring(rc - 3.7, rc - 3.5, z + 1.5, z + 1.7, rng.choice(['M_CyanEmission', 'M_MagentaEmission']), n=72, a0=a0, a1=a1)
            mb.ring(rc - 1.2, rc + 1.2, z - 2.2, z - 1.1, 'M_WornSteel', n=72, a0=a0, a1=a1)
    for (r0, r1) in RING_ROADS:
        rc = (r0 + r1) / 2
        for k in range(16):
            a = 2 * math.pi * k / 16 + 0.1
            if in_canyon(a, rc):
                continue
            x, y = polar(rc, a)
            sup.prism(rect(x, y, 2.2, 2.2, a), Z_MIN, 60 if rc > 80 else 36, 'M_Concrete', top=True, bottom=False)
    mb.to_object('TRN-01_rings', COLL['50_ROADS_INFRASTRUCTURE'])
    sup.to_object('TRN-01_supports', COLL['50_ROADS_INFRASTRUCTURE'])


def build_lower_zone():
    """Tanks, ducts and wet service platforms between the stacks of the lower modules."""
    mb = MB()
    wet = MB()
    for k in range(40):
        az = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(SHAFT + 6, R_MAX - 6)
        x, y = polar(r, az)
        z = rng.uniform(Z_MIN, -60)
        if not free_spot(x, y, 7, z, z + 14, margin=1) or in_canyon(az, r):
            continue
        h = rng.uniform(8, 14)
        mb.prism(ngon(x, y, rng.uniform(3, 5), 10), z, z + h, 'M_WornSteel')
        mb.ring(0, 2.0, z + h, z + h + 0.6, 'M_DarkMetal', n=10, cx=x, cy=y)
        wet.prism(ngon(x, y, 7.5, 8, az), z - 0.8, z, 'M_AsphaltWet')
    # Duct runs: horizontal rings of pipes in the lower modules
    for z, rc in ((-118, 80), (-86, 104), (-132, 58)):
        for off in (-0.9, 0, 0.9):
            pts = [polar(rc + off, 2 * math.pi * k / 40) for k in range(41)]
            for k in range(40):
                a, b = pts[k], pts[k + 1]
                mb.tube((a[0], a[1], z), (b[0], b[1], z), 0.45, 'M_WornSteel', n=6)
    mb.to_object('UTL-tanks-ducts', COLL['50_ROADS_INFRASTRUCTURE'])
    wet.to_object('UTL-wet-platforms', COLL['40_BRIDGES_PLATFORMS'])
    for k in range(24):
        az = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(SHAFT + 8, R_MAX - 8)
        x, y = polar(r, az)
        z = rng.uniform(Z_MIN + 2, -50)
        if free_spot(x, y, 3, z, z + 2, margin=0.5):
            place_instance('VENT', f'VENT_{k:02d}', COLL['80_DETAILS'], (x, y, z), az)
            STATS['instances'] += 1


def build_main_towers():
    """Custom detail for TWR-01..04 on top of their silhouette volumes (all sides)."""
    for s in [s for s in STACKS if s.kind == 'main']:
        v = s.volumes[0]
        mb = MB()
        out = Vector((math.cos(s.az), math.sin(s.az), 0))
        tang = Z.cross(out)
        rot = v.rot
        if s.id == 'TWR-01':
            # Stepped shaft with three setbacks, exposed side frame, cyan vertical display
            tiers = [(Z_MIN, -40, 1.0), (-40, 30, 0.86), (30, 80, 0.7), (80, v.z1, 0.52)]
            for z0, z1, k in tiers:
                mb.prism(rect(v.cx, v.cy, v.w * k, v.d * k, rot), z0, z1, 'M_Facade_Office', cap='M_DarkMetal')
                mb.prism(rect(v.cx, v.cy, v.w * k + 1.4, v.d * k + 1.4, rot), z1 - 0.8, z1 + 0.4, 'M_DarkMetal')
            p = v.surface_toward((v.cx + tang.x * 50, v.cy + tang.y * 50))
            for z in np.arange(Z_MIN, 80, 6.0):
                mb.obox(p + tang * 1.5 + out * 4, p + tang * 1.5 - out * 4, 0.6, 0.6, 'M_WornSteel')
            for o in (-4, 4):
                q = p + tang * 1.5 + out * o
                mb.obox((q.x, q.y, Z_MIN), (q.x, q.y, 80), 0.9, 0.9, 'M_WornSteel')
            inward = -out
            q = v.surface_toward((0, 0)) + inward * 0.3
            mb.face([(q - tang * 3).to_tuple(), (q + tang * 3).to_tuple(), (q + tang * 3 + Z * 0).to_tuple(), (q - tang * 3).to_tuple()], 'M_CyanEmission')
            # Two tall tategaki signs from the original presentation: QA platform and signal trunk
            z = -24
            for text in ('品質保証基盤', '信号幹線'):
                r_ = atlas_rect('signs_v', text)
                hgt = 6.4 / r_['aspect']
                panel(mb, q, inward, 6.4, z, z + hgt, 'M_SignAtlas_V', r_['uv'])
                z += hgt + 3
            mb.tube((v.cx, v.cy, v.z1), (v.cx, v.cy, v.z1 + 34), 0.6, 'M_WornSteel')
            mb.prism(ngon(v.cx, v.cy, 1.2, 6), v.z1 + 34, v.z1 + 35, 'M_RedEmission')
        elif s.id == 'TWR-02':
            # Needle: tapered upper 30 %, two service rings, antenna mast
            body = v.z0 + (v.z1 - v.z0) * 0.7
            mb.prism(rect(v.cx, v.cy, v.w, v.d, rot), v.z0, body, 'M_Facade_Glass', cap='M_DarkMetal')
            steps = 6
            for k in range(steps):
                z0 = body + (v.z1 - body) * k / steps
                z1 = body + (v.z1 - body) * (k + 1) / steps
                f = 1 - 0.8 * (k + 1) / steps
                mb.prism(rect(v.cx, v.cy, v.w * f, v.d * f, rot), z0, z1, 'M_DarkMetal')
            for z in (body - 40, body + 6):
                mb.ring(v.w * 0.55, v.w * 0.55 + 3, z, z + 1.2, 'M_WornSteel', n=24, cx=v.cx, cy=v.cy)
                mb.ring(v.w * 0.55 + 2.8, v.w * 0.55 + 3, z + 1.2, z + 1.6, 'M_CyanEmission', n=24, cx=v.cx, cy=v.cy)
            mb.tube((v.cx, v.cy, v.z1), (v.cx, v.cy, v.z1 + 30), 0.4, 'M_WornSteel')
            mb.prism(ngon(v.cx, v.cy, 0.9, 6), v.z1 + 30, v.z1 + 31, 'M_RedEmission')
        elif s.id == 'TWR-03':
            # Stepped slab: offset blocks, cantilevered decks, side truss, billboard bay
            z = v.z0
            for k, (dx, h) in enumerate(((0, 60), (3, 50), (-4, 44), (2, v.z1 - v.z0 - 154))):
                c = Vector((v.cx, v.cy, 0)) + tang * dx
                mb.prism(rect(c.x, c.y, v.w * (1 - 0.08 * k), v.d, rot), z, z + h, 'M_Facade_Resid', cap='M_DarkMetal')
                deck = c + out * (v.d / 2 + 3)
                mb.prism(rect(deck.x, deck.y, v.w * 0.7, 6, rot), z + h - 1.2, z + h, 'M_AsphaltWet')
                z += h
            p = v.surface_toward((v.cx + tang.x * 50, v.cy + tang.y * 50))
            for zz in np.arange(v.z0, v.z1 - 10, 8.0):
                mb.obox(p + tang * 1.2 + Z * zz, p + tang * 1.2 + Z * (zz + 8) + out * 5, 0.5, 0.5, 'M_WornSteel')
            q = v.surface_toward((0, 0)) - out * 0.4
            a, b = q - tang * 9, q + tang * 9
            r_ = atlas_rect('ads', '決済通知')
            panel(mb, q, -out, 18, 10, 10 + 18 / r_['aspect'], 'M_Ads', r_['uv'])
            mb.obox((a.x, a.y, 9.5), (b.x, b.y, 9.5), 0.8, 0.8, 'M_MagentaEmission')
        else:
            # TWR-04: cylindrical core with two exterior ring platforms and ladders
            mb.prism(ngon(v.cx, v.cy, v.w / 2, 16), v.z0, v.z1, 'M_Facade_Glass', cap='M_DarkMetal')
            for z in (v.z0 + 120, v.z1 - 6):
                mb.ring(v.w / 2, v.w / 2 + 5, z, z + 1.0, 'M_DarkMetal', n=32, cx=v.cx, cy=v.cy)
                mb.ring(v.w / 2 + 4.6, v.w / 2 + 5, z + 1.0, z + 2.2, 'M_WornSteel', n=32, cx=v.cx, cy=v.cy)
                mb.ring(v.w / 2 + 4.7, v.w / 2 + 4.9, z + 2.2, z + 2.4, 'M_CyanEmission', n=32, cx=v.cx, cy=v.cy)
            for a in (0.3, 2.4, 4.5):
                x, y = polar(v.w / 2 + 0.5, a)
                mb.obox((v.cx + x, v.cy + y, v.z0), (v.cx + x, v.cy + y, v.z1), 0.4, 0.8, 'M_WornSteel')
        ob = mb.to_object(f'{s.id}_detail', COLL['10_MAIN_TOWERS'])
        ob['spec_id'] = s.id
    # The silhouette volumes of the main towers are replaced by the detailed shafts above
    for s in [s for s in STACKS if s.kind == 'main']:
        s.custom = True


def build_spire():
    """TWR-00: only the anchors. The column itself is the signal trunk of the main presentation
    (tower/column.js, built in three.js: shaft, flanges, conduits, truss, distribution modules,
    monitors, satellite dishes, signs and the emitter under the logo). R3 modelled a lattice spire
    here; it did not match the original and is gone, with its mounts and shaft bridges.
    """
    for i in range(MOUNTS['count']):
        z = MOUNTS['top_z_m'] - i * MOUNTS['spacing_z_m']
        a = blender_az(i * MOUNTS['turn_rad_per_slide'])
        normal = Vector((math.cos(a), math.sin(a), 0))
        e = bpy.data.objects.new(f'MOUNT-{i + 1:02d}', None)
        e.empty_display_type = 'SINGLE_ARROW'
        e.location = normal * MOUNTS['radius_m'] + Z * z
        e.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
        e['slide_index'] = i
        e['angle_rad'] = i * MOUNTS['turn_rad_per_slide']
        COLL['99_EXPORT'].objects.link(e)
    logo = bpy.data.objects.new('LOGO-ANCHOR', None)
    logo.location = (0, 0, MOUNTS['logo_anchor_z_m'])
    COLL['99_EXPORT'].objects.link(logo)


def build_foundation():
    """FND-01: the base the city stands on (R05B, R06 cutaway): deck slab, two service levels with
    girders, columns and a lit infrastructure ring, overhanging service platform, pipes and cables,
    downlights under the slab, eight braced support legs into the haze, lower floors at the stacks.
    """
    mb, lit = MB(), MB()
    z0, R = Z_MIN, R_MAX + 8
    mb.ring(0.01, R, z0 - 3.0, z0, 'M_Concrete', n=64)
    mb.ring(R - 1.2, R, z0 - 6, z0 + 1.2, 'M_DarkMetal', n=96)
    lit.ring(R, R + 0.1, z0 - 2.2, z0 - 1.7, 'M_AmberEmission', n=96)
    # Level B1: radial girders and ring beams under the deck, columns on rings
    for k in range(32):
        a = 2 * math.pi * k / 32
        mb.obox(polar_z(8, a, z0 - 4.1), polar_z(R - 1, a, z0 - 4.1), 1.0, 2.2, 'M_WornSteel')
    for rr in (24, 48, 72, 96, 116):
        mb.ring(rr - 0.5, rr + 0.5, z0 - 5.2, z0 - 3.0, 'M_WornSteel', n=64)
        cols = int(2 * math.pi * rr / 14)
        for k in range(cols):
            a = 2 * math.pi * k / cols + rr
            x, y = polar(rr, a)
            mb.prism(rect(x, y, 1.6, 1.6, a), z0 - 19, z0 - 3, 'M_Concrete', top=False, bottom=False)
            if rr == 116 and k % 2 == 0:
                b = 2 * math.pi * (k + 1) / cols + rr
                cable(mb, polar_z(rr, a, z0 - 6), polar_z(rr, b, z0 - 6), 1.4, r=0.06)
    # Infrastructure floors on the rim: a lit industrial facade between the decks
    mb.ring(R - 9, R - 8, z0 - 19, z0 - 3, 'M_Facade_Indus', n=96)
    # Level B2 slab, overhanging service platform with railing and lamps
    mb.ring(0.01, R - 8, z0 - 22, z0 - 19, 'M_Concrete', n=64)
    mb.ring(R - 8, R + 6, z0 - 20, z0 - 19, 'M_AsphaltWet', n=96)
    rail_ring(mb, R + 5.8, z0 - 19, n=120)
    for k in range(48):
        a = 2 * math.pi * k / 48
        x, y = polar(R + 4.8, a)
        mb.obox((x, y, z0 - 19), (x, y, z0 - 16.6), 0.1, 0.1, 'M_WornSteel')
        lit.prism(ngon(x, y, 0.22, 6), z0 - 16.6, z0 - 16.3, 'M_AmberEmission')
    # Pipes along the rim of B1
    for off, zz in ((0.0, z0 - 8), (1.0, z0 - 8), (2.0, z0 - 9.2)):
        pts = [polar(R - 13 + off, 2 * math.pi * k / 64) for k in range(65)]
        for a, b in zip(pts, pts[1:]):
            mb.tube((*a, zz), (*b, zz), 0.4, 'M_WornSteel', n=6)
    # Downlights under the slab: the base reads as a volume from below
    for rr in range(16, int(R - 10), 14):
        n = int(2 * math.pi * rr / 11)
        for k in range(n):
            x, y = polar(rr, 2 * math.pi * k / n + rr * 0.1)
            lit.prism(ngon(x, y, 0.35, 6), z0 - 22.25, z0 - 22.0, 'M_AmberEmission' if k % 5 else 'M_CyanEmission')
    # Support legs: eight tapered octagonal legs into the haze, braced and ringed
    legs = []
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        x, y = polar(78, a)
        for j, (za, zb, rad) in enumerate(((z0 - 22, z0 - 60, 7.0), (z0 - 60, z0 - 100, 6.0), (z0 - 100, z0 - 150, 5.0))):
            mb.prism(ngon(x, y, rad, 8, a), zb, za, 'M_Concrete', top=False, bottom=(j == 2))
            mb.ring(rad, rad + 0.6, zb - 0.5, zb + 0.8, 'M_DarkMetal', n=8, cx=x, cy=y)
            lit.ring(rad + 0.6, rad + 0.7, zb + 0.1, zb + 0.4, 'M_RedEmission', n=8, cx=x, cy=y)
        legs.append((x, y))
    for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
        mb.obox((ax, ay, z0 - 24), (bx, by, z0 - 58), 0.9, 0.9, 'M_WornSteel')
        mb.obox((bx, by, z0 - 24), (ax, ay, z0 - 58), 0.9, 0.9, 'M_WornSteel')
        mb.obox((ax, ay, z0 - 60), (bx, by, z0 - 60), 1.6, 1.6, 'M_WornSteel')
    # Core under the shaft
    mb.prism(ngon(0, 0, 9, 12), z0 - 120, z0 - 22, 'M_DarkMetal', top=False)
    for k in range(4):
        x, y = polar(9.05, k * math.pi / 2)
        lit.obox((x, y, z0 - 118), (x, y, z0 - 24), 0.2, 0.2, 'M_CyanEmission')
    # Shaft floor: base plinth of TWR-00 and light rings set into the plaza
    mb.prism(ngon(0, 0, 6, 8, math.pi / 8), z0, z0 + 2.5, 'M_Concrete', bottom=False)
    for rr in (12, 24, 36):
        lit.ring(rr, rr + 0.25, z0 + 0.02, z0 + 0.08, 'M_CyanEmission', n=64)
    # Lower floors at the stacks: podiums with a lit cornice — the transition from base to city
    for st in STACKS:
        if not st.volumes or st.volumes[0].z0 > Z_MIN + 1 or getattr(st, 'custom', False):
            continue
        v = st.volumes[0]
        foot = ngon(v.cx, v.cy, v.w / 2 + 1.5, 12, v.rot) if v.round else rect(v.cx, v.cy, v.w + 3, v.d + 3, v.rot)
        mb.prism(foot, z0, z0 + 4.5, 'M_Concrete', bottom=False)
        band = ngon(v.cx, v.cy, v.w / 2 + 1.55, 12, v.rot) if v.round else rect(v.cx, v.cy, v.w + 3.1, v.d + 3.1, v.rot)
        lit.prism(band, z0 + 3.6, z0 + 3.9, rng.choice(['M_AmberEmission', 'M_AmberEmission', 'M_CyanEmission']), top=False, bottom=False)
    mb.to_object('FND-01_base', COLL['05_FOUNDATION'])
    lit.to_object('FND-01_lights', COLL['05_FOUNDATION'])


def build_far_city():
    """25_FAR_CITY: secondary megatowers beyond the city ring (R01, R05A background), air-route light
    chains and a few large ads — real geometry for the top of the frame; depth comes from fog."""
    mb, lit = MB(), MB()
    for ring_i, (r0, r1, count, hmin, hmax) in enumerate(((165, 235, 54, 150, 290), (255, 340, 60, 180, 360))):
        for k in range(count):
            a = 2 * math.pi * (k + rng.uniform(0.15, 0.85)) / count
            r = rng.uniform(r0, r1)
            x, y = polar(r, a)
            w = rng.uniform(14, 30) * (1 + ring_i * 0.3)
            d = w * rng.uniform(0.7, 1.0)
            w0 = w
            top = rng.uniform(hmin, hmax)
            rot = a + math.pi / 2 + rng.uniform(-0.3, 0.3)
            fac = rng.choice(['M_Facade_Office', 'M_Facade_Glass', 'M_Facade_Resid'])
            z = Z_MIN - 60
            tiers = rng.randint(2, 4)
            for t in range(tiers):
                z1 = top if t == tiers - 1 else z + (top - z) / (tiers - t) * rng.uniform(0.7, 1.0)
                mb.prism(rect(x, y, w, d, rot), z, z1, fac, cap='M_DarkMetal', bottom=False)
                mb.prism(rect(x, y, w + 1.2, d + 1.2, rot), z1 - 0.6, z1 + 0.3, 'M_DarkMetal')
                z = z1
                w *= rng.uniform(0.7, 0.88)
                d *= rng.uniform(0.7, 0.88)
            if rng.random() < 0.6:
                h = rng.uniform(12, 40)
                mb.tube((x, y, top), (x, y, top + h), 0.5, 'M_WornSteel', n=5)
                lit.prism(ngon(x, y, 0.9, 6), top + h, top + h + 1.2, 'M_RedEmission')
            else:
                mb.ring(w * 0.6, w * 0.6 + 3, top - 6, top - 5, 'M_DarkMetal', n=20, cx=x, cy=y)
                lit.ring(w * 0.6 + 2.8, w * 0.6 + 3.1, top - 5, top - 4.6, rng.choice(EMIT_WEIGHTED), n=20, cx=x, cy=y)
            inward = (Vector((0, 0, 0)) - Vector((x, y, 0))).normalized()
            if rng.random() < 0.5:
                corners = rect(x, y, w0 + 0.3, w0 * 0.7 + 0.3, rot)
                mat = rng.choice(EMIT_WEIGHTED)
                for (cx_, cy_) in rng.sample(corners, 2):
                    lit.obox((cx_, cy_, Z_MIN), (cx_, cy_, top * 0.7), 0.7, 0.7, mat)
            if rng.random() < 0.35:
                r_ = rng.choice(ADS)
                hgt = rng.uniform(22, 34)
                wdt = min(hgt * r_['aspect'], w0 * 0.9)
                hgt = wdt / r_['aspect']
                zb = rng.uniform(10, max(12, min(top - hgt - 20, 170)))
                c = Vector((x, y, 0)) + inward * (w0 * 0.36 + 1.5)
                panel(lit, c, inward, wdt, zb, zb + hgt, 'M_Ads', r_['uv'])
    # Air routes: chains of marker lights along three arcs above the city
    for rr, zz, mat in ((150, 172, 'M_AmberEmission'), (205, 204, 'M_CyanEmission'), (185, 236, 'M_MagentaEmission')):
        for k in range(110):
            if k % 11 in (0, 1):
                continue
            x, y = polar(rr, 2 * math.pi * k / 110)
            lit.prism(ngon(x, y, 0.6, 4), zz, zz + 0.6, mat)
    mb.to_object('FAR-01_towers', COLL['25_FAR_CITY'])
    lit.to_object('FAR-01_lights', COLL['25_FAR_CITY'])


# ──────────────────────────────────────────────── vehicles and petal (props.glb)
def veh_lights(mb, front, rear, hw, z, accent, x0, x1, span):
    """Twin headlights, a rear light bar, side running strips and an underbody engine glow."""
    for sgn in (-1, 1):
        mb.obox((front - 0.06, sgn * hw * 0.42, z), (front + 0.02, sgn * hw * 0.42, z), 0.16, 0.08, 'M_Headlight')
        mb.obox((x0, sgn * (hw + 0.01), z + 0.06), (x1, sgn * (hw + 0.01), z + 0.06), 0.03, 0.045, accent)
    mb.obox((rear - 0.02, -hw * 0.72, z + 0.1), (rear - 0.02, hw * 0.72, z + 0.1), 0.05, 0.07, 'M_Taillight')
    mb.face([(-span, -hw * 0.6, 0.03), (-span, hw * 0.6, 0.03), (span, hw * 0.6, 0.03), (span, -hw * 0.6, 0.03)], 'M_EngineGlow')


def veh_pod(mb, x0, x1, y, z, r, glow=True):
    """Side thruster nacelle: cylinder with a dark intake ring and a glowing exhaust."""
    mb.tube((x0, y, z), (x1, y, z), r, 'M_DarkMetal', n=8)
    mb.tube((x1 - 0.05, y, z), (x1 + 0.08, y, z), r * 1.12, 'M_WornSteel', n=8)
    if glow:
        mb.obox((x0 - 0.04, y, z), (x0 + 0.02, y, z), r * 1.5, r * 1.5, 'M_EngineGlow')


def build_props():
    """Flying vehicles in the spirit of the original presentation (signal/future.js: dark hull, glass
    cabin, twin headlights, rear red bar, side running strips, engine glow) — four types of different
    size and purpose — and a sakura petal. Laid out 12 m apart under PROPS_ROOT; the browser uses only
    their geometry and materials.
    """
    root = bpy.data.objects.new('PROPS_ROOT', None)
    COLL['PROPS'].objects.link(root)
    out = []
    # VEH-01 courier, 3.6 m: compact, two side nacelles
    mb = MB()
    mb.loft_x([(-1.8, .42, .18, .62, .14), (-1.45, .62, .06, .72, .18), (0.3, .66, .04, .70, .2), (1.25, .52, .1, .52, .14), (1.8, .26, .2, .38, .08)], 'M_VehPaint_Teal')
    mb.loft_x([(-0.75, .40, .66, .70, .06), (-0.35, .48, .66, 1.08, .14), (0.45, .46, .64, 1.02, .14), (0.95, .30, .6, .66, .08)], 'M_VehGlass')
    for sgn in (-1, 1):
        veh_pod(mb, -1.35, 0.45, sgn * 0.86, 0.34, 0.19)
        mb.obox((-0.5, sgn * 0.6, 0.42), (-0.5, sgn * 0.8, 0.36), 0.35, 0.1, 'M_DarkMetal')
    veh_lights(mb, 1.8, -1.8, 0.62, 0.34, 'M_AmberEmission', -1.2, 1.0, 0.9)
    out.append(('VEH-01', mb))
    # VEH-02 sedan, 4.8 m: low wedge, twin rear fins
    mb = MB()
    mb.loft_x([(-2.4, .55, .2, .66, .16), (-2.0, .8, .08, .74, .22), (0.6, .84, .05, .66, .22), (1.7, .66, .12, .46, .16), (2.4, .3, .22, .34, .08)], 'M_VehPaint_Crimson')
    mb.loft_x([(-1.2, .5, .70, .74, .08), (-0.8, .6, .70, 1.12, .16), (0.3, .58, .66, 1.06, .16), (1.0, .4, .6, .66, .08)], 'M_VehGlass')
    for sgn in (-1, 1):
        mb.obox((-2.25, sgn * 0.62, 0.7), (-1.7, sgn * 0.7, 1.12), 0.08, 0.45, 'M_VehPaint_Graphite')
        mb.obox((-2.43, sgn * 0.35, 0.36), (-2.39, sgn * 0.35, 0.36), 0.36, 0.22, 'M_EngineGlow')
    veh_lights(mb, 2.4, -2.4, 0.84, 0.3, 'M_CyanEmission', -1.8, 1.5, 1.4)
    out.append(('VEH-02', mb))
    # VEH-03 cargo hauler, 6.6 m: cab, ribbed container, four nacelles, amber corner markers
    mb = MB()
    mb.loft_x([(1.9, .9, .15, 1.6, .2), (2.9, .85, .2, 1.4, .25), (3.3, .6, .35, 1.0, .15)], 'M_VehPaint_Graphite')
    mb.loft_x([(2.55, .82, 1.0, 1.42, .1), (3.02, .66, .82, 1.2, .1)], 'M_VehGlass', caps=False)
    mb.loft_x([(-3.3, 1.0, .3, 1.9, .15), (1.9, 1.0, .3, 1.9, .15)], 'M_VehPaint_Ivory')
    for x in np.arange(-2.8, 1.8, 0.9):
        for sgn in (-1, 1):
            mb.obox((x, sgn * 1.03, 0.32), (x, sgn * 1.03, 1.88), 0.12, 0.06, 'M_DarkMetal')
    for xs in (-2.4, 1.2):
        for sgn in (-1, 1):
            veh_pod(mb, xs - 0.7, xs + 0.7, sgn * 1.35, 0.45, 0.3)
            mb.obox((xs, sgn * 1.0, 0.6), (xs, sgn * 1.2, 0.5), 0.4, 0.15, 'M_DarkMetal')
    for x in (-3.28, 1.88):
        for sgn in (-1, 1):
            mb.obox((x, sgn * 0.98, 1.86), (x + 0.1, sgn * 0.98, 1.86), 0.12, 0.1, 'M_AmberEmission')
    for sgn in (-1, 1):
        mb.obox((-3.34, sgn * 0.85, 0.5), (-3.34, sgn * 0.85, 1.6), 0.05, 0.12, 'M_Taillight')
    veh_lights(mb, 3.3, -3.32, 0.9, 0.55, 'M_AmberEmission', 2.0, 3.0, 2.6)
    out.append(('VEH-03', mb))
    # VEH-04 patrol, 5.0 m: sedan hull, roof light bar (red / cyan), front blade
    mb = MB()
    mb.loft_x([(-2.5, .55, .2, .7, .16), (-2.1, .82, .08, .78, .22), (0.7, .86, .05, .7, .22), (1.8, .68, .12, .5, .16), (2.5, .32, .22, .36, .08)], 'M_VehPaint_Graphite')
    mb.loft_x([(-1.25, .52, .74, .78, .08), (-0.85, .62, .74, 1.14, .16), (0.35, .6, .7, 1.08, .16), (1.05, .42, .64, .7, .08)], 'M_VehGlass')
    mb.obox((-0.55, -0.45, 1.2), (-0.55, 0, 1.2), 0.3, 0.1, 'M_RedEmission')
    mb.obox((-0.55, 0, 1.2), (-0.55, 0.45, 1.2), 0.3, 0.1, 'M_CyanEmission')
    mb.obox((2.3, -0.8, 0.12), (2.3, 0.8, 0.12), 0.5, 0.06, 'M_DarkMetal')
    for sgn in (-1, 1):
        veh_pod(mb, -2.2, -0.6, sgn * 1.0, 0.36, 0.2)
    veh_lights(mb, 2.5, -2.5, 0.86, 0.32, 'M_CyanEmission', -1.9, 1.6, 1.4)
    out.append(('VEH-04', mb))
    # Sakura petal, 1 m long here (scaled to a few cm in the browser): cupped blade, notch at the tip,
    # real thickness — two surfaces stitched along the edge
    mb = MB()
    nt_, nu_ = 9, 5
    thick = 0.014

    def pt(i, j, side):
        t, u = i / nt_, -1 + 2 * j / nu_
        w = 0.03 + 0.42 * math.sqrt(t) * (1 - 0.35 * t ** 3)
        x = t * (1 - 0.14 * (1 - abs(u)) * t ** 10)
        z = 0.16 * u * u * w / 0.45 + 0.07 * t * t + side * thick / 2
        return (x - 0.5, u * w, z)
    for i in range(nt_):
        for j in range(nu_):
            mb.face([pt(i, j, 1), pt(i + 1, j, 1), pt(i + 1, j + 1, 1), pt(i, j + 1, 1)], 'M_Petal')
            mb.face([pt(i, j, -1), pt(i, j + 1, -1), pt(i + 1, j + 1, -1), pt(i + 1, j, -1)], 'M_Petal')
    edge = [(i, 0) for i in range(nt_ + 1)] + [(nt_, j) for j in range(1, nu_ + 1)] + \
           [(i, nu_) for i in range(nt_ - 1, -1, -1)] + [(0, j) for j in range(nu_ - 1, 0, -1)]
    for (i, j), (k, l) in zip(edge, edge[1:] + edge[:1]):
        mb.face([pt(i, j, -1), pt(k, l, -1), pt(k, l, 1), pt(i, j, 1)], 'M_Petal')
    out.append(('PETAL', mb))
    for k, (name, m) in enumerate(out):
        ob = m.to_object(name, COLL['PROPS'], location=(k * 12.0, 0, 0))
        ob.parent = root
        ob['tris'] = sum(len(f) - 2 for f in m.F)
    return root


def free_lanes(bvh, clear):
    """Circular air lanes (radius, height in m) that keep `clear` m from every exported surface.

    Candidates: rings through the city every 6 m of radius from 50 m (the browser camera stays
    within 41 m, so traffic is seen from the slides), the band between the city edge and the far
    skyline, and routes above the roofs. Samples sit at the body centre, 1 m above the car origin,
    every <= 1.4 m of arc: between two samples the clearance drops by at most 0.7 m, leaving
    >= 2.3 m against the 2.1 m half-diagonal of the cargo hauler (with bob).
    """
    cands = [(r, z) for r in range(50, 124, 6) for z in range(-128, 140, 4)]
    cands += [(r, z) for r in (136.0, 146.0, 156.0) for z in range(-120, 200, 6)]
    cands += [(r, z) for r in (70.0, 100.0, 125.0) for z in (160, 168, 178, 190)]
    ok = []
    for r, z in cands:
        good = True
        for k in range(720):
            hit = bvh.find_nearest(Vector((*polar(r, 2 * math.pi * k / 720), z + 1.0)))
            if hit[0] is not None and hit[3] < clear:
                good = False
                break
        if good:
            ok.append((r, float(z)))
    # Spread them: at one radius, lanes at least 10 m apart in height
    lanes = []
    for r, z in ok:
        if all(r != r2 or abs(z - z2) >= 10 for r2, z2 in lanes):
            lanes.append((float(r), z))
    return lanes


def polar_z(r, a, z):
    return (r * math.cos(a), r * math.sin(a), z)


def build_hero_deck():
    """Foreground wet platform with railing in front of the hero camera (scale reference)."""
    cam = Vector(SPEC['cameras']['hero']['location'])
    mb = MB()
    y0 = cam.y + 2
    mb.prism(rect(0, y0 + 9, 22, 18, 0), cam.z - 7.5, cam.z - 6.6, 'M_AsphaltWet')
    for x in (-11, 11):
        mb.obox((x, y0, cam.z - 6.6 + 1.1), (x, y0 + 18, cam.z - 6.6 + 1.1), 0.12, 0.12, 'M_WornSteel')
        for t in range(0, 19, 2):
            mb.obox((x, y0 + t, cam.z - 6.6), (x, y0 + t, cam.z - 5.5), 0.1, 0.1, 'M_WornSteel')
        mb.obox((x, y0, cam.z - 6.4), (x, y0 + 18, cam.z - 6.4), 0.1, 0.1, 'M_RedEmission')
    for x in (-8, 8):
        mb.prism(rect(x, y0 + 17, 1.2, 1.2, 0), Z_MIN, cam.z - 7.5, 'M_Concrete', bottom=False)
        mb.tube((x, y0 + 4, cam.z - 6.6), (x, y0 + 4, cam.z - 1), 0.1, 'M_WornSteel')
        mb.prism(rect(x, y0 + 4, 0.5, 0.5, 0), cam.z - 1, cam.z - 0.7, 'M_AmberEmission')
    mb.to_object('HERO-DECK', COLL['40_BRIDGES_PLATFORMS'])


def build_blockout():
    """01_BLOCKOUT: seam rings at module boundaries and sector rays. Never exported."""
    for z in SEAMS:
        mb = MB()
        mb.ring(SHAFT, R_MAX, z - 0.15, z + 0.15, 'M_RedEmission', n=96)
        mb.to_object(f'SEAM_{z:+d}', COLL['01_BLOCKOUT'])
    mb = MB()
    for k in range(SECTORS):
        a = 2 * math.pi * k / SECTORS
        mb.obox((*polar(SHAFT, a), Z_MAX), (*polar(R_MAX, a), Z_MAX), 0.6, 0.3, 'M_AmberEmission')
    mb.to_object('SECTOR_RAYS', COLL['01_BLOCKOUT'])
    COLL['01_BLOCKOUT'].hide_render = True


def build_reference():
    for f in sorted(os.listdir(os.path.join(HERE, 'renders'))) + sorted(os.listdir(os.path.join(HERE, 'source_references'))):
        path = os.path.join(HERE, 'renders', f) if f.startswith('R') else os.path.join(HERE, 'source_references', f)
        try:
            img = bpy.data.images.load(path, check_existing=True)
        except RuntimeError:
            continue
        e = bpy.data.objects.new(f'REF_{os.path.splitext(f)[0]}', None)
        e.empty_display_type = 'IMAGE'
        e.data = img
        e.empty_display_size = 60
        e.location = (R_MAX + 60, -len(COLL['00_REFERENCE'].objects) * 70, 0)
        e.rotation_euler = (math.pi / 2, 0, math.pi / 2)
        COLL['00_REFERENCE'].objects.link(e)
    COLL['00_REFERENCE'].hide_render = True


# ─────────────────────────────────────────────────────── cameras and light
def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def add_camera(name, loc, target, lens=35, ortho=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start, cd.clip_end = 0.5, 2000
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    ob = bpy.data.objects.new(name, cd)
    ob.location = loc
    look_at(ob, target)
    COLL['90_CAMERAS_LIGHTING'].objects.link(ob)
    return ob


def setup_world_and_lights(sc):
    lt = SPEC['lighting']
    w = bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*srgb_to_linear(hexrgb('#141b2c')), 1)
    bg.inputs['Strength'].default_value = 1.8
    # Broad key and fill (revision R1: sun lights instead of 600/180 W area lights)
    for name, color, strength, rot in (('KEY', '#a9b8d6', 2.1, (0.75, 0.2, 0.6)), ('FILL', '#6ac8ff', 0.7, (2.2, -0.4, 2.8))):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.color = srgb_to_linear(hexrgb(color))
        ld.energy = strength
        ld.angle = 0.2
        ob = bpy.data.objects.new(name, ld)
        ob.rotation_euler = rot
        COLL['90_CAMERAS_LIGHTING'].objects.link(ob)
    # Local warm lights only near a few hero signs (30-120 W)
    for k, s in enumerate([s for s in STACKS if s.band == 'inner'][:6]):
        ld = bpy.data.lights.new(f'SIGN_LIGHT_{k}', 'AREA')
        ld.energy = rng.uniform(*lt['local_sign_lights']['power_w_range'])
        ld.size = 6
        ld.color = srgb_to_linear(hexrgb('#ff9b3d'))
        ob = bpy.data.objects.new(f'SIGN_LIGHT_{k}', ld)
        p = Vector((s.x, s.y, 0)) * 0.85
        ob.location = (p.x, p.y, 10)
        look_at(ob, (s.x, s.y, 10))
        COLL['90_CAMERAS_LIGHTING'].objects.link(ob)


def setup_cameras():
    c = SPEC['cameras']
    hero = add_camera('CAM_HERO', c['hero']['location'], c['hero']['target'], c['hero']['lens_mm'])
    d = c['descent']
    desc = add_camera('CAM_DESCENT', d['location_start'], Vector(d['location_start']) + Vector(d['target_offset']) - Vector((0, d['location_start'][1], 0)))
    look_at(desc, (0, 0, d['location_start'][2] + d['target_offset'][2]))
    span = 2 * R_MAX + 20
    add_camera('CAM_TOP', (0, 0, Z_MAX + 200), (0, 0, 0), ortho=span)
    add_camera('CAM_BOTTOM', (0, 0, Z_MIN - 200), (0, 0, 0), ortho=span)
    for name, loc in (('CAM_FRONT', (0, -400, 0)), ('CAM_BACK', (0, 400, 0)), ('CAM_LEFT', (-400, 0, 0)), ('CAM_RIGHT', (400, 0, 0))):
        add_camera(name, loc, (0, 0, 0), ortho=Z_MAX - Z_MIN + 20)
    bot = bpy.data.objects['CAM_BOTTOM']
    look_at(bot, (0, 0, 0))
    return hero, desc


# ───────────────────────────────────────────────────────────── root & build
def parent_to_root():
    root = bpy.data.objects.new('CITY_ROOT', None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 20
    COLL['99_EXPORT'].objects.link(root)
    # Mount and logo points also as extras on the root, in glTF Y-up meters: the GLB optimizer
    # prunes empty leaf nodes, the root's extras survive it (tower/citymodel.js reads them)
    mounts = sorted((o for o in COLL['99_EXPORT'].objects if o.name.startswith('MOUNT-')), key=lambda o: o.name)
    root['slide_mounts_yup'] = [c for o in mounts for c in (o.location.x, o.location.z, -o.location.y)]
    logo = bpy.data.objects['LOGO-ANCHOR'].location
    root['logo_anchor_yup'] = [logo.x, logo.z, -logo.y]
    for name in COLL_NAMES:
        if name in ('00_REFERENCE', '90_CAMERAS_LIGHTING', 'ASSETS', 'PROPS'):
            continue
        for ob in COLL[name].objects:
            if ob is not root and ob.parent is None:
                ob.parent = root
    return root


def build():
    sc = reset()
    make_collections(sc)
    make_materials()
    build_assets()
    mains = layout()
    log('stacks', len(STACKS))
    for s in STACKS:
        if s.kind == 'spire':
            build_spire_tower(s)
            build_screens(s)
        elif s.kind != 'main':
            build_stack(s)
            build_pipes(s)
            build_signs(s)
            build_screens(s)
    build_main_towers()
    build_spire()
    build_bridges()
    build_transit()
    build_trains()
    build_lower_zone()
    build_foundation()
    build_far_city()
    build_props()
    build_hero_deck()
    build_blockout()
    build_reference()
    setup_world_and_lights(sc)
    setup_cameras()
    parent_to_root()
    return sc


# ─────────────────────────────────────────────────────────────── checks
def tri_count(ob):
    if ob.type != 'MESH':
        return 0
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export_objects(lite=False):
    skip = {'00_REFERENCE', '01_BLOCKOUT', '90_CAMERAS_LIGHTING', '99_EXPORT', 'ASSETS', 'PROPS'}
    if lite:
        skip |= {'80_DETAILS'}
    out = []
    for name in COLL_NAMES:
        if name in skip:
            continue
        out.extend(o for o in COLL[name].objects if o.type == 'MESH')
    return out


def world_bvh(objs):
    verts, polys = [], []
    for ob in objs:
        mw = ob.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in ob.data.vertices)
        polys.extend([base + i for i in p.vertices] for p in ob.data.polygons)
    return BVHTree.FromPolygons(verts, polys)


def presentation_poses():
    """Camera poses of the browser (tower/main.js) at every slide, desktop and phone.

    Distances are the largest the browser uses: focus distance x max fit x mid-flight pull.
    Units are converted from presentation units (meters x 0.5) back to meters.
    """
    poses = []
    for i in range(MOUNTS['count']):
        a = blender_az(i * MOUNTS['turn_rad_per_slide'])
        normal = Vector((math.cos(a), math.sin(a), 0))
        z = MOUNTS['top_z_m'] - i * MOUNTS['spacing_z_m']
        card = normal * MOUNTS['radius_m'] + Z * z
        for label, dist_su in (('desktop', 6.6 * 1.25), ('phone', 8.8 * 1.12)):
            poses.append((i, label, card + normal * dist_su * 2.0, card))
        # Mid-flight between i and i+1: pulled back by 0.45, raised by 1.2 su
        if i + 1 < MOUNTS['count']:
            am = blender_az((i + 0.5) * MOUNTS['turn_rad_per_slide'])
            nm = Vector((math.cos(am), math.sin(am), 0))
            zm = z - MOUNTS['spacing_z_m'] / 2
            cm = nm * MOUNTS['radius_m'] + Z * zm
            poses.append((i + 0.5, 'flight', cm + nm * 8.8 * 1.12 * 1.45 * 2.0 + Z * 2.4, cm))
    return poses


def checks():
    rep = {}
    objs = export_objects()
    tris = {}
    for ob in objs:
        coll = ob.users_collection[0].name
        tris[coll] = tris.get(coll, 0) + tri_count(ob)
    rep['triangles_by_collection'] = tris
    rep['triangles_total'] = sum(tris.values())
    rep['triangles_lite'] = sum(tri_count(o) for o in export_objects(lite=True))
    mats = set()
    for ob in objs:
        mats.update(m.name for m in ob.data.materials if m)
    rep['materials_used'] = sorted(mats)
    rep['stacks'] = len(STACKS)
    rep['signs'] = STATS['signs']
    rep['instances'] = STATS['instances']
    rep['bridges'] = len(STATS['bridges'])
    # Bridge endpoints: inside or on the surface of a support at the bridge height
    bad = []
    for b in STATS['bridges']:
        if b['span_m'] < 6 or b['span_m'] > 46:
            bad.append(b['id'])
    rep['bridge_span_violations'] = bad
    # Shaft clearance: no export vertex in the shaft — the column and the slides live there
    # (tower/column.js); the shaft floor (plaza, foundation) is allowed below the camera
    intrusions = []
    for ob in objs:
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            if 6.5 < math.hypot(p.x, p.y) < SHAFT - 0.5 and p.z > Z_MIN + 3:
                intrusions.append(ob.name)
                break
    rep['shaft_intrusions'] = intrusions
    # Radial coverage: stacks per sector
    per = [0] * SECTORS
    for s in STACKS:
        per[int((math.degrees(s.az) % 360) // (360 / SECTORS))] += 1
    rep['stacks_per_sector'] = per
    # Presentation camera: no geometry between the camera and its slide card
    bvh = world_bvh(objs)
    blocked = []
    for i, label, eye, card in presentation_poses():
        d = card - eye
        hit = bvh.ray_cast(eye, d.normalized(), d.length - 1.0)
        near = bvh.find_nearest(eye)
        if hit[0] is not None or (near[0] is not None and near[3] < 1.5):
            blocked.append({'slide': i, 'pose': label, 'hit': hit[0] is not None, 'nearest_m': round(near[3], 2) if near[0] else None})
    rep['presentation_camera_blocked'] = blocked
    rep['presentation_poses_checked'] = len(presentation_poses())
    # Seam bands: geometry crosses every module boundary (continuity, not caps)
    crossing = {}
    for z in SEAMS:
        crossing[str(z)] = sum(1 for s in STACKS if s.volumes and s.volumes[0].z0 < z - 1 and s.top > z + 1)
    rep['stacks_crossing_each_seam'] = crossing
    lanes = free_lanes(bvh, LANE_CLEAR)
    bpy.data.objects['PROPS_ROOT']['air_lanes_m'] = [c for l in lanes for c in l]
    rep['air_lanes'] = {'count': len(lanes), 'clearance_m': LANE_CLEAR, 'lanes_r_z_m': lanes}
    rep['props_triangles'] = {o.name: o['tris'] for o in COLL['PROPS'].objects if o.type == 'MESH'}
    return rep


# ───────────────────────────────────────────────────────────── rendering
def render_setup(sc, quick):
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 16 if quick else 48
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False


def render(sc, cam, name, res, quick):
    sc.camera = cam
    f = 0.5 if quick else 1.0
    sc.render.resolution_x, sc.render.resolution_y = int(res[0] * f), int(res[1] * f)
    sc.render.filepath = os.path.join(RENDER_DIR, name + '.jpg')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f'render {name} {sc.render.resolution_x}x{sc.render.resolution_y} {time.time() - t:.1f}s')


def stage_render(quick):
    sc = bpy.context.scene
    render_setup(sc, quick)
    os.makedirs(RENDER_DIR, exist_ok=True)
    root = bpy.data.objects['CITY_ROOT']
    cams = {o.name: o for o in COLL['90_CAMERAS_LIGHTING'].objects if o.type == 'CAMERA'}
    render(sc, cams['CAM_HERO'], 'B01_hero', (1536, 2304), quick)
    # 360 coverage: same camera, lens and bounds; only CITY_ROOT rotates
    az_cam = add_camera('CAM_AZIMUTH', (0, -420, 30), (0, 0, 0), lens=35)
    az_cam.data.sensor_fit = 'VERTICAL'
    for deg in range(0, 360, 45):
        root.rotation_euler.z = math.radians(deg)
        render(sc, az_cam, f'B02_azimuth_{deg:03d}', (768, 1152), quick)
    root.rotation_euler.z = 0
    for name in ('CAM_TOP', 'CAM_FRONT', 'CAM_BACK', 'CAM_LEFT', 'CAM_RIGHT', 'CAM_BOTTOM'):
        res = (1024, 1024) if name in ('CAM_TOP', 'CAM_BOTTOM') else (900, 1080)
        render(sc, cams[name], f'B03_ortho_{name[4:].lower()}', res, quick)
    # Descent: same trajectory, one frame per vertical zone
    d = SPEC['cameras']['descent']
    for label, z in (('upper', 112), ('middle', 0), ('lower', -112)):
        cam = add_camera(f'CAM_DESCENT_{label}', (0, d['location_start'][1], z), (0, 0, z + d['target_offset'][2]), lens=35)
        render(sc, cam, f'B04_descent_{label}', (768, 1152), quick)
    # Seam bands: from inside the shaft towards the city, seam rings visible
    COLL['01_BLOCKOUT'].hide_render = False
    bpy.data.objects['SECTOR_RAYS'].hide_render = True
    for z in SEAMS:
        a = math.radians(40)
        cam = add_camera(f'CAM_SEAM_{z:+d}', (*polar(20, a + math.pi), z + 4), (*polar(90, a), z), lens=24)
        render(sc, cam, f'B05_seam_z{z:+04d}', (1024, 640), quick)
    COLL['01_BLOCKOUT'].hide_render = True
    # Presentation poses: what the browser camera sees behind the slides
    for i in (0, 6, 12):
        a = blender_az(i * MOUNTS['turn_rad_per_slide'])
        normal = Vector((math.cos(a), math.sin(a), 0))
        z = MOUNTS['top_z_m'] - i * MOUNTS['spacing_z_m']
        card = normal * MOUNTS['radius_m'] + Z * z
        cam = add_camera(f'CAM_SLIDE_{i:02d}', card + normal * 16, card - normal * 10, lens=32)
        render(sc, cam, f'B07_slide_pose_{i + 1:02d}', (1280, 720), quick)
    # Props: the four vehicles and the petal alone, lit by the city key (the far skyline behind
    # them read as towers hanging in the void from 900 m out)
    root_p = bpy.data.objects['PROPS_ROOT']
    root_p.location = (0, -900, 0)
    shown = [c for c in COLL.values() if not c.hide_render and c.name != '90_CAMERAS_LIGHTING']
    for c in shown:
        c.hide_render = True
    COLL['PROPS'].hide_render = False
    cam = add_camera('CAM_PROPS', (24, -972, 20), (24, -900, 1.0), lens=40)
    render(sc, cam, 'B08_props', (1600, 700), quick)
    COLL['PROPS'].hide_render = True
    for c in shown:
        c.hide_render = False
    root_p.location = (0, 0, 0)
    # Foundation and far skyline from below the deck edge, looking up past the rim
    cam = add_camera('CAM_FOUNDATION', (20, -150, -200), (0, -40, -150), lens=24)
    render(sc, cam, 'B09_foundation', (1280, 800), quick)
    cam = add_camera('CAM_CROWN', (26, -18, 112), (0, 0, 132), lens=30)
    render(sc, cam, 'B10_crown', (1024, 1280), quick)
    # Clay blockout: material override, fog kept, emission off
    clay = bpy.data.materials.new('CLAY')
    clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.43, 0.45, 1)
    clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.7
    sc.view_layers[0].material_override = clay
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.5
    cam = add_camera('CAM_CLAY', (180, -260, 160), (0, 0, -10), lens=35)
    render(sc, cam, 'B06_clay_blockout', (1152, 1152), quick)
    sc.view_layers[0].material_override = None


# ──────────────────────────────────────────────────────────────── export
def stage_export():
    os.makedirs(ASSET_DIR, exist_ok=True)
    result = {}
    root = bpy.data.objects['CITY_ROOT']
    root.rotation_euler.z = 0
    for lite in (False, True):
        exp = COLL['99_EXPORT']
        # Fresh export copies: realised instances, applied transforms, joined per collection
        for ob in [o for o in exp.objects if o.type == 'MESH']:
            bpy.data.objects.remove(ob, do_unlink=True)
        groups = {}
        for ob in export_objects(lite):
            groups.setdefault(ob.users_collection[0].name, []).append(ob)
        joined = []
        for coll, objs in groups.items():
            if lite and coll == '40_BRIDGES_PLATFORMS':
                objs = [o for o in objs if not o.name.startswith('BRG-02')]
            if not objs:
                continue
            copies = []
            for ob in objs:
                c = ob.copy()
                c.data = ob.data.copy()
                c.parent = None
                c.matrix_world = ob.matrix_world.copy()
                exp.objects.link(c)
                copies.append(c)
            bpy.ops.object.select_all(action='DESELECT')
            for c in copies:
                c.select_set(True)
            bpy.context.view_layer.objects.active = copies[0]
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            bpy.ops.object.join()
            j = bpy.context.view_layer.objects.active
            j.name = 'EXP_' + coll.split('_', 1)[1]
            j.parent = root
            joined.append(j)
        name = 'city_lite.glb' if lite else 'city.glb'
        path = os.path.join(ASSET_DIR, name)
        lc = bpy.context.view_layer.layer_collection.children['99_EXPORT']
        bpy.context.view_layer.active_layer_collection = lc
        COLL['99_EXPORT'].hide_viewport = False
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_active_collection=True,
            use_active_collection_with_nested=True, export_extras=True, export_yup=True,
            export_apply=True, export_lights=False, export_cameras=False,
            export_image_format='WEBP', export_image_quality=82, export_materials='EXPORT')
        optimize_glb(path)
        tris = sum(tri_count(o) for o in joined)
        prims = sum(len(o.data.materials) for o in joined)
        result[name] = {'bytes': os.path.getsize(path), 'triangles': tris, 'primitives': prims,
                        'nodes': [o.name for o in joined]}
        log(name, result[name])
    result['props.glb'] = export_props()
    return result


def export_props():
    """Vehicles and the petal with PROPS_ROOT (its extras carry the free air lanes)."""
    path = os.path.join(ASSET_DIR, 'props.glb')
    lc = bpy.context.view_layer.layer_collection.children['PROPS']
    bpy.context.view_layer.active_layer_collection = lc
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_active_collection=True, export_extras=True, export_yup=True,
        export_apply=True, export_lights=False, export_cameras=False,
        export_image_format='WEBP', export_image_quality=82, export_materials='EXPORT')
    optimize_glb(path)
    return {'bytes': os.path.getsize(path), 'nodes': [o.name for o in COLL['PROPS'].objects]}


def optimize_glb(path):
    """Weld, quantize and meshopt-compress the GLB with gltf-transform (Node).

    Blender writes per-face vertices for flat shading; welding and quantizing cuts the file
    by about 60 %. EXT_meshopt_compression is decoded by tower/vendor/libs/meshopt_decoder.
    Without Node the plain export stays in place and a warning is logged.
    """
    import shutil
    import subprocess
    npx = shutil.which('npx')
    if not npx:
        log('WARNING: npx not found, GLB left uncompressed:', path)
        return
    tmp, tmp2 = path + '.opt.glb', path + '.mo.glb'
    cli = [npx, '-y', '@gltf-transform/cli@4']
    # Meshopt with one quantization grid for the whole scene: materials are shared between meshes
    # with different UV ranges, and per-mesh grids would leave those texcoords as float32
    steps = [
        cli + ['optimize', path, tmp, '--compress', 'false', '--texture-compress', 'webp', '--simplify', 'false',
               '--instance', 'false', '--flatten', 'false', '--join', 'false'],
        cli + ['meshopt', tmp, tmp2, '--quantization-volume', 'scene', '--quantize-texcoord', '16'],
    ]
    for cmd in steps:
        done = subprocess.run(cmd, capture_output=True, text=True)
        if done.returncode != 0:
            log('WARNING: gltf-transform failed, GLB left uncompressed:', done.stderr[-400:])
            return
    os.replace(tmp2, path)
    os.remove(tmp)


def main():
    t0 = time.time()
    blend = os.path.join(HERE, 'city.blend')
    report_path = os.path.join(HERE, 'build_report.json')
    report = json.load(open(report_path)) if os.path.exists(report_path) and STAGE != 'all' and STAGE != 'build' else {}
    if STAGE in ('all', 'build'):
        build()
        report['checks'] = checks()
        log(json.dumps(report['checks'], indent=1)[:3000])
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    else:
        bpy.ops.wm.open_mainfile(filepath=blend)
        for name in COLL_NAMES:
            COLL[name] = bpy.data.collections[name]
    if STAGE in ('all', 'export'):
        report['export'] = stage_export()
    if STAGE in ('all', 'render'):
        stage_render(QUICK)
        report['renders'] = sorted(f for f in os.listdir(RENDER_DIR) if f.endswith('.jpg'))
    report['blender'] = bpy.app.version_string
    report['seconds'] = round(time.time() - t0, 1)
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    log('done', report['seconds'], 's')


main()
