# Builds the Soldier (rifleman), Engineer (riveter) and Minigunner (gatling)
# tower models in Blender, then exports them for the game.
#
# Run (no GUI needed):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/build_towers.py
#
# Outputs:
#   src/render/models/towers.gen.js   geometry the game loads (generated, don't edit)
#   tools/blender/towers.blend        the scene, open it in Blender to tweak
#   tools/blender/renders/*.png       quick preview renders
#
# Coordinates: everything below is written in the game's (three.js) space:
# x = right, y = up, z = forward (towards the target), in "character units"
# (a torso is 2x2x1, the rig's hips sit at y = 2). The script converts to
# Blender's Z-up space when it makes objects and back again on export.
import bpy, bmesh, math, os, json, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_JS = os.path.join(ROOT, 'src', 'render', 'models', 'towers.gen.js')
OUT_BLEND = os.path.join(HERE, 'towers.blend')
RENDERS = os.path.join(HERE, 'renders')

# three (x, y, z) -> blender (x, -z, y)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C_INV = C.inverted()
R90 = math.pi / 2

# Where each rig part's pivot sits in body space (matches characters.js newRig).
PIVOTS = {
    'torso': (0, 2, 0), 'head': (0, 4, 0), 'hat': (0, 4, 0),
    'armL': (-1.5, 3.8, 0), 'armR': (1.5, 3.8, 0),
    'legL': (-0.5, 2, 0), 'legR': (0.5, 2, 0),
    'weapon': (0.3, 3.45, 1.6), 'spin': (0.3, 3.45, 1.6),
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


_mats = {}
def material(hex_):
    if hex_ in _mats:
        return _mats[hex_]
    h = hex_.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    m = bpy.data.materials.new(hex_)
    m.diffuse_color = (*lin, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
        bsdf.inputs['Roughness'].default_value = 0.75
    m['hex'] = hex_
    _mats[hex_] = m
    return m


class Model:
    """One character: a collection of objects tagged with the rig part they belong to."""

    def __init__(self, name, offset_x):
        self.name = name
        self.offset = Vector((offset_x, 0, 0))  # three space, just to line models up in the .blend
        self.col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.col)
        self.n = 0
        self.meta = {}

    def _obj(self, part, bm, color, bevel=0.0, seg=1, angle=None):
        self.n += 1
        me = bpy.data.meshes.new(f'{self.name}_{part}_{self.n}')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(me.name, me)
        piv = Vector(PIVOTS[part]) + self.offset
        ob.location = (C @ piv.to_4d()).to_3d()
        ob['part'] = part
        ob['hex'] = color
        me.materials.append(material(color))
        if bevel > 0:
            mod = ob.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = seg
            mod.limit_method = 'ANGLE' if angle else 'NONE'
            if angle:
                mod.angle_limit = angle
        self.col.objects.link(ob)
        return ob

    @staticmethod
    def _xf(bm, x, y, z, rx=0, ry=0, rz=0, sx=1, sy=1, sz=1):
        M = (Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y')
             @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((sx, sy, sz, 1)))
        bmesh.ops.transform(bm, matrix=C @ M, verts=bm.verts)

    def box(self, part, w, h, d, color, x, y, z, r=0.05, rx=0, ry=0, rz=0, seg=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        self._xf(bm, x, y, z, rx, ry, rz, w, h, d)
        r = min(r, w * 0.45, h * 0.45, d * 0.45)
        return self._obj(part, bm, color, r, seg or (3 if r >= 0.15 else 1))

    def cyl(self, part, rt, rb, h, color, x, y, z, rx=0, ry=0, rz=0, seg=12, bevel=0.02):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=rb, radius2=rt, depth=h)
        # Blender cones run along local z; turn them to run along y like three's CylinderGeometry.
        bmesh.ops.transform(bm, matrix=Matrix.Rotation(-R90, 4, 'X'), verts=bm.verts)
        self._xf(bm, x, y, z, rx, ry, rz)
        return self._obj(part, bm, color, bevel, 1, angle=math.radians(50))

    def sphere(self, part, r, color, x, y, z, sx=1, sy=1, sz=1, seg=16):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2 + 1), radius=r)
        self._xf(bm, x, y, z, 0, 0, 0, sx, sy, sz)
        ob = self._obj(part, bm, color)
        ob['smooth'] = 1
        for poly in ob.data.polygons:
            poly.use_smooth = True
        return ob

    # ------------------------------------------------------------------
    def head(self, skin):
        self.box('head', 1.2, 1.2, 1.2, skin, 0, 0.6, 0, r=0.34, seg=4)
        self.cyl('head', 0.36, 0.36, 0.2, skin, 0, -0.02, 0, seg=12, bevel=0)  # neck

    def torso(self, shirt):
        self.box('torso', 2, 2, 1, shirt, 0, 1, 0, r=0.07)

    def arms(self, sleeve, skin, sleeve_len=0.95, bands=None):
        for part in ('armL', 'armR'):
            self.box(part, 1.0, sleeve_len, 1.0, sleeve, 0, 0.2 - sleeve_len / 2, 0, r=0.08)
            fl = 2.0 - sleeve_len
            self.box(part, 0.97, fl, 0.97, skin, 0, -1.8 + fl / 2, 0, r=0.08)
            if bands:
                self.box(part, 1.04, 0.16, 1.04, bands, 0, 0.2 - sleeve_len + 0.08, 0, r=0.03)

    def legs(self, pants, boots, boot_h=0.45):
        for part in ('legL', 'legR'):
            self.box(part, 1.0, 2.0 - boot_h + 0.05, 1.0, pants, 0, -(2.0 - boot_h) / 2, 0, r=0.07)
            self.box(part, 1.04, boot_h, 1.08, boots, 0, -2.0 + boot_h / 2, 0.04, r=0.08)


