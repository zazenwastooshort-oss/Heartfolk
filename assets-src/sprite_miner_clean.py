# Recipe: the miner in a late-90s pre-rendered style (in the spirit of Fallout 1): human proportions,
# rounded low-poly forms, muted earthy colours, gritty textures, hard light, no drop shadow.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/sprite_miner_retro.py
# Then: python tools/retro_post.py assets/sprites/miner_retro   (shrinks and reduces the palette)
import bpy, bmesh, math, os, random
from mathutils import noise
from mathutils import Vector

OUT = os.path.join(os.getcwd(), "assets", "sprites", "miner_clean")
SIZE = 512

# Clean, natural colours: one flat colour per material, no texture
PAL = {
    "skin": "#d6a27c", "hair": "#4a3020", "jacket": "#7a5233", "shirt": "#c9bb8e", "trousers": "#4f5a3a",
    "boots": "#3a2a1c", "belt": "#2e2118", "wood": "#8a5f3a", "iron": "#6a6e74", "stone": "#9a958c",
    "stone_dark": "#7c776f", "ore": "#c8763a", "eye": "#1a120c",
}

ANGLES = [-75, -110, -150, -185, -205, -210, -170, -110, -58, -58, -66, -72]
LEAN = [2, 0, -4, -8, -10, -10, -4, 6, 14, 14, 10, 6]
IMPACT = 8


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


MATS = {}
def mat(name):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(PAL[name])
    b.inputs["Roughness"].default_value = 0.35 if name == "iron" else 0.7
    b.inputs["Metallic"].default_value = 0.7 if name == "iron" else 0.0
    MATS[name] = m
    return m


def finish(name, bm, material, parent=None, smooth=True, soften=0.0, subsurf=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if parent: o.parent = parent
    if soften:
        bv = o.modifiers.new("bevel", "BEVEL"); bv.width = soften; bv.segments = 4; bv.harden_normals = False
    if subsurf:
        sd = o.modifiers.new("smooth", "SUBSURF"); sd.levels = sd.render_levels = 2
    return o


def box(name, size, loc, material, parent=None, taper=1.0, soften=0.025):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        if v.co.z > 0: v.co.x *= taper; v.co.y *= taper
        v.co = Vector((v.co.x * size[0] + loc[0], v.co.y * size[1] + loc[1], v.co.z * size[2] + loc[2]))
    return finish(name, bm, material, parent, soften=soften)


def limb(name, r_top, r_bot, top, bottom, material, parent=None, sides=16):
    """Tapered round limb from top point to bottom point."""
    top, bottom = Vector(top), Vector(bottom)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r_bot, radius2=r_top, depth=(top - bottom).length)
    d = (top - bottom).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(top + bottom) / 2, verts=bm.verts)
    return finish(name, bm, material, parent)


def blob(name, radius, loc, material, seed, squash=(1, 1, 1), parent=None, subdiv=2, jitter=0.12, smooth=False, craggy=False):
    random.seed(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4 if craggy else subdiv, radius=radius)
    off = Vector((seed * 3.7, seed * 1.3, seed * 2.1))
    for v in bm.verts:
        if craggy:
            n = v.co.normalized() * 2.2 + off
            v.co *= 1 + 0.22 * noise.noise(n) + 0.08 * noise.noise(n * 3.1) + 0.03 * noise.noise(n * 8.0)
            if v.co.z < -radius * 0.35: v.co.z = -radius * 0.35
        else:
            v.co *= 1 - jitter + random.random() * jitter * 2
        v.co = Vector((v.co.x * squash[0] + loc[0], v.co.y * squash[1] + loc[1], v.co.z * squash[2] + loc[2]))
    return finish(name, bm, material, parent, smooth=smooth or craggy, subsurf=smooth and not craggy)


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.location = loc; bpy.context.scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- character: about 1.75 m, facing +X ----------
for side, y in (("l", 0.1), ("r", -0.1)):
    limb(f"thigh_{side}", 0.095, 0.075, (0, y, 0.95), (0.01, y, 0.5), "trousers")
    limb(f"shin_{side}", 0.075, 0.062, (0.01, y, 0.52), (0, y, 0.1), "trousers")
    blob(f"knee_{side}", 0.078, (0.012, y, 0.51), "trousers", 30, parent=None, jitter=0.0, smooth=True)
    box(f"boot_{side}", (0.24, 0.12, 0.12), (0.04, y, 0.06), "boots", soften=0.03)
