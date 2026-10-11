# Recipe: the v2 miner and the copper rock as a real 3D model (glTF binary) for live 3D in the browser.
# Builds the character from assets-src/sprite_miner_v2.py (everything above "# Copper rock"), adds a woodcutting
# axe beside the pick (the game shows one or the other), gives it a small skeleton (root, hips, head, arms, two hip
# joints) with each body part rigidly attached to a bone, keys four animations (Idle, Walk, Mine, Chop) and exports
# assets/models/miner.glb. The rock is a separate node named "Rock". Markers PickTip and AxeTip show where each
# tool lands. Timings and standing distances go to assets/models/miner.json.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/export_miner_glb.py
# Add "-- check" to also render the chop against a trunk (assets/renders/chop_check_*.png).
import bpy, bmesh, math, os, json, sys
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

src = open(os.path.join(os.getcwd(), "assets-src", "sprite_miner_v2.py"), encoding="utf-8").read()
exec(src[:src.index("# Copper rock")])          # helpers, materials and the character (hips, head, arms empties)

OUT = os.path.join(os.getcwd(), "assets", "models")
os.makedirs(OUT, exist_ok=True)
FPS = 100                                       # keys are placed in hundredths of a second
scene.render.fps = FPS
CHECK = "--" in sys.argv and "check" in sys.argv[sys.argv.index("--") + 1:]

# ---------- axe ----------
# Shares the pick's handle; the head is an iron eye round the handle end and a flared blade leading the swing
# (local -X, like the pick's tip). The blade lies in the swing plane with its edge at x = AXE_EDGE_X.
AXE_EDGE_X, AXE_EDGE_Z, AXE_EDGE_H = -0.22, -1.085, 0.24

def loft(name, sections, material):
    """A solid through cross-sections (x, z_top, z_bottom, half_thickness), capped at both ends."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for y, z in ((-t, zb), (t, zb), (t, zt), (-t, zt))] for x, zt, zb, t in sections]
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, material, arms)

loft("axe_head", [(0.075, -1.045, -1.135, 0.034), (-0.05, -1.045, -1.135, 0.03)], "iron")
loft("axe_blade", [(-0.05, -1.04, -1.14, 0.026), (-0.14, -1.0, -1.17, 0.016),
                   (AXE_EDGE_X, AXE_EDGE_Z + AXE_EDGE_H / 2, AXE_EDGE_Z - AXE_EDGE_H / 2, 0.006)], "iron_hi")

# ---------- skeleton ----------
bpy.context.view_layer.update()
pivots = {"hips": hips.matrix_world.translation.copy(), "head": head.matrix_world.translation.copy(),
          "arms": arms.matrix_world.translation.copy(),
          "hip_l": Vector((0, 0.11, 0.66)), "hip_r": Vector((0, -0.11, 0.66))}
parents = {"hips": "root", "head": "hips", "arms": "hips", "hip_l": "root", "hip_r": "root"}

arm_data = bpy.data.armatures.new("MinerRig")
rig = bpy.data.objects.new("Miner", arm_data); scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones.new("root"); eb.head = (0, 0, 0); eb.tail = (0, 0, 0.1)
for name in ("hips", "head", "arms", "hip_l", "hip_r"):
    b = arm_data.edit_bones.new(name)
    b.head = pivots[name]; b.tail = pivots[name] + Vector((0, 0, 0.1))
    b.parent = arm_data.edit_bones[parents[name]]
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()

# Re-attach every body part from its empty to the matching bone, keeping where it is.
owner = {"hips": "hips", "head": "head", "arms": "arms"}
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    if o.parent is not None:
        bone = owner.get(o.parent.name)
    elif o.name.startswith(("leg_l", "boot_l")):
        bone = "hip_l"
    elif o.name.startswith(("leg_r", "boot_r")):
        bone = "hip_r"
    else:
        bone = None
    if bone is None:
        continue
    mw = o.matrix_world.copy()
    o.parent = rig; o.parent_type = "BONE"; o.parent_bone = bone
    bpy.context.view_layer.update()
    o.matrix_world = mw

def marker(name, local):
    """An empty on the arms bone at a point given in the arms' own frame."""
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    w = arms.matrix_world @ Vector(local)
    e.parent = rig; e.parent_type = "BONE"; e.parent_bone = "arms"
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(w)
    return e

