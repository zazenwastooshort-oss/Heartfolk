# Recipe: a realistic human miner (MakeHuman body via the MPFB extension, CC0 assets), clean pre-rendered style.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b -P assets-src/human_miner.py -- [still|anim]
#   still: one check render at assets/sprites/miner_human/check.png
#   anim:  the 12-frame mining loop at assets/sprites/miner_human/frame_XX.png
# Needs MPFB 2.0.18 and the makehuman_system_assets_cc0 pack installed in the portable Blender (see CLAUDE.md).
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, noise
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

MODE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "still"
OUT = os.path.join(os.getcwd(), "assets", "sprites", "miner_human")
os.makedirs(OUT, exist_ok=True)
DATA = LocationService.get_user_data()
asset = lambda kind, name, ext="mhclo": os.path.join(DATA, kind, name, f"{name}.{ext}")

# ---------- the body ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
body = HumanService.create_human(macro_detail_dict={
    "gender": 1.0, "age": 0.55, "muscle": 0.7, "weight": 0.55, "proportions": 0.6, "height": 0.55,
    "cupsize": 0.5, "firmness": 0.5, "race": {"caucasian": 0.7, "african": 0.15, "asian": 0.15},
})
rig = HumanService.add_builtin_rig(body, "game_engine")
HumanService.set_character_skin(asset("skins", "middleage_caucasian_male", "mhmat"), body, skin_type="MAKESKIN")
for kind, name, atype in [("clothes", "male_worksuit01", "Clothes"), ("clothes", "shoes02", "Clothes"),
                          ("hair", "short02", "Hair"), ("eyebrows", "eyebrow001", "Eyebrows"),
                          ("eyes", "low-poly", "Eyes")]:
    path = asset(kind, name)
    if os.path.exists(path):
        try:
            HumanService.add_mhclo_asset(path, body, asset_type=atype, subdiv_levels=0, material_type="MAKESKIN")
        except Exception as e:
            print("SKIP", name, e)
    else:
        print("MISSING", path)

# Face +X (MakeHuman faces -Y)
rig.rotation_euler = (0, 0, math.radians(90))
bpy.context.view_layer.update()

# ---------- camera and light (same fixed angle as the other sprite tests) ----------
def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.location = loc; scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0; sun.data.color = (1.0, 0.96, 0.9); sun.data.angle = math.radians(6)
sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(-120)); scene.collection.objects.link(sun)
world = bpy.data.worlds.new("sky"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.66, 0.75, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world

target = empty("target", (0.55, 0, 0.95) if MODE == "anim" else (0, 0, 0.9))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.3 if MODE == "anim" else 2.1
elev, az = math.radians(38), math.radians(-60)
cam.location = target.location + Vector((10 * math.cos(elev) * math.cos(az), 10 * math.cos(elev) * math.sin(az), 10 * math.sin(elev)))
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"

if MODE == "still":
    scene.render.filepath = os.path.join(OUT, "check.png")
    bpy.ops.render.render(write_still=True)
    print("DONE still")
    sys.exit(0)

# ---------- props ----------
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)