# =========================================================================
# SOLDIER  (reference 1: olive cap, green shirt + black vest, black pants with
# knee pads, M16)
# =========================================================================
def soldier(m):
    skin, green, cap = '#d6a47e', '#33502d', '#3a4d36'
    black, vest, gray = '#1c1d1f', '#2a2c2e', '#4a4d51'
    m.head(skin)
    # Patrol cap: flat top, stiff band, short brim.
    m.box('hat', 1.34, 0.7, 1.34, cap, 0, 1.24, -0.03, r=0.1, seg=2, rx=-0.08)
    m.box('hat', 1.3, 0.14, 1.3, '#2f4429', 0, 0.95, -0.03, r=0.04)
    m.box('hat', 1.1, 0.09, 0.5, '#2b3f26', 0, 0.9, 0.88, r=0.03, rx=0.15)

    m.torso(green)
    # Plate carrier: dark panel front and back, straps over the green shoulders.
    m.box('torso', 1.9, 1.6, 0.2, vest, 0, 1.05, 0.55, r=0.06)
    m.box('torso', 1.9, 1.6, 0.2, vest, 0, 1.05, -0.55, r=0.06)
    for x in (-0.58, 0.58):
        m.box('torso', 0.36, 0.3, 1.18, vest, x, 1.88, 0, r=0.05)
    for x in (-0.55, 0.0, 0.55):  # magazine pouches
        m.box('torso', 0.44, 0.5, 0.2, '#323538', x, 0.7, 0.7, r=0.06)
        m.box('torso', 0.46, 0.12, 0.22, '#3d4144', x, 0.92, 0.71, r=0.03)
    m.box('torso', 0.5, 0.22, 0.08, '#3a3d40', -0.45, 1.55, 0.67, r=0.02)  # name tape
    # Belt with pouches + canteen
    m.box('torso', 2.08, 0.3, 1.1, '#4a4d50', 0, 0.15, 0, r=0.04)
    m.box('torso', 0.32, 0.24, 0.08, '#8a8d91', 0, 0.15, 0.57, r=0.02)
    m.box('torso', 0.42, 0.42, 0.3, gray, 0.72, 0.05, 0.5, r=0.08)
    m.box('torso', 0.42, 0.42, 0.3, gray, -0.72, 0.05, 0.5, r=0.08)

    m.arms(green, skin, sleeve_len=0.95)
    for part in ('armL', 'armR'):
        m.box(part, 1.03, 0.14, 1.03, '#2e4627', 0, -0.68, 0, r=0.03)  # rolled sleeve cuff

    m.legs(black, '#121214', boot_h=0.5)
    for part, side in (('legL', -1), ('legR', 1)):
        m.box(part, 0.7, 0.55, 0.22, '#3e4246', 0, -1.05, 0.56, r=0.15, seg=2)   # knee pad
        m.box(part, 0.88, 0.12, 0.08, '#2a2c2f', 0, -0.88, 0.62, r=0.02)  # strap
        m.box(part, 0.2, 0.62, 0.62, '#26282b', side * 0.56, -0.45, 0, r=0.05)  # cargo pocket

    # M16 (origin = pistol grip, +z = forward)
    w = 'weapon'
    m.box(w, 0.26, 0.34, 1.25, '#202124', 0, 0.12, 0.3, r=0.04)       # receiver
    m.box(w, 0.2, 0.36, 0.95, '#1a1b1d', 0, 0.02, -0.75, r=0.06)      # stock
    m.box(w, 0.24, 0.5, 0.12, '#161718', 0, -0.02, -1.24, r=0.03)     # butt plate
    m.box(w, 0.07, 0.07, 0.62, '#202124', 0, 0.48, 0.3, r=0.01)       # carry handle
    for z in (0.02, 0.58):
        m.box(w, 0.08, 0.2, 0.08, '#202124', 0, 0.36, z, r=0.01)
    m.box(w, 0.2, 0.5, 0.24, '#1a1b1d', 0, -0.22, -0.02, rx=0.38, r=0.04)  # pistol grip
    m.box(w, 0.2, 0.8, 0.32, '#9a9da2', 0, -0.42, 0.6, rx=-0.22, r=0.03)   # magazine
    m.cyl(w, 0.16, 0.16, 1.25, '#26272a', 0, 0.12, 1.5, rx=R90, seg=10)   # handguard
    for z in (0.95, 2.05):
        m.cyl(w, 0.18, 0.18, 0.06, '#151617', 0, 0.12, z, rx=R90, seg=10, bevel=0)
    m.cyl(w, 0.05, 0.05, 1.25, '#2c2d30', 0, 0.12, 2.5, rx=R90, seg=8)    # barrel
    m.box(w, 0.06, 0.32, 0.08, '#202124', 0, 0.34, 2.05, r=0.01)         # front sight
    m.cyl(w, 0.07, 0.07, 0.18, '#151617', 0, 0.12, 3.1, rx=R90, seg=8)    # flash hider
    m.meta.update(weapon='rifle', hat='cap', muzzle=[0, 0.12, 3.2], face='scowl', skin=skin, weaponScale=1.2)


