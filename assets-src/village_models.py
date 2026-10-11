# Recipe: placeholder village models (low-poly, flat-shaded, palette from docs/PLAN.md "Art and feel"), exported as
# one glTF with each model as a named root node at the origin, front facing south (+z in the game, -Y here):
#   buildings: Bank, CityHall, Forge, Stall, StallBlue, Inn, House (cottage), HouseTall, HouseLong, Barn
#   props: Hearth, Lantern, Well, NoticeBoard, Bench, Crates, Garden, Fence (one 2 m section along X)
#   nature: TreeBirch, TreeOak, TreePine, Bush
# Glowing parts are named so the game can light them at night: meshes using materials window_glass, lamp_glass,
# forge_glow, flame, flame_core; the hearth's flames are nodes Flame and FlameCore.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/village_models.py
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

OUT = os.path.join(os.getcwd(), "assets", "models")
os.makedirs(OUT, exist_ok=True)

PAL = {
    "wall": "#e3cfa8", "roof": "#9b4a3a", "door": "#4a2f1a", "wood": "#8a5f3a", "wood_dark": "#5e3f24",
    "stone": "#8a8d92", "stone_hi": "#a9adb3", "slate": "#5b6470", "window_glass": "#3a5068", "iron": "#4f535a",
    "gold": "#e4a42a", "accent": "#a8641c", "cream": "#f1e8d4", "red_cloth": "#c0392b", "sack": "#c9ad7a",
    "flame": "#ff6a1a", "flame_core": "#ffe066", "forge_glow": "#ffa41b", "lamp_glass": "#ffd27a", "ash": "#3a3330",
    "bark": "#6b4423", "birch_bark": "#e8e2d6", "birch_mark": "#3a3a3a", "birch_leaf": "#8fc35e",
    "oak_leaf": "#3f7f35", "oak_leaf2": "#5a9a46", "pine": "#2f6b3a", "bush": "#4a8a3c",
    "flower_r": "#d84a4a", "flower_y": "#f4d03f", "apple": "#c0392b",
    "wall_white": "#f2ede2", "roof_brown": "#7a4a32", "thatch": "#b89a5a", "soil": "#6b4a2e", "crop": "#5fa04a",
    "pumpkin": "#e08a2a", "blue_cloth": "#2e6fb0", "water_dark": "#2a4a6a", "paper": "#efe6cf",
}
GLOW = {"flame", "flame_core", "forge_glow", "lamp_glass"}


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


MATS = {}
def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        b = m.node_tree.nodes["Principled BSDF"] if m.node_tree else None
        if b is None:
            m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = lin(PAL[name])
        b.inputs["Roughness"].default_value = 0.4 if name in ("iron", "gold", "window_glass") else 0.85
        b.inputs["Metallic"].default_value = 0.7 if name in ("iron", "gold") else 0.0
        if name in GLOW:
            b.inputs["Emission Color"].default_value = lin(PAL[name]); b.inputs["Emission Strength"].default_value = 1.0
        MATS[name] = m
    return MATS[name]


def obj(name, bm, material, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.parent = parent
    return o


def root(name):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    return e


def box(name, size, center, material, parent, rot_x=0.0, rot_z=0.0, taper=1.0, rot_y=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        if v.co.z > 0: v.co.x *= taper; v.co.y *= taper
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Rotation(rot_y, 4, "Y") @ Matrix.Rotation(rot_x, 4, "X")
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return obj(name, bm, material, parent)


def gable(name, w, d, h, z0, material, parent, center=(0, 0)):
    """Gable roof, ridge running along X (slopes face front and back)."""
    bm = bmesh.new()
    x0, x1, y0, y1 = center[0] - w / 2, center[0] + w / 2, center[1] - d / 2, center[1] + d / 2
    v = [bm.verts.new(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, center[1], z0 + h), (x1, center[1], z0 + h)]]
    for f in [(v[0], v[1], v[5], v[4]), (v[2], v[3], v[4], v[5]), (v[0], v[4], v[3]), (v[1], v[2], v[5]), (v[0], v[3], v[2], v[1])]:
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material, parent)