# The tool tips, so the game can spawn chips where the pick or the axe lands.
tip = marker("PickTip", (-0.36, 0, -1.02))
axe_tip = marker("AxeTip", (AXE_EDGE_X, 0, AXE_EDGE_Z))
# the blade edge's ends and the back of the axe head, only for measuring the chop (removed before export)
EDGE = [marker("_edge_top", (AXE_EDGE_X, 0, AXE_EDGE_Z + AXE_EDGE_H / 2)), axe_tip,
        marker("_edge_bot", (AXE_EDGE_X, 0, AXE_EDGE_Z - AXE_EDGE_H / 2))]
BACK = [marker("_axe_back", (0.075, 0, -1.09)), marker("_handle_end", (0, 0, -1.14))]

for e in (hips, head, arms):
    bpy.data.objects.remove(e)

# ---------- rock ----------
rock_root = bpy.data.objects.new("Rock", None); scene.collection.objects.link(rock_root)
parts = [blob("RockStone", 0.42, (0.0, 0, 0.2), "stone", 7, squash=(1.0, 1.1, 0.72)),
         blob("RockSmall", 0.22, (0.27, 0.33, 0.1), "stone_dark", 11, squash=(1.1, 1, 0.7))]
for i, (x, y, z) in enumerate([(-0.22, -0.15, 0.38), (-0.08, 0.22, 0.42), (0.12, -0.25, 0.33), (-0.16, 0.05, 0.47), (0.22, 0.05, 0.4)]):
    parts.append(blob(f"Ore{i}", 0.08, (x, y, z), "ore" if i % 2 else "ore_hi", 20 + i, subdiv=0, jitter=0.25))
for p in parts:
    p.parent = rock_root
rock_root.scale = (1.45, 1.45, 0.8)

# ---------- animations ----------
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "QUATERNION"

def turn(deg, roll=0.0, yaw=0.0):
    """Swing `deg` about the character's side axis (Y), then lean that swing's plane `roll` about the facing
    axis (X; positive lifts the arms towards the right shoulder), then turn it all `yaw` about the vertical (Z)."""
    return (Quaternion((0, 0, 1), math.radians(yaw)) @ Quaternion((1, 0, 0), math.radians(roll))
            @ Quaternion((0, 1, 0), math.radians(deg)))

LAST_Q = {}                                     # previous key per bone, for continuity

def pose(bone, deg=0.0, dz=0.0, roll=0.0, yaw=0.0):
    """Pose a bone with a rotation given in the character's frame (converted into the bone's own frame)."""
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    q = (rest.inverted() @ turn(deg, roll, yaw).to_matrix() @ rest).to_quaternion()
    # q and -q are the same rotation; keep the one nearest the last key, or Blender blends the long way round
    # (this made the wind-up swing forward through the front instead of up over the head)
    prev = LAST_Q.get(bone)
    if prev is not None and prev.dot(q) < 0:
        q.negate()
    LAST_Q[bone] = q.copy()
    pb[bone].rotation_quaternion = q
    pb[bone].location = rest.inverted() @ Vector((0, 0, dz))

def key(frame):
    for b in pb:
        b.keyframe_insert("rotation_quaternion", frame=frame)
        b.keyframe_insert("location", frame=frame)

def new_action(name):
    rig.animation_data_create(); rig.animation_data.action = None
    LAST_Q.clear()
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    return name

def finish_action(name):
    act = rig.animation_data.action
    act.name = name; act.use_fake_user = True
    rig.animation_data.action = None
    return act

CARRY = -32
meta = {"fps": FPS}

