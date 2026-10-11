# Recipe (v2): the player's character mining a copper rock, in shaped OSRS-like low-poly rather than cubes.
# Run from the project folder:
#   A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/sprite_miner_v2.py
# Output: assets/sprites/miner_v2/frame_00.png ... (transparent PNGs, fixed camera from above)
import bpy, bmesh, math, os, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = os.path.join(os.getcwd(), "assets", "sprites", "miner_v2")
SIZE = 384

# Palette (docs/PLAN.md, Art and feel, plus the prototype's character colours)
PAL = {
    "skin": "#f1c27d", "hair": "#5b3a1e", "tunic": "#c0392b", "belt": "#4a2f1a", "legs": "#4a3728",
    "boots": "#2c1e12", "wood": "#8a5f3a", "iron": "#4f535a", "iron_hi": "#5d6168",
    "stone": "#8a8d92", "stone_dark": "#6e7176", "ore": "#c8763a", "ore_hi": "#e0954f", "eye": "#2a1a0f",
    "tunic_dark": "#9a2c22", "buckle": "#e4a42a", "pouch": "#7a4e2a",
}

# Swing: arm angle per frame (degrees about the Y axis; -90 = arms straight forward)
# 0-5 slow wind-up overhead, 6-8 fast strike, 9 impact, 10-11 recover
ANGLES = [-75, -110, -150, -185, -205, -210, -170, -110, -58, -58, -66, -72]
LEAN = [2, 0, -4, -8, -10, -10, -4, 6, 14, 14, 10, 6]   # torso lean toward the rock, degrees
IMPACT = 8                                                  # frame the pick hits the rock