def hip(name, w, d, tw, td, h, z0, material, parent):
    """Hipped roof: a frustum from a w x d base to a tw x td top."""
    bm = bmesh.new()
    b = [bm.verts.new((sx * w / 2, sy * d / 2, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((sx * tw / 2, sy * td / 2, z0 + h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4): bm.faces.new((b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]))
    bm.faces.new(t); bm.faces.new(list(reversed(b)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material, parent)


def cyl(name, r1, r2, h, center, material, parent, seg=8, axis=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    if axis is not None:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=axis)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return obj(name, bm, material, parent)


def blob(name, r, center, material, parent, seed=0, squash=(1, 1, 1), subdiv=1, jitter=0.15):
    random.seed(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co *= 1 - jitter + random.random() * jitter * 2
        v.co = Vector((v.co.x * squash[0] + center[0], v.co.y * squash[1] + center[1], v.co.z * squash[2] + center[2]))
    return obj(name, bm, material, parent)


def window(parent, x, y, z, w=0.7, h=0.6, bars=False):
    box("window", (w, 0.06, h), (x, y, z), "window_glass", parent)
    box("sill", (w + 0.16, 0.14, 0.08), (x, y - 0.04, z - h / 2 - 0.04), "wood", parent)
    if bars:
        for k in (-1, 0, 1): box("bar", (0.04, 0.03, h), (x + k * w / 3.2, y - 0.04, z), "iron", parent)


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- House (cottage), 4.2 x 4.2 ----------
r = root("House")
box("foundation", (4.3, 4.3, 0.3), (0, 0, 0.15), "stone", r)
box("walls", (4.0, 4.0, 2.2), (0, 0, 1.4), "wall", r)
gable("roof", 4.7, 4.7, 1.7, 2.5, "roof", r)
box("chimney", (0.5, 0.5, 1.5), (1.15, 0.9, 3.4), "stone", r)
box("door", (0.9, 0.08, 1.6), (0, -2.02, 1.1), "door", r)
window(r, -1.25, -2.02, 1.65); window(r, 1.25, -2.02, 1.65)
box("flowerbox", (0.9, 0.22, 0.2), (1.25, -2.15, 1.18), "wood", r)
for i, x in enumerate((0.95, 1.2, 1.45)):
    blob("flower", 0.09, (x, -2.17, 1.33), "flower_r" if i % 2 else "flower_y", r, seed=i, subdiv=0)

# ---------- Bank, 5 x 4 ----------
r = root("Bank")
box("plinth", (5.4, 4.6, 0.3), (0, 0, 0.15), "stone", r)
box("step", (2.4, 0.7, 0.16), (0, -2.6, 0.08), "stone", r)
box("walls", (5.0, 4.0, 2.6), (0, 0, 1.6), "stone_hi", r)
hip("roof", 5.7, 4.7, 3.0, 1.7, 1.4, 2.9, "slate", r)
for x in (-1.05, 1.05): cyl("column", 0.16, 0.14, 2.4, (x, -2.55, 1.5), "stone_hi", r, seg=8)
box("porch_roof", (3.0, 1.1, 0.2), (0, -2.45, 2.8), "slate", r)
box("door", (1.1, 0.08, 1.9), (0, -2.02, 1.25), "door", r)
for z in (0.75, 1.75): box("band", (1.12, 0.1, 0.08), (0, -2.06, z), "iron", r)
box("sign", (1.3, 0.08, 0.5), (0, -2.1, 2.45), "wood", r)
cyl("coin", 0.19, 0.19, 0.05, (0, -2.16, 2.45), "gold", r, seg=12, axis=Matrix.Rotation(math.pi / 2, 3, "X"))
window(r, -1.75, -2.02, 1.7, 0.5, 0.65, bars=True); window(r, 1.75, -2.02, 1.7, 0.5, 0.65, bars=True)

# ---------- City hall, 6 x 5, two storeys with a bell tower and banner ----------
r = root("CityHall")
for i, (w, d) in enumerate([(3.2, 0.5), (2.8, 0.5), (2.4, 0.5)]):
    box("steps", (w, d, 0.15), (0, -2.75 - 0.0 + i * 0.0 - 0.25 * (2 - i), 0.075 + 0.15 * i), "stone", r)
box("ground_floor", (6.0, 5.0, 2.4), (0, 0, 1.2), "stone", r)
box("upper_floor", (6.2, 5.2, 2.0), (0, 0, 3.4), "wall", r)
for x in (-3.0, -1.5, 0, 1.5, 3.0):
    for y in (-2.62, 2.62): box("beam", (0.16, 0.06, 2.0), (x, y, 3.4), "wood_dark", r)
for y in (-2.62, 2.62): box("beam", (6.2, 0.06, 0.16), (0, y, 2.45), "wood_dark", r)
gable("roof", 6.9, 5.9, 2.3, 4.4, "roof", r)
box("tower", (1.3, 1.3, 1.3), (0, 0, 6.6), "wall", r)
hip("tower_roof", 1.7, 1.7, 0.1, 0.1, 1.1, 7.25, "roof", r)
cyl("flagpole", 0.04, 0.04, 1.6, (0, 0, 9.0), "wood", r, seg=6)
box("banner", (0.8, 0.04, 0.5), (0.42, 0, 9.5), "accent", r)
box("door", (1.7, 0.08, 2.0), (0, -2.52, 1.0), "door", r)
window(r, -1.9, -2.52, 1.3); window(r, 1.9, -2.52, 1.3)
for x in (-1.9, 0, 1.9): window(r, x, -2.67, 3.5)

# ---------- Forge (smithy), 4.6 x 4.2: open front, chimney with a glowing furnace, anvil ----------
r = root("Forge")
box("floor", (4.6, 4.2, 0.2), (0, 0, 0.1), "stone", r)
box("back_wall", (4.4, 0.5, 2.4), (0, 1.85, 1.3), "stone", r)
for x in (-2.0, 2.0): box("side_wall", (0.5, 4.0, 1.2), (x, 0, 0.7), "stone", r)
for x in (-2.0, 2.0): cyl("post", 0.12, 0.12, 2.6, (x, -1.9, 1.4), "wood", r, seg=6)
box("roof", (4.9, 4.7, 0.18), (0, 0.1, 2.85), "wood_dark", r, rot_x=math.radians(-7))
box("chimney", (1.4, 1.2, 4.2), (1.25, 1.35, 2.1), "stone", r)
box("furnace_mouth", (0.62, 0.06, 0.5), (1.25, 0.72, 0.85), "forge_glow", r)
box("anvil_base", (0.36, 0.28, 0.5), (-0.7, -0.6, 0.45), "iron", r)
box("anvil_top", (0.8, 0.3, 0.2), (-0.7, -0.6, 0.8), "iron", r)
cyl("anvil_horn", 0.13, 0.0, 0.35, (-1.27, -0.6, 0.8), "iron", r, seg=6, axis=Matrix.Rotation(math.pi / 2, 3, "Y"))
cyl("barrel", 0.3, 0.27, 0.75, (-1.45, 1.1, 0.57), "wood", r, seg=10)
blob("coal", 0.35, (0.0, 1.25, 0.3), "ash", r, seed=4, squash=(1.2, 0.8, 0.5))

# ---------- Merchant stall, 3 x 2: counter, striped awning, goods ----------
r = root("Stall")
box("counter", (3.0, 0.8, 1.0), (0, -0.45, 0.5), "wood", r)
box("shelf", (3.0, 0.45, 1.4), (0, 0.72, 0.7), "wood_dark", r)
for x in (-1.45, 1.45):
    for y in (-0.9, 0.95): cyl("post", 0.07, 0.07, 2.5, (x, y, 1.25), "wood", r, seg=6)
slope = math.atan2(0.45, 1.9)
for i in range(6):
    box("awning", (0.52, 2.15, 0.06), (-1.3 + i * 0.52, 0.0, 2.32), "red_cloth" if i % 2 == 0 else "cream", r, rot_x=-slope)
box("crate", (0.45, 0.4, 0.35), (-0.95, -0.45, 1.18), "wood_dark", r)
box("crate", (0.4, 0.4, 0.3), (-0.4, -0.5, 1.15), "wood", r)
for i, x in enumerate((-1.05, -0.85, -0.95)):
    blob("apple", 0.08, (x, -0.5 + i * 0.07, 1.42), "apple", r, seed=10 + i, subdiv=0)
for i, x in enumerate((0.55, 1.05)):
    blob("sack", 0.28, (x, -0.45, 1.25), "sack", r, seed=20 + i, squash=(1, 0.9, 1.15))

# ---------- Hearth: stone ring, ash, logs, flames ----------
r = root("Hearth")
for i in range(11):
    a = i / 11 * math.tau
    blob("stone", 0.2, (math.cos(a) * 0.9, math.sin(a) * 0.9, 0.1), "stone", r, seed=30 + i, squash=(1, 1, 0.7), subdiv=0)
cyl("ash", 0.75, 0.75, 0.05, (0, 0, 0.03), "ash", r, seg=12)
for i in range(3):
    a = i / 3 * math.tau
    cyl("log", 0.08, 0.08, 1.0, (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.32), "wood", r, seg=6,
        axis=Matrix.Rotation(a, 3, "Z") @ Matrix.Rotation(math.radians(62), 3, "Y"))
cyl("Flame", 0.36, 0.0, 0.95, (0, 0, 0.55), "flame", r, seg=6)
cyl("FlameCore", 0.18, 0.0, 0.62, (0, 0, 0.42), "flame_core", r, seg=5)

# ---------- Lantern post ----------
r = root("Lantern")
box("post", (0.11, 0.11, 1.7), (0, 0, 0.85), "wood_dark", r)
box("arm", (0.06, 0.42, 0.06), (0, -0.18, 1.62), "wood_dark", r)
box("lamp_frame", (0.26, 0.26, 0.32), (0, -0.36, 1.42), "iron", r)
box("lamp", (0.2, 0.28, 0.24), (0, -0.36, 1.42), "lamp_glass", r)
box("lamp_cap", (0.32, 0.32, 0.06), (0, -0.36, 1.61), "iron", r)

# ---------- Trees and a bush ----------
r = root("TreeBirch")
cyl("trunk", 0.13, 0.09, 2.3, (0, 0, 1.15), "birch_bark", r, seg=6)
random.seed(40)
for i in range(5):
    a = random.random() * math.tau; z = 0.4 + random.random() * 1.5
    box("mark", (0.12, 0.05, 0.05), (math.cos(a) * 0.115, math.sin(a) * 0.115, z), "birch_mark", r, rot_z=a + math.pi / 2)
for i, (x, y, z, rr) in enumerate([(0, 0, 2.6, 0.75), (0.35, 0.2, 2.2, 0.55), (-0.3, -0.25, 2.3, 0.58)]):
    blob("crown", rr, (x, y, z), "birch_leaf", r, seed=41 + i, squash=(1, 1, 1.15))

r = root("TreeOak")
cyl("trunk", 0.24, 0.16, 1.7, (0, 0, 0.85), "bark", r, seg=7)
for i, (x, y, z, rr, m) in enumerate([(0, 0, 2.3, 1.15, "oak_leaf"), (0.7, 0.3, 1.95, 0.8, "oak_leaf2"),
                                      (-0.65, -0.35, 2.0, 0.85, "oak_leaf2"), (0.1, -0.6, 2.6, 0.7, "oak_leaf")]):
    blob("crown", rr, (x, y, z), m, r, seed=50 + i)

r = root("TreePine")
cyl("trunk", 0.15, 0.11, 0.9, (0, 0, 0.45), "bark", r, seg=6)
for i, (rr, h, z) in enumerate([(1.05, 1.3, 1.25), (0.82, 1.15, 1.95), (0.55, 1.0, 2.6)]):
    cyl("needles", rr, 0.0, h, (0, 0, z), "pine", r, seg=7)

r = root("Bush")
for i, (x, y, rr) in enumerate([(0, 0, 0.45), (0.38, 0.12, 0.34), (-0.32, -0.1, 0.36)]):
    blob("leaves", rr, (x, y, rr * 0.8), "bush", r, seed=60 + i, squash=(1, 1, 0.85))

# ---------- Market stall with a blue awning ----------
src = bpy.data.objects["Stall"]
r = root("StallBlue")
for child in list(src.children):
    c = child.copy(); c.data = child.data.copy(); bpy.context.scene.collection.objects.link(c); c.parent = r
    if c.data.materials and c.data.materials[0].name == "red_cloth": c.data.materials[0] = mat("blue_cloth")

# ---------- Townhouse: two storeys, timber frame, brown roof, 4.4 x 4.4 ----------
r = root("HouseTall")
box("foundation", (4.5, 4.5, 0.3), (0, 0, 0.15), "stone", r)
box("ground_floor", (4.2, 4.2, 2.2), (0, 0, 1.4), "stone_hi", r)
box("upper_floor", (4.4, 4.4, 2.0), (0, 0, 3.5), "wall_white", r)
for x in (-2.2, -0.75, 0.75, 2.2):
    for y in (-2.22, 2.22): box("beam", (0.14, 0.05, 2.0), (x, y, 3.5), "wood_dark", r)
for y in (-2.22, 2.22): box("beam", (4.4, 0.05, 0.14), (0, y, 2.55), "wood_dark", r)
gable("roof", 5.0, 5.0, 2.0, 4.5, "roof_brown", r)
box("chimney", (0.5, 0.5, 1.4), (-1.3, 0.9, 5.6), "stone", r)
box("door", (0.9, 0.08, 1.7), (0, -2.12, 1.15), "door", r)
window(r, -1.3, -2.12, 1.6); window(r, 1.3, -2.12, 1.6)
for x in (-1.45, 0, 1.45): window(r, x, -2.25, 3.6, 0.6, 0.6)

# ---------- Longhouse: long and low under a thatched roof, 6.5 x 3.6 ----------
r = root("HouseLong")
box("foundation", (6.6, 3.7, 0.25), (0, 0, 0.125), "stone", r)
box("walls", (6.4, 3.6, 1.9), (0, 0, 1.2), "wall", r)
gable("roof", 7.2, 4.6, 2.3, 2.15, "thatch", r)
box("door", (0.95, 0.08, 1.6), (-1.6, -1.82, 1.05), "door", r)
for x in (0.2, 1.8): window(r, x, -1.82, 1.45, 0.65, 0.55)
window(r, -2.8, -1.82, 1.45, 0.5, 0.5)
box("chimney", (0.45, 0.45, 1.2), (2.4, 0.6, 3.6), "stone", r)

# ---------- Inn: two storeys, a hanging sign, 6 x 5 ----------
r = root("Inn")
box("ground_floor", (6.0, 5.0, 2.4), (0, 0, 1.2), "stone", r)
box("upper_floor", (6.2, 5.2, 2.1), (0, 0, 3.45), "wall", r)
for x in (-3.1, -1.55, 0, 1.55, 3.1):
    for y in (-2.62, 2.62): box("beam", (0.16, 0.06, 2.1), (x, y, 3.45), "wood_dark", r)
gable("roof", 6.9, 5.9, 2.2, 4.5, "roof", r)
box("chimney", (0.6, 0.6, 1.8), (2.0, 1.2, 5.6), "stone", r)
box("door", (1.6, 0.08, 2.0), (-0.8, -2.52, 1.0), "door", r)
window(r, 1.6, -2.52, 1.3, 1.1, 0.7); window(r, -2.4, -2.52, 1.3, 0.6, 0.7)
for x in (-2.0, 0, 2.0): window(r, x, -2.67, 3.5, 0.7, 0.65)
box("sign_arm", (0.08, 0.9, 0.08), (2.7, -2.95, 2.75), "wood_dark", r)
box("sign", (0.08, 0.7, 0.55), (2.7, -3.2, 2.35), "accent", r, rot_z=math.pi / 2)
cyl("sign_mug", 0.14, 0.14, 0.1, (2.7, -3.26, 2.35), "gold", r, seg=10, axis=Matrix.Rotation(math.pi / 2, 3, "X"))

# ---------- Barn: board walls, big braced doors, 6 x 4.5 ----------
r = root("Barn")
box("walls", (6.0, 4.5, 3.0), (0, 0, 1.5), "wood", r)
gable("roof", 6.6, 5.2, 2.2, 3.0, "roof_brown", r)
box("door", (2.4, 0.08, 2.5), (0, -2.27, 1.25), "wood_dark", r)
for k in (-1, 1): box("brace", (3.3, 0.1, 0.12), (0, -2.33, 1.25), "wood", r, rot_y=k * math.atan2(2.5, 2.4))
box("brace", (2.4, 0.1, 0.12), (0, -2.33, 2.45), "wood", r)
box("hayloft", (1.0, 0.08, 0.8), (0, -2.27, 3.6), "wood_dark", r)

# ---------- Props ----------
r = root("Well")
cyl("ring", 0.75, 0.75, 0.75, (0, 0, 0.375), "stone", r, seg=10)
cyl("water", 0.6, 0.6, 0.02, (0, 0, 0.6), "water_dark", r, seg=10)
for x in (-0.65, 0.65): box("post", (0.12, 0.12, 1.7), (x, 0, 1.2), "wood_dark", r)
box("crossbar", (1.5, 0.08, 0.08), (0, 0, 1.75), "wood_dark", r)
gable("roof", 1.8, 1.3, 0.55, 2.0, "roof", r)
cyl("bucket", 0.14, 0.12, 0.2, (0.2, 0, 1.3), "wood", r, seg=8)

r = root("NoticeBoard")
for x in (-0.55, 0.55): box("post", (0.1, 0.1, 1.9), (x, 0, 0.95), "wood_dark", r)
box("board", (1.3, 0.08, 0.85), (0, 0, 1.35), "wood", r)
gable("cap", 1.5, 0.35, 0.22, 1.82, "roof", r)
random.seed(70)
for i in range(5):
    box("paper", (0.22 + random.random() * 0.1, 0.02, 0.28), (-0.45 + i * 0.22, -0.05, 1.3 + (random.random() - 0.5) * 0.3), "paper", r)

r = root("Bench")
box("seat", (1.4, 0.38, 0.08), (0, 0, 0.45), "wood", r)
for x in (-0.55, 0.55): box("leg", (0.1, 0.32, 0.42), (x, 0, 0.21), "wood_dark", r)

r = root("Crates")
box("crate", (0.6, 0.6, 0.6), (0, 0, 0.3), "wood_dark", r)
box("crate", (0.55, 0.55, 0.5), (0.65, 0.1, 0.25), "wood", r)
box("crate", (0.5, 0.5, 0.45), (0.1, 0.05, 0.825), "wood", r, rot_z=0.4)
cyl("barrel", 0.28, 0.25, 0.7, (-0.6, 0.3, 0.35), "wood", r, seg=10)

r = root("Garden")                      # 3 x 2 m vegetable plot
box("soil", (3.0, 2.0, 0.14), (0, 0, 0.07), "soil", r)
random.seed(80)
for row in range(3):
    for k in range(6):
        y = -0.6 + row * 0.6; x = -1.25 + k * 0.5
        if row == 2 and k % 2 == 0: blob("pumpkin", 0.14, (x, y, 0.2), "pumpkin", r, seed=81 + k, squash=(1, 1, 0.75), subdiv=0)
        else: blob("crop", 0.13, (x, y, 0.24), "crop", r, seed=90 + row * 6 + k, squash=(1, 1, 1.3), subdiv=0)

r = root("Fence")                       # one 2 m section along X, centred on the origin
for x in (-1.0, 1.0): box("post", (0.1, 0.1, 0.9), (x, 0, 0.45), "wood_dark", r)
for z in (0.35, 0.7): box("rail", (2.0, 0.06, 0.08), (0, 0, z), "wood", r)

# ---------- export ----------
path = os.path.join(OUT, "village.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                          export_animations=False, export_lights=False, export_cameras=False)
print("DONE", path, os.path.getsize(path))