hips = empty("hips", (0, 0, 0.95))
box("pelvis", (0.24, 0.36, 0.16), (0, 0, 0.0), "trousers", hips, soften=0.06)
box("belt", (0.26, 0.38, 0.06), (0, 0, 0.07), "belt", hips, soften=0.01)
box("torso", (0.26, 0.42, 0.5), (0, 0, 0.32), "jacket", hips, taper=1.12, soften=0.09)
box("shirt", (0.02, 0.12, 0.34), (0.135, 0, 0.36), "shirt", hips, soften=0.005)
limb("neck", 0.05, 0.055, (0, 0, 0.66), (0, 0, 0.56), "skin", hips)
head = empty("head", (0.0, 0, 0.78), hips)
blob("skull", 0.115, (0, 0, 0), "skin", 1, squash=(1.05, 0.9, 1.15), parent=head, jitter=0.02, smooth=True)
blob("hair", 0.12, (-0.02, 0, 0.045), "hair", 2, squash=(1.08, 0.96, 0.9), parent=head, jitter=0.04, smooth=True)
box("nose", (0.04, 0.03, 0.05), (0.118, 0, -0.01), "skin", head, soften=0.008)
box("jaw", (0.12, 0.17, 0.06), (0.04, 0, -0.1), "skin", head, soften=0.02)
for y in (0.045, -0.045):
    box("eye", (0.01, 0.025, 0.018), (0.112, y, 0.02), "eye", head, soften=0.0)

arms = empty("arms", (0.02, 0, 0.47), hips)
for side, y in (("l", 0.25), ("r", -0.25)):
    blob(f"shoulder_{side}", 0.075, (0, y, 0), "jacket", 3, parent=arms, jitter=0.03, smooth=True)
    limb(f"upper_{side}", 0.065, 0.055, (0, y, 0), (0, y * 0.8, -0.3), "jacket", arms)
    blob(f"elbow_{side}", 0.056, (0, y * 0.8, -0.3), "jacket", 31, parent=arms, jitter=0.0, smooth=True)
    limb(f"fore_{side}", 0.052, 0.045, (0, y * 0.8, -0.3), (0, y * 0.4, -0.55), "skin", arms)
    blob(f"hand_{side}", 0.05, (0, y * 0.3, -0.6), "skin", 4, parent=arms, jitter=0.05, smooth=True)
limb("pick_handle", 0.025, 0.025, (0, 0, -0.5), (0, 0, -1.27), "wood", arms, sides=6)
bm = bmesh.new()
pts = [(-0.36, -1.16), (-0.18, -1.25), (0.0, -1.28), (0.18, -1.25), (0.3, -1.18)]
th = [0.012, 0.035, 0.05, 0.035, 0.015]
rings = []
for (x, z), t in zip(pts, th):
    rings.append([bm.verts.new((x, yy, z + dz)) for yy, dz in ((-t, -t), (t, -t), (t, t), (-t, t))])
for a, b in zip(rings, rings[1:]):
    for i in range(4): bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
finish("pick_head", bm, "iron", arms, smooth=False)

# ---------- rock: craggy, with copper veins ----------
blob("rock", 0.46, (1.16, 0, 0.18), "stone", 7, squash=(1.0, 1.15, 0.78), craggy=True)
blob("rock_small", 0.24, (1.45, 0.36, 0.08), "stone_dark", 11, squash=(1.1, 1, 0.7), craggy=True)
for i, (x, y, z) in enumerate([(0.92, -0.16, 0.4), (1.05, 0.24, 0.46), (1.25, -0.27, 0.38), (0.98, 0.04, 0.5), (1.36, 0.06, 0.44)]):
    blob(f"ore_{i}", 0.065, (x, y, z), "ore", 20 + i, subdiv=1, jitter=0.2, smooth=True)

chips = []
random.seed(5)
for i in range(6):
    c = blob(f"chip_{i}", 0.03, (0, 0, 0), "ore" if i % 2 else "stone", 40 + i, subdiv=0, jitter=0.3)
    chips.append((c, Vector((random.uniform(-0.6, 0.4), random.uniform(-0.7, 0.7), random.uniform(0.8, 1.4)))))

# ---------- hard, warm key light from upper left; dim dusty fill ----------
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0; sun.data.color = (1.0, 0.96, 0.9); sun.data.angle = math.radians(6)
sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(-120)); scene.collection.objects.link(sun)
world = bpy.data.worlds.new("dust"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.66, 0.75, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world

# Fixed overhead angle like a 90s isometric RPG: steep-ish elevation, viewed from the front-right.
target = empty("target", (0.55, 0, 0.95))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.3
elev, az = math.radians(38), math.radians(-60)
d = 10
cam.location = target.location + Vector((d * math.cos(elev) * math.cos(az), d * math.cos(elev) * math.sin(az), d * math.sin(elev)))
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
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
            c.location = Vector((0.9, 0, 0.45)) + vel * tt + Vector((0, 0, -4.9 * tt * tt)); c.hide_render = False
        else:
            c.hide_render = True
    scene.render.filepath = os.path.join(OUT, f"frame_{f:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("frame", f, flush=True)
print("DONE", OUT)