new_action("Idle")
for t, dz in ((0, 0.0), (100, 0.006), (200, 0.0)):
    pose("arms", CARRY + (1.5 if t == 100 else 0)); pose("hips", 0, dz); pose("head", 0)
    pose("hip_l", 0); pose("hip_r", 0); key(t)
finish_action("Idle")

new_action("Walk")
STEPS = 8
for f in range(STEPS + 1):
    ph = f / STEPS * 2 * math.pi
    swing = math.degrees(math.sin(ph) * math.radians(26))
    pose("hip_l", -swing); pose("hip_r", swing)
    pose("hips", 4, 0.025 * abs(math.cos(ph))); pose("arms", CARRY + 6 * math.sin(ph)); pose("head", -2)
    key(f * 10)
finish_action("Walk")
meta["walk_cycle_s"] = STEPS * 10 / FPS

# The strike stops where the pick tip meets the rock's surface. The game stands the miner REACH metres
# from the rock centre, so measure with the rock placed there, tip leaning in at the impact pose.
ROCK_OFF = Vector((0, 0, 0))                    # where the rock is imagined to stand; the rock itself never moves
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
trees = [(o, BVHTree.FromObject(o, deps)) for o in parts if o.name.startswith("Rock")]
def rock_top(x, y):
    best = None
    for o, tree in trees:
        inv = (Matrix.Translation(ROCK_OFF) @ o.matrix_world).inverted()
        hit = tree.ray_cast(inv @ Vector((x, y, 5.0)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())[0]
        if hit is not None:
            z = (Matrix.Translation(ROCK_OFF) @ o.matrix_world @ hit).z
            best = z if best is None else max(best, z)
    return best if best is not None else 0.0
def tip_at(ang):
    rig.animation_data_create(); rig.animation_data.action = None
    pose("arms", ang); pose("hips", LEAN[IMPACT]); pose("head", 0); pose("hip_l", 0); pose("hip_r", 0)
    bpy.context.view_layer.update()
    return tip.matrix_world.translation.copy()
def strike_for(reach):
    """Arm angle at which the pick tip first touches the rock, with the rock centre `reach` m in front."""
    ROCK_OFF.x = reach
    lo, hi = -120.0, -40.0                      # lo: pick still above the rock, hi: well into it
    for _ in range(30):
        mid = (lo + hi) / 2
        p = tip_at(mid)
        if p.z > rock_top(p.x, p.y) + 0.01: lo = mid
        else: hi = mid
    return lo
# Find a standing distance where the pick comes down into a proper chop (-72 to -55 degrees) on the rock.
# The tip slides down the rock's front slope almost parallel to it, so only a narrow band of distances works.
REACH, best = 1.08, None
for i in range(25):
    r = round(1.08 - 0.015 * i, 3)
    a = strike_for(r)
    if -72 <= a <= -55 and (best is None or abs(a + 62) < abs(best[1] + 62)):
        best = (r, a)
if best: REACH = best[0]
STRIKE = round(strike_for(REACH), 1)
meta["reach_m"] = round(REACH, 3)
ANGLES = list(ANGLES)
ANGLES[0] = STRIKE - 12
ANGLES[IMPACT] = ANGLES[IMPACT + 1] = STRIKE
ANGLES[IMPACT + 2] = STRIKE - 5
ANGLES[IMPACT + 3] = STRIKE - 9
meta["strike_deg"] = STRIKE

new_action("Mine")
MINE_MS = [95, 95, 95, 95, 95, 190, 70, 55, 55, 150, 95, 95]
t = 0
for f, (ang, lean) in enumerate(zip(ANGLES, LEAN)):
    pose("arms", ang); pose("hips", lean)
    pose("head", -lean * 0.5 + (6 if f in (IMPACT, IMPACT + 1) else 0)); pose("hip_l", 0); pose("hip_r", 0)
    key(round(t / 10))
    if f == IMPACT:
        meta["mine_impact_s"] = t / 1000
    t += MINE_MS[f]
pose("arms", ANGLES[0]); pose("hips", LEAN[0]); pose("head", -LEAN[0] * 0.5); key(round(t / 10))   # loops cleanly
finish_action("Mine")
meta["mine_cycle_s"] = t / 1000

# ---------- chop ----------
# A diagonal chop: the swing's plane leans CHOP_ROLL degrees so the axe comes down from above the right shoulder,
# and is turned CHOP_AIM degrees so the blade crosses the line straight ahead at waist height. The trunk is thin,
# so the blade passes beside it until that crossing. The game stands the woodcutter CHOP_REACH from a trunk of
# radius TRUNK_R, and further back from thicker trunks (the game adds the extra radius).
TRUNK_R = 0.115            # birch trunk radius at chopping height (TreeBirch in village_models.py, size 1)
CHOP_ROLL = 48.0
CHOP_HEIGHT = 0.8         # where the blade bites, metres above the ground
CH_LEAN = [6, 2, -2, -5, -7, -7, -2, 13, 13, 13, 10, 8]
CH_TWIST = [0, -5, -10, -15, -17, -17, -10, 4, 4, 4, 3, 1]      # torso turns right on the wind-up, left into the chop
CH_MS = [90, 90, 90, 90, 90, 170, 65, 50, 50, 140, 90, 90]
CH_IMPACT = 8

def chop_pose(ang, f, aim):
    pose("arms", ang, roll=CHOP_ROLL, yaw=aim)
    pose("hips", CH_LEAN[f], yaw=CH_TWIST[f])
    pose("head", -CH_LEAN[f] * 0.5, yaw=-CH_TWIST[f] * 0.7)    # keep looking at the tree
    pose("hip_l", 0); pose("hip_r", 0)

def edge_at(ang, aim):
    rig.animation_data_create(); rig.animation_data.action = None
    chop_pose(ang, CH_IMPACT, aim)
    bpy.context.view_layer.update()
    return [e.matrix_world.translation.copy() for e in EDGE]

def crossing(aim):
    """(angle, height, forward) where the blade's middle crosses the line straight ahead, moving right to left."""
    prev = None
    for a in range(-200, -10, 2):
        y = edge_at(a, aim)[1].y
        if prev is not None and prev < 0 <= y:
            lo, hi = a - 2.0, float(a)
            for _ in range(18):
                mid = (lo + hi) / 2
                if edge_at(mid, aim)[1].y < 0: lo = mid
                else: hi = mid
            p = edge_at(hi, aim)[1]
            return hi, p.z, p.x
        prev = y
    return None

lo, hi = -45.0, 25.0       # turning the swing further right brings the crossing lower
for _ in range(22):
    mid = (lo + hi) / 2
    c = crossing(mid)
    if c is None or c[1] < CHOP_HEIGHT: lo = mid
    else: hi = mid
CHOP_AIM = round((lo + hi) / 2, 2)
c_ang, c_h, c_x = crossing(CHOP_AIM)
CHOP_REACH = round(c_x + TRUNK_R * 0.5, 3)       # trunk just beyond the crossing: the blade bites its front-right

def inside(points, reach=None):
    """How deep the deepest point is inside the trunk (metres; 0 or less means clear)."""
    reach = CHOP_REACH if reach is None else reach
    return max(TRUNK_R - math.hypot(p.x - reach, p.y) for p in points)

a = -200.0
while a < c_ang + 30 and inside(edge_at(a, CHOP_AIM)) <= 0: a += 1
lo, hi = a - 1, a
for _ in range(20):
    mid = (lo + hi) / 2
    if inside(edge_at(mid, CHOP_AIM)) <= 0: lo = mid
    else: hi = mid
CHOP_STRIKE = round(lo, 1)
bite = edge_at(CHOP_STRIKE, CHOP_AIM)[1]
print(f"CHOP aim {CHOP_AIM} crossing {c_ang:.1f} deg at {c_h:.2f} m, reach {CHOP_REACH}, strike {CHOP_STRIKE} deg "
      f"at height {bite.z:.2f} side {bite.y:.3f}", flush=True)

S = CHOP_STRIKE
CH_ANG = [S - 14, -128, -152, -172, -186, -190, -162, -122, S, S, S - 7, S - 11]
new_action("Chop")
t = 0
for f, ang in enumerate(CH_ANG):
    chop_pose(ang, f, CHOP_AIM); key(round(t / 10))
    if f == CH_IMPACT:
        meta["chop_impact_s"] = t / 1000
    t += CH_MS[f]
chop_pose(CH_ANG[0], 0, CHOP_AIM); key(round(t / 10))         # loops cleanly
CHOP_END = round(t / 10)
chop = finish_action("Chop")
meta["chop_cycle_s"] = t / 1000
meta["chop_reach_m"] = CHOP_REACH
meta["chop_trunk_m"] = TRUNK_R
meta["chop_strike_deg"] = CHOP_STRIKE

# Strikes should snap, not ease: linear keys for both swings.
for act in bpy.data.actions:
    if act.name in ("Mine", "Chop"):
        for layer in getattr(act, "layers", []):
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        for fc in getattr(act, "fcurves", []):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"

# The blade, the back of the axe head and the handle end must stay out of the trunk all the way round the loop,
# except for the bite itself (the impact keys and the moment the blade stays in).
rig.animation_data.action = chop
impact_f = round(meta["chop_impact_s"] * FPS)
worst = (0.0, None)
for fr in range(0, CHOP_END + 1):
    if impact_f - 1 <= fr <= impact_f + 6: continue
    scene.frame_set(fr)
    depth = inside([e.matrix_world.translation for e in EDGE + BACK])
    if depth > worst[0]: worst = (depth, fr)
print(f"CHOP deepest outside the bite: {worst[0] * 100:.1f} cm at frame {worst[1]}", flush=True)
rig.animation_data.action = None

for e in EDGE + BACK:
    if e is not axe_tip: bpy.data.objects.remove(e)

# ---------- export ----------
for o in bpy.data.objects:
    o.select_set(False)
path = os.path.join(OUT, "miner.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_frame_range=False, export_lights=False, export_cameras=False)
json.dump(meta, open(os.path.join(OUT, "miner.json"), "w"), indent=1)
print("DONE", path, os.path.getsize(path), meta)

# ---------- check renders: the chop against a birch-sized trunk, from three sides ----------
if CHECK:
    for name in ("pick_head", "pick_collar"): bpy.data.objects[name].hide_render = True
    for o in [rock_root, *rock_root.children]: o.hide_render = True
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.13, radius2=0.09, depth=2.3)
    bmesh.ops.translate(bm, vec=(CHOP_REACH, 0, 1.15), verts=bm.verts)
    PAL["birch_bark"] = "#e8e2d6"; obj_from_bm("trunk", bm, "birch_bark")
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(-40))
    world = bpy.data.worlds.new("w"); world.use_nodes = True; scene.world = world
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.72, 0.9, 1)
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = 360
    scene.view_settings.view_transform = "Standard"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.9
    look = Vector((0.6, 0, 1.0))
    rig.animation_data.action = chop
    renders = os.path.join(os.getcwd(), "assets", "renders"); os.makedirs(renders, exist_ok=True)
    frames = {"1top": round(sum(CH_MS[:5]) / 10), "2swing": round(sum(CH_MS[:7]) / 10), "3bite": impact_f,
              "4back": round(sum(CH_MS[:11]) / 10)}
    for view, d in (("side", Vector((0, -1, 0.08))), ("behind", Vector((-0.75, -0.55, 0.35))), ("front", Vector((1, -0.35, 0.15)))):
        cam.location = look + d.normalized() * 8
        cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
        for label, fr in frames.items():
            scene.frame_set(fr)
            scene.render.filepath = os.path.join(renders, f"chop_check_{view}_{label}.png")
            bpy.ops.render.render(write_still=True)
    print("CHECK renders in", renders)
