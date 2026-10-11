# Recipe: the v2 miner and the copper rock as a real 3D model (glTF binary) for live 3D in the browser.
# Builds the character from assets-src/sprite_miner_v2.py (everything above "# Copper rock"), gives it a small
# skeleton (root, hips, head, arms, two hip joints) with each body part rigidly attached to a bone, keys three
# animations (Idle, Walk, Mine) and exports assets/models/miner.glb. The rock is a separate node named "Rock".
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/export_miner_glb.py
import bpy, math, os, json
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

src = open(os.path.join(os.getcwd(), "assets-src", "sprite_miner_v2.py"), encoding="utf-8").read()
exec(src[:src.index("# Copper rock")])          # helpers, materials and the character (hips, head, arms empties)

OUT = os.path.join(os.getcwd(), "assets", "models")
os.makedirs(OUT, exist_ok=True)
FPS = 100                                       # keys are placed in hundredths of a second
scene.render.fps = FPS

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

# The pick tip, as an empty on the arms bone, so the game can spawn chips where the pick lands.
tip = bpy.data.objects.new("PickTip", None); scene.collection.objects.link(tip)
tip_world = arms.matrix_world @ Vector((-0.36, 0, -1.02))
tip.parent = rig; tip.parent_type = "BONE"; tip.parent_bone = "arms"
bpy.context.view_layer.update()
tip.matrix_world = Matrix.Translation(tip_world)

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

def rot_y(deg):
    """A rotation about the character's side axis (Y) expressed in each bone's own frame."""
    return Quaternion((0, 1, 0), math.radians(deg))

LAST_Q = {}                                     # previous key per bone, for continuity

def pose(bone, deg=0.0, dz=0.0):
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    q = (rest.inverted() @ rot_y(deg).to_matrix() @ rest).to_quaternion()
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
# Stand back until the pick comes down into a proper chop (about -65 degrees) before it meets the rock.
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

# Strikes should snap, not ease: linear keys for the mining swing.
for act in bpy.data.actions:
    if act.name == "Mine":
        for layer in getattr(act, "layers", []):
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        for fc in getattr(act, "fcurves", []):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"

# ---------- export ----------
for o in bpy.data.objects:
    o.select_set(False)
path = os.path.join(OUT, "miner.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_frame_range=False, export_lights=False, export_cameras=False)
json.dump(meta, open(os.path.join(OUT, "miner.json"), "w"), indent=1)
print("DONE", path, os.path.getsize(path), meta)