# =========================================================================
# ENGINEER  (reference 2: purple high ponytail, white shoulders, orange skin,
# maroon top, dusty-red trousers with brown straps + gold buckles, black
# boots, rebar launcher)
# =========================================================================
def engineer(m):
    skin, hair, hair2, hair3 = '#d98a3a', '#8848bf', '#b07ee0', '#6a3a9e'
    top, pants, strap, gold = '#7a2f30', '#9c4a4a', '#5a3a28', '#d8a838'
    m.head(skin)
    # Hair: cap of hair, side locks, back, and a big ponytail sweeping up/back.
    m.box('head', 1.34, 0.6, 1.38, hair, 0, 1.2, -0.05, r=0.22, seg=3)
    m.box('head', 1.5, 1.2, 0.4, hair, 0, 0.75, -0.55, r=0.16, seg=2)
    for s in (-1, 1):
        m.box('head', 0.16, 1.45, 0.4, hair, s * 0.66, 0.35, 0.25, r=0.06)          # long face-framing locks
        m.box('head', 0.55, 0.3, 0.2, hair, s * 0.3, 1.1, 0.6, r=0.08, rz=s * 0.35)  # centre part
    m.box('head', 1.55, 1.5, 0.45, hair, 0, 0.1, -0.5, r=0.18, seg=2)  # back curtain to the shoulders
    for s in (-1, 1):
        m.box('head', 0.3, 1.4, 0.7, hair3, s * 0.75, 0.15, -0.15, r=0.1)
    tail = [(0, 1.45, -0.6, 0.38), (0, 1.85, -0.95, 0.39), (0, 2.0, -1.05, 0.38), (0, 1.9, -1.35, 0.35),
            (0, 1.6, -1.55, 0.32), (0, 1.2, -1.6, 0.29), (0, 0.8, -1.5, 0.25), (0, 0.45, -1.4, 0.21)]
    for i, (x, y, z, r) in enumerate(tail):
        m.sphere('head', r, hair if i % 2 == 0 else hair3, x, y, z, sx=1.3, sy=1.15, sz=1.3)
    for k, (dx, rz) in enumerate(((-0.45, 0.8), (0.45, -0.8), (-0.6, 1.0), (0.6, -1.0), (-0.25, 0.7), (0.25, -0.7))):  # wild strands
        m.box('head', 0.1, 0.8, 0.1, hair2 if k % 2 else hair, dx, 1.75, -0.7 - (k // 2) * 0.15, r=0.03, rz=rz)
    for s in (-1, 1):
        m.sphere('head', 0.2, hair2, s * 0.2, 1.75, -1.4, sx=0.7, sy=1.5, sz=0.8)
    m.box('head', 0.5, 0.2, 0.5, '#3a2a55', 0, 1.36, -0.32, r=0.06)  # hair tie

    m.torso(top)
    m.box('torso', 2.04, 0.75, 1.04, '#6b292a', 0, 1.62, 0, r=0.06)    # darker chest panel
    m.box('torso', 2.08, 0.32, 1.1, strap, 0, 0.17, 0, r=0.04)          # belt
    m.box('torso', 0.4, 0.34, 0.1, gold, 0, 0.17, 0.58, r=0.03)         # buckle
    m.box('torso', 0.22, 0.18, 0.12, '#5a3a28', 0, 0.17, 0.6, r=0.02)
    m.box('torso', 0.55, 0.45, 0.3, '#6a4a30', 0.75, 0.0, 0.42, r=0.07)  # tool pouch

    for part in ('armL', 'armR'):  # puffy white sleeves
        m.box(part, 1.1, 1.0, 1.1, '#e8e8e8', 0, -0.3, 0, r=0.12, seg=2)
    m.arms('#e8e8e8', skin, sleeve_len=1.0)
    for part in ('armL', 'armR'):
        m.box(part, 1.03, 0.12, 1.03, '#d6d6d6', 0, -0.74, 0, r=0.03)

    m.legs(pants, '#1b1b1f', boot_h=0.62)
    for part in ('legL', 'legR'):
        y = -0.55
        m.box(part, 1.05, 0.2, 1.05, strap, 0, y, 0, r=0.03)
        m.box(part, 0.36, 0.32, 0.08, gold, 0.05, y, 0.54, r=0.03)
        m.box(part, 0.2, 0.16, 0.1, pants, 0.05, y, 0.57, r=0.02)

    # Rebar launcher (origin = rear grip, +z = forward)
    w = 'weapon'
    m.cyl(w, 0.25, 0.25, 2.3, '#1d1e21', 0, 0.2, 0.75, rx=R90, seg=14)  # long launcher tube body
    m.box(w, 0.18, 0.12, 2.0, '#2c2e32', 0, 0.48, 0.7, r=0.03)         # top rail
    m.box(w, 0.42, 0.42, 0.6, '#2a2c30', 0, 0.2, -0.1, r=0.06)         # breech block
    m.box(w, 0.22, 0.56, 0.26, '#18191b', 0, -0.2, -0.05, rx=0.3, r=0.04)  # rear grip
    m.box(w, 0.2, 0.5, 0.22, '#18191b', 0, -0.15, 1.0, rx=-0.1, r=0.04)    # fore grip
    m.cyl(w, 0.2, 0.2, 0.5, '#222327', 0, 0.2, 2.1, rx=R90, seg=12)       # muzzle tube
    m.cyl(w, 0.28, 0.28, 0.1, '#111214', 0, 0.2, 2.35, rx=R90, seg=12, bevel=0)
    m.cyl(w, 0.075, 0.075, 1.4, '#a9acb1', 0, 0.2, 2.9, rx=R90, seg=8)   # rebar spike
    for i in range(7):
        m.cyl(w, 0.095, 0.095, 0.05, '#7d8086', 0.03 * (1 if i % 2 else -1), 0.2, 2.4 + i * 0.18, rx=R90, seg=8, bevel=0)
    m.cyl(w, 0.0, 0.075, 0.2, '#a9acb1', 0, 0.2, 3.68, rx=R90, seg=8, bevel=0)  # point
    m.box(w, 0.1, 0.55, 0.3, '#121214', 0.0, -0.3, 1.45, r=0.02, rx=0.15)  # hanging tag/strap
    m.box(w, 0.06, 0.3, 0.06, '#121214', 0.0, -0.05, 1.42, r=0.01)
    m.meta.update(weapon='drill', hat='none', muzzle=[0, 0.2, 3.6], face='confident', skin=skin)


# =========================================================================
# MINIGUNNER  (reference 3: bald, bright yellow skin, red outfit with black
# harness straps, minigun at the hip)
# =========================================================================
def minigunner(m):
    skin, red, red2, black = '#f2b233', '#9a2428', '#701c21', '#19191b'
    m.head(skin)
    m.torso(red)
    for x in (-0.55, 0.55):  # harness
        m.box('torso', 0.3, 2.04, 1.08, black, x, 1.0, 0, r=0.03)
    m.box('torso', 2.06, 0.3, 1.08, black, 0, 1.25, 0, r=0.03)
    m.box('torso', 0.4, 0.4, 0.12, '#2d2d30', 0, 1.25, 0.56, r=0.04)
    m.box('torso', 2.1, 0.38, 1.12, black, 0, 0.18, 0, r=0.04)          # belt
    m.box('torso', 1.5, 1.3, 0.6, '#2a2b2e', 0, 1.1, -0.75, r=0.1)       # ammo pack
    m.box('torso', 1.56, 0.14, 0.66, '#3a3c40', 0, 1.6, -0.75, r=0.03)

    m.arms(red, skin, sleeve_len=0.95)
    for part in ('armL', 'armR'):
        m.box(part, 1.1, 1.0, 1.1, skin, 0, -1.3, 0, r=0.1)  # chunky hand blocks
        m.box(part, 1.04, 0.18, 1.04, '#7a1a1e', 0, -0.62, 0, r=0.03)
        m.box(part, 1.18, 0.75, 1.18, '#c03232', 0, -0.15, 0, r=0.1)  # big shoulder blocks

    m.legs(red2, black, boot_h=0.7)
    for part in ('legL', 'legR'):
        m.box(part, 1.04, 0.18, 1.04, black, 0, -0.35, 0, r=0.03)
        m.box(part, 0.82, 0.56, 0.2, '#26272a', 0, -1.0, 0.55, r=0.08)
        m.box(part, 1.04, 0.14, 1.04, black, 0, -1.0, 0, r=0.03)

    # Minigun (origin = rear grip, +z = forward). Barrels go in 'spin'.
    w = 'weapon'
    m.box(w, 0.75, 0.72, 1.25, '#33373c', 0, 0.12, 0.45, r=0.1)          # housing
    m.cyl(w, 0.38, 0.38, 0.55, '#3a3f45', 0, 0.12, -0.35, rx=R90, seg=14)  # motor
    m.cyl(w, 0.3, 0.3, 0.1, '#141517', 0, 0.12, -0.66, rx=R90, seg=14, bevel=0)
    m.box(w, 0.1, 0.42, 0.1, '#2a2b2e', 0, 0.62, 0.05, r=0.02)           # carry handle
    m.box(w, 0.1, 0.42, 0.1, '#2a2b2e', 0, 0.62, 0.85, r=0.02)
    m.box(w, 0.1, 0.1, 0.92, '#2a2b2e', 0, 0.85, 0.45, r=0.03)
    m.box(w, 0.22, 0.5, 0.25, '#18191b', 0, -0.36, 0.0, rx=0.25, r=0.04)  # trigger grip
    m.box(w, 0.55, 0.6, 0.7, '#2a2c30', -0.62, -0.05, 0.4, r=0.06)        # ammo box
    m.box(w, 0.26, 0.12, 0.5, '#b79a3a', -0.35, 0.18, 0.45, r=0.02)      # belt feed
    m.cyl(w, 0.32, 0.32, 0.16, '#26272b', 0, 0.12, 1.12, rx=R90, seg=14)  # front plate
    s = 'spin'  # rotating barrel cluster, pivot on the barrel axis
    for i in range(6):
        a = i / 6 * math.tau
        m.cyl(s, 0.065, 0.065, 2.9, '#3a3f45', math.cos(a) * 0.19, 0.12 + math.sin(a) * 0.19, 2.55, rx=R90, seg=8)
    for z in (1.5, 2.6, 3.9):
        m.cyl(s, 0.26, 0.26, 0.1 if z != 3.9 else 0.14, '#2a2d31', 0, 0.12, z, rx=R90, seg=14, bevel=0.01)
    m.cyl(s, 0.08, 0.08, 2.9, '#151517', 0, 0.12, 2.55, rx=R90, seg=8)
    m.meta.update(weapon='minigun', hat='none', muzzle=[0, 0.12, 4.0], face='cocky', skin=skin, spinAxis=[0, 0.12])


MODELS = [('soldier', soldier), ('engineer', engineer), ('minigunner', minigunner)]


# ------------------------------------------------------------------ export --
def export_model(m):
    dg = bpy.context.evaluated_depsgraph_get()
    parts = {}
    for ob in m.col.objects:
        part = ob['part']
        piv = Vector(PIVOTS[part]) + m.offset
        if part == 'spin':
            piv = piv + Vector((m.meta['spinAxis'][0], m.meta['spinAxis'][1], 0))
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        groups = parts.setdefault(part, {})
        key = ob['hex'] + ('|s' if ob.get('smooth') else '')
        g = groups.setdefault(key, {'v': [], 'f': []})
        base = len(g['v']) // 3
        for v in me.vertices:
            w = C_INV @ (ob.matrix_world @ v.co).to_4d()
            p = w.to_3d() - piv
            g['v'].extend(int(round(c * 1000)) for c in p)
        for t in me.loop_triangles:
            g['f'].extend(base + i for i in t.vertices)
        ev.to_mesh_clear()
    out = {'parts': {k: [[hx, g['v'], g['f']] for hx, g in v.items()] for k, v in parts.items()}}
    out.update({k: v for k, v in m.meta.items() if k != 'spinAxis'})
    if 'spinAxis' in m.meta:
        out['spinPivot'] = [m.meta['spinAxis'][0], m.meta['spinAxis'][1], 0]
    return out


def render_previews(models):
    os.makedirs(RENDERS, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.render.resolution_x = 1400
    sc.render.resolution_y = 700
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('w'); sc.world = world
    world.color = (0.85, 0.88, 0.92)
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 16
    cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
    # front three-quarter view, like the reference art
    target = Vector((0, 0, 3))
    cam.location = Vector((7, -26, 9))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(RENDERS, 'lineup.png')
    bpy.ops.render.render(write_still=True)


def main():
    reset_scene()
    built = []
    for i, (name, fn) in enumerate(MODELS):
        m = Model(name, (i - 1) * 6)
        fn(m)
        built.append(m)
        # place the weapon roughly in the hands for the preview .blend
    data = {m.name: export_model(m) for m in built}
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// GENERATED by tools/blender/build_towers.py - do not edit by hand.\n')
        f.write('// Vertex positions are integers in 1/1000 character units, grouped by rig part and colour.\n')
        f.write('export const TOWER_MODELS = ')
        f.write(json.dumps(data, separators=(',', ':')))
        f.write(';\n')
    try:
        render_previews(built)
    except Exception as e:  # previews are optional
        print('preview render failed:', e)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print('OK', {k: sum(len(g[1]) // 3 for p in v['parts'].values() for g in p) for k, v in data.items()}, os.path.getsize(OUT_JS))


main()