def lin(hexstr):
    c = [int(hexstr[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


MATS = {}
def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = lin(PAL[name])
        b.inputs["Roughness"].default_value = 0.35 if name.startswith("iron") else 0.85
        b.inputs["Metallic"].default_value = 0.6 if name.startswith("iron") else 0.0
        MATS[name] = m
    return MATS[name]


def obj_from_bm(name, bm, material, parent=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o


def box(name, size, loc, material, parent=None, taper=1.0):
    """Box with its centre at loc; taper < 1 narrows the top face (chunky OSRS-style torso)."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        if v.co.z > 0: v.co.x *= taper; v.co.y *= taper
        v.co = Vector((v.co.x * size[0] + loc[0], v.co.y * size[1] + loc[1], v.co.z * size[2] + loc[2]))
    return obj_from_bm(name, bm, material, parent)


def blob(name, radius, loc, material, seed, squash=(1, 1, 1), parent=None, subdiv=1, jitter=0.18):
    random.seed(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    for v in bm.verts:
        v.co *= 1 - jitter + random.random() * jitter * 2
        v.co = Vector((v.co.x * squash[0] + loc[0], v.co.y * squash[1] + loc[1], v.co.z * squash[2] + loc[2]))
    return obj_from_bm(name, bm, material, parent)


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.location = loc; bpy.context.scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e


def prism(name, r_bot, r_top, z_bot, z_top, material, parent=None, sides=6, sx=1.0, sy=1.0, rot=0.0):
    """Tapered prism (faceted, flat shaded) from z_bot to z_top."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r_bot, radius2=r_top, depth=z_top - z_bot)
    c, s_ = math.cos(rot), math.sin(rot)
    for v in bm.verts:
        x, y = v.co.x * c - v.co.y * s_, v.co.x * s_ + v.co.y * c
        v.co = Vector((x * sx, y * sy, v.co.z + (z_bot + z_top) / 2))
    return obj_from_bm(name, bm, material, parent)


def limb(name, r_top, r_bot, top, bottom, material, parent=None, sides=6):
    """Tapered 6-sided limb between two points."""
    top, bottom = Vector(top), Vector(bottom)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r_bot, radius2=r_top, depth=(top - bottom).length)
    rot = Vector((0, 0, 1)).rotation_difference((top - bottom).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(top + bottom) / 2, verts=bm.verts)
    return obj_from_bm(name, bm, material, parent)


def boot(name, loc, material):
    """Boot with a sloped toe: a box whose front top edge drops."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x, y, z = v.co.x * 0.27, v.co.y * 0.16, (v.co.z + 0.5) * 0.15
        if v.co.x > 0 and v.co.z > 0: z -= 0.065
        v.co = Vector((x + loc[0], y + loc[1], z + loc[2]))
    return obj_from_bm(name, bm, material)


def faceted_head(head):
    """Faceted head with a narrower jaw, a nose, ears, eyes, brows and a hair cap."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.21)
    for v in bm.verts:
        v.co.x *= 0.95; v.co.y *= 0.9; v.co.z *= 1.05
        if v.co.z < -0.05:
            v.co.y *= 0.8; v.co.x += 0.02
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    def on_face(y, z, depth):
        """x where a feature of the given depth sits flush on the faceted face at (y, z)."""
        hit = tree.ray_cast(Vector((1.0, y, z)), Vector((-1.0, 0, 0)))[0]
        return (hit.x if hit else 0.17) - depth / 2 + 0.004
    obj_from_bm("face", bm, "skin", head)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.045, radius2=0.0, depth=0.08)
    rot = Vector((0, 0, 1)).rotation_difference(Vector((1, 0, -0.35)).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts); bmesh.ops.translate(bm, vec=(0.205, 0, -0.03), verts=bm.verts)
    obj_from_bm("nose", bm, "skin", head)
    for y in (0.19, -0.19):
        blob("ear", 0.045, (-0.01, y, 0.0), "skin", 6, squash=(0.7, 0.5, 1.0), parent=head, subdiv=0, jitter=0.05)
    for y in (0.075, -0.075):
        box("eye", (0.016, 0.04, 0.05), (on_face(y, 0.035, 0.016), y, 0.035), "eye", head)
        box("brow", (0.016, 0.07, 0.022), (on_face(y * 1.05, 0.085, 0.016), y * 1.05, 0.085), "hair", head)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.228)
    for v in bm.verts:
        v.co.y *= 0.95; v.co.z *= 0.92; v.co.x -= 0.02; v.co.z += 0.04
        if v.co.x > 0.05: v.co.z = max(v.co.z, 0.1)
        else: v.co.z = max(v.co.z, -0.12 if v.co.x < -0.08 else 0.0)
    obj_from_bm("hair", bm, "hair", head)


# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Character faces +X, toward the rock. Hips pivot lets the torso lean into the swing.
# Shaped low-poly (OSRS-like facets, not cubes): tapered 6-8 sided limbs and torso, a faceted head
# with jaw, nose and ears, a hair cap, big readable hands and shaped boots.
hips = empty("hips", (0, 0, 0.62))
for side, y in (("l", 0.11), ("r", -0.11)):
    limb(f"leg_{side}", 0.095, 0.072, (0, y, 0.66), (0.01, y, 0.12), "legs")
    boot(f"boot_{side}", (0.05, y, 0.0), "boots")
prism("torso", 0.2, 0.25, 0.0, 0.6, "tunic", hips, sides=8, sx=0.72, rot=math.pi / 8)
prism("belt", 0.212, 0.212, -0.02, 0.07, "belt", hips, sides=8, sx=0.74, rot=math.pi / 8)
box("buckle", (0.03, 0.08, 0.06), (0.155, 0, 0.025), "buckle", hips)
box("pouch", (0.1, 0.06, 0.1), (0.04, -0.22, -0.02), "pouch", hips)
prism("neck", 0.07, 0.065, 0.56, 0.7, "skin", hips, sides=6)
head = empty("head", (0, 0, 0.84), hips)
faceted_head(head)

# Both arms hang from one shoulder pivot so they swing together, holding the pick.
arms = empty("arms", (0.02, 0, 0.58), hips)
for side, y in (("l", 0.27), ("r", -0.27)):
    blob(f"shoulder_{side}", 0.095, (0, y * 0.96, 0.0), "tunic", 3, parent=arms, subdiv=1, jitter=0.05)
    limb(f"upper_{side}", 0.078, 0.068, (0, y, 0.0), (0, y * 0.85, -0.27), "tunic", arms)
    limb(f"cuff_{side}", 0.074, 0.074, (0, y * 0.86, -0.25), (0, y * 0.82, -0.31), "tunic_dark", arms)
    limb(f"fore_{side}", 0.06, 0.052, (0, y * 0.84, -0.28), (0, y * 0.58, -0.5), "skin", arms)
    blob(f"hand_{side}", 0.072, (0, y * 0.5, -0.55), "skin", 4, parent=arms, subdiv=1, jitter=0.08, squash=(1, 0.85, 1.1))
    blob(f"thumb_{side}", 0.03, (0.06, y * 0.42, -0.5), "skin", 5, parent=arms, subdiv=0, jitter=0.1)
box("pick_handle", (0.07, 0.07, 0.72), (0, 0, -0.78), "wood", arms)
box("pick_collar", (0.11, 0.11, 0.1), (0, 0, -1.12), "iron", arms)
# Pick head: a curved, tapering iron bar across the handle end. The tip at local -X leads the strike.
bm = bmesh.new()
pts = [(-0.36, -1.02), (-0.18, -1.12), (0.0, -1.16), (0.18, -1.12), (0.32, -1.04)]
th = [0.02, 0.05, 0.07, 0.05, 0.025]
verts = []
for (x, z), t in zip(pts, th):
    ring = [bm.verts.new((x, y, z + dz)) for y, dz in ((-t, -t), (t, -t), (t, t), (-t, t))]
    verts.append(ring)
for a, b in zip(verts, verts[1:]):
    for i in range(4):
        bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
bm.faces.new(list(reversed(verts[0]))); bm.faces.new(verts[-1])
obj_from_bm("pick_head", bm, "iron_hi", arms)

# Copper rock in front of the character, with ore nuggets set into it.
blob("rock", 0.42, (1.08, 0, 0.2), "stone", 7, squash=(1.0, 1.1, 0.72))
blob("rock_small", 0.22, (1.35, 0.33, 0.1), "stone_dark", 11, squash=(1.1, 1, 0.7))
for i, (x, y, z) in enumerate([(0.86, -0.15, 0.38), (1.0, 0.22, 0.42), (1.2, -0.25, 0.33), (0.92, 0.05, 0.47), (1.3, 0.05, 0.4)]):
    blob(f"ore_{i}", 0.08, (x, y, z), "ore" if i % 2 else "ore_hi", 20 + i, subdiv=0, jitter=0.25)

# Ground: a shadow catcher, so the sprite keeps its soft shadow on a transparent background.
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
ground = obj_from_bm("ground", bm, "stone"); ground.is_shadow_catcher = True

# Chips that fly off the rock on impact.
chips = []
random.seed(5)
for i in range(6):
    c = blob(f"chip_{i}", 0.035, (0, 0, 0), "ore" if i % 2 else "stone", 40 + i, subdiv=0, jitter=0.3)
    vel = Vector((random.uniform(-0.6, 0.4), random.uniform(-0.7, 0.7), random.uniform(0.8, 1.4)))
    chips.append((c, vel))

# ---------- light, camera, render ----------
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.2; sun.data.color = (1.0, 0.95, 0.85); sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(30), math.radians(-12), math.radians(-30)); scene.collection.objects.link(sun)
world = bpy.data.worlds.new("sky"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.75, 1.0, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
scene.world = world

target = empty("target", (0.55, 0, 0.95))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.3
elev, az = math.radians(32), math.radians(-72)          # fixed angle from above, slightly from the front
d = 10
cam.location = target.location + Vector((d * math.cos(elev) * math.cos(az), d * math.cos(elev) * math.sin(az), d * math.sin(elev)))
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"          # keep the palette's colours as they are
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"

os.makedirs(OUT, exist_ok=True)
for f, (ang, lean) in enumerate(zip(ANGLES, LEAN)):
    arms.rotation_euler = (0, math.radians(ang), 0)
    hips.rotation_euler = (0, math.radians(lean), 0)
    head.rotation_euler = (0, math.radians(-lean * 0.5 + (6 if f in (IMPACT, IMPACT + 1) else 0)), 0)
    t = f - IMPACT
    for c, vel in chips:
        if 0 <= t <= 3:
            tt = (t + 0.5) * 0.09
            c.location = Vector((0.85, 0, 0.42)) + vel * tt + Vector((0, 0, -4.9 * tt * tt))
            c.hide_render = False
        else:
            c.hide_render = True
    scene.render.filepath = os.path.join(OUT, f"frame_{f:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("frame", f, flush=True)
print("DONE", OUT)