def mat(name, hexcol, rough=0.7, metal=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(hexcol); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m

def finish(name, bm, material, parent=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(material)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o

def rock(name, radius, loc, material, seed, squash):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4, radius=radius)
    off = Vector((seed * 3.7, seed * 1.3, seed * 2.1))
    for v in bm.verts:
        n = v.co.normalized() * 2.2 + off
        v.co *= 1 + 0.22 * noise.noise(n) + 0.08 * noise.noise(n * 3.1) + 0.03 * noise.noise(n * 8.0)
        if v.co.z < -radius * 0.35: v.co.z = -radius * 0.35
        v.co = Vector((v.co.x * squash[0] + loc[0], v.co.y * squash[1] + loc[1], v.co.z * squash[2] + loc[2]))
    return finish(name, bm, material)

def nugget(name, r, loc, material, seed, parent=None):
    random.seed(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co *= 0.75 + random.random() * 0.5
        v.co += Vector(loc)
    return finish(name, bm, material, parent, smooth=False)

M_WOOD, M_IRON = mat("wood", "#8a5f3a"), mat("iron", "#6a6e74", 0.35, 0.7)
M_STONE, M_STONE2, M_ORE = mat("stone", "#9a958c", 0.85), mat("stone2", "#7c776f", 0.85), mat("ore", "#c8763a", 0.5, 0.3)

# Shoulder centre in world space: the swing pivots here.
mw = rig.matrix_world
sh_l, sh_r = mw @ rig.pose.bones["upperarm_l"].head, mw @ rig.pose.bones["upperarm_r"].head
pivot_pt = (sh_l + sh_r) / 2 + Vector((0.04, 0, 0))
swing = empty("swing", pivot_pt)

# Pick: handle along local -Z, head across the end; tip at local -X leads the strike.
GRIP_BACK, GRIP_FRONT, HANDLE_END = 0.40, 0.56, 1.18
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.022, radius2=0.022, depth=HANDLE_END - 0.28)
bmesh.ops.translate(bm, vec=(0, 0, -(0.28 + HANDLE_END) / 2), verts=bm.verts)
finish("pick_handle", bm, M_WOOD, swing)
bm = bmesh.new()
pts = [(-0.34, -HANDLE_END + 0.1), (-0.17, -HANDLE_END + 0.02), (0.0, -HANDLE_END - 0.01), (0.17, -HANDLE_END + 0.02), (0.29, -HANDLE_END + 0.09)]
th = [0.01, 0.03, 0.045, 0.03, 0.014]
rings = [[bm.verts.new((x, yy, z + dz)) for yy, dz in ((-t, -t), (t, -t), (t, t), (-t, t))] for (x, z), t in zip(pts, th)]
for a, b in zip(rings, rings[1:]):
    for i in range(4): bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
finish("pick_head", bm, M_IRON, swing, smooth=False)

# Hands grip the handle through IK; elbows are steered outward and back by pole targets.
grip_r = empty("grip_r", (0, 0, -GRIP_BACK), swing)
grip_l = empty("grip_l", (0, 0, -GRIP_FRONT), swing)
for side, grip in (("r", grip_r), ("l", grip_l)):
    y = -0.7 if side == "r" else 0.7
    pole = empty(f"pole_{side}", pivot_pt + Vector((-0.5, y, -0.4)))
    ik = rig.pose.bones[f"lowerarm_{side}"].constraints.new("IK")
    ik.target = grip; ik.pole_target = pole; ik.pole_angle = math.radians(-90); ik.chain_count = 2
# Curl the fingers round the handle.
for pb in rig.pose.bones:
    if any(pb.name.startswith(f) for f in ("index", "middle", "ring", "pinky")):
        pb.rotation_mode = "XYZ"; pb.rotation_euler = (math.radians(65), 0, 0)
    elif pb.name.startswith("thumb_02") or pb.name.startswith("thumb_03"):
        pb.rotation_mode = "XYZ"; pb.rotation_euler = (math.radians(35), 0, 0)
# A wider, slightly bent stance.
for side, s in (("l", 1), ("r", -1)):
    rig.pose.bones[f"thigh_{side}"].rotation_mode = "XYZ"
    rig.pose.bones[f"thigh_{side}"].rotation_euler = (math.radians(-6), 0, math.radians(4 * s))
    rig.pose.bones[f"calf_{side}"].rotation_mode = "XYZ"
    rig.pose.bones[f"calf_{side}"].rotation_euler = (math.radians(10), 0, 0)

# Rock where the pick tip lands at the strike angle.
STRIKE = -58
a = math.radians(STRIKE)
tip_local = Vector((-0.34, 0, -HANDLE_END + 0.1))
tip = pivot_pt + Vector((tip_local.x * math.cos(a) + tip_local.z * math.sin(a), 0, -tip_local.x * math.sin(a) + tip_local.z * math.cos(a)))
rock_c = Vector((tip.x + 0.24, 0, 0.18))
rock_top = tip.z + 0.03
rock("rock", 0.46, rock_c, M_STONE, 7, (1.0, 1.15, max(0.5, (rock_top - 0.18) / 0.46)))
rock("rock_small", 0.24, rock_c + Vector((0.3, 0.36, -0.1)), M_STONE2, 11, (1.1, 1, 0.7))
for i, (dx, dy, dz) in enumerate([(-0.22, -0.16, 0.0), (-0.1, 0.24, 0.04), (0.1, -0.27, -0.04), (-0.16, 0.04, 0.06), (0.2, 0.06, 0.0)]):
    nugget(f"ore_{i}", 0.06, (rock_c.x + dx, dy, rock_top - 0.06 + dz), M_ORE, 20 + i)
chips = []
random.seed(5)
for i in range(6):
    c = nugget(f"chip_{i}", 0.028, (0, 0, 0), M_ORE if i % 2 else M_STONE, 40 + i)
    chips.append((c, Vector((random.uniform(-0.6, 0.4), random.uniform(-0.7, 0.7), random.uniform(0.8, 1.4)))))

target.location = (pivot_pt.x + 0.5, 0, 0.95)

ANGLES = [-75, -110, -150, -185, -205, -210, -170, -110, STRIKE, STRIKE, -66, -72]
IMPACT = 8
for f, ang in enumerate(ANGLES):
    swing.rotation_euler = (0, math.radians(ang), 0)
    t = f - IMPACT
    for c, vel in chips:
        if 0 <= t <= 3:
            tt = (t + 0.5) * 0.09
            c.location = tip + vel * tt + Vector((0, 0, -4.9 * tt * tt)); c.hide_render = False
        else:
            c.hide_render = True
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT, f"frame_{f:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("frame", f, flush=True)
print("DONE anim")
