# Recipe: the v2 miner and the copper rock as a real 3D model (glTF binary) for live 3D in the browser.
# Builds the character from assets-src/sprite_miner_v2.py (everything above "# Copper rock"), adds a woodcutting
# axe beside the pick (the game shows one or the other), gives it a small skeleton (root, hips, head, tool, two hip
# joints, and per arm an upper arm and a forearm) with each body part rigidly attached to a bone, keys five
# animations (Idle, Walk, Run, Mine, Chop) and exports assets/models/miner.glb. The rock is a separate node named "Rock".
# Markers PickTip and AxeTip show where each tool lands. Timings and standing distances go to assets/models/miner.json.
# Arms: the tool swings on its own bone ("tool"). Each hand holds a fixed point on the handle, and a two-bone IK
# (solved here in Python, elbows pointing out and down) bends the elbows to reach it, baked into a key per frame on
# upper_l/r and fore_l/r. On the wind-up the hands draw the tool in along its handle (PULL) and forward (LEAD), and
# both swings lean over the right shoulder, so the elbows bend at the top and straighten into the strike; all of
# this is zero at the impact keys, so the measured strikes and miner.json are unchanged. The "ARMS" lines printed
# per clip check the hands stay on the handle, the arms and tool stay out of the head and torso, and how much of the
# face they hide. The game blends clips, so markers GripL/R, HandL/R and PoleL/R let it re-solve the same IK on the
# blended pose (src/render/arms.ts); the "BLEND" lines check that keeps the hands on the handle in every crossfade.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/export_miner_glb.py
# Add "-- check" to also render a contact sheet of Mine, Chop, Idle, Walk and Run from the side, a three-quarter front and
# the front at the game camera's pitch (assets/renders/rig_check_sheet.png).
import bpy, bmesh, math, os, json, sys, struct
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

src = open(os.path.join(os.getcwd(), "assets-src", "sprite_miner_v2.py"), encoding="utf-8").read()
exec(src[:src.index("# Copper rock")])          # helpers, materials and the character (hips, head, arms empties)

OUT = os.path.join(os.getcwd(), "assets", "models")
os.makedirs(OUT, exist_ok=True)
FPS = 100                                       # keys are placed in hundredths of a second
scene.render.fps = FPS
CHECK = "--" in sys.argv and "check" in sys.argv[sys.argv.index("--") + 1:]

# The arm bones are named upper_l/r and fore_l/r; rename the meshes that share those names so every glTF node
# name stays unique.
for side in "lr":
    for old, new in (("upper", "upperarm"), ("fore", "forearm")):
        o = bpy.data.objects[f"{old}_{side}"]
        o.name = o.data.name = f"{new}_{side}"

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
# Shoulder, elbow and hand centre of each arm, in the arms empty's frame (the arm meshes in sprite_miner_v2.py).
ARM_JOINTS = ((0, 0.27, 0), (0, 0.229, -0.275), (0, 0.135, -0.55))
JOINT = {s: [arms.matrix_world @ Vector((x, y * m, z)) for x, y, z in ARM_JOINTS] for s, m in (("l", 1), ("r", -1))}
PIVOT = arms.matrix_world.translation.copy()    # the tool's swing pivot, middle of the shoulder line
pivots = {"hips": hips.matrix_world.translation.copy(), "head": head.matrix_world.translation.copy(),
          "tool": PIVOT, "hip_l": Vector((0, 0.11, 0.66)), "hip_r": Vector((0, -0.11, 0.66))}
parents = {"hips": "root", "head": "hips", "tool": "hips", "hip_l": "root", "hip_r": "root"}

arm_data = bpy.data.armatures.new("MinerRig")
rig = bpy.data.objects.new("Miner", arm_data); scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones.new("root"); eb.head = (0, 0, 0); eb.tail = (0, 0, 0.1)
for name in ("hips", "head", "tool", "hip_l", "hip_r"):
    b = arm_data.edit_bones.new(name)
    b.head = pivots[name]; b.tail = pivots[name] + Vector((0, 0, 0.1))
    b.parent = arm_data.edit_bones[parents[name]]
for s in "lr":                                  # upper arm: shoulder to elbow; forearm: elbow to hand centre
    up = arm_data.edit_bones.new(f"upper_{s}"); up.head, up.tail = JOINT[s][0], JOINT[s][1]
    up.parent = arm_data.edit_bones["hips"]
    fo = arm_data.edit_bones.new(f"fore_{s}"); fo.head, fo.tail = JOINT[s][1], JOINT[s][2]
    fo.parent = up
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()
BODY = ("root", "hips", "head", "tool", "hip_l", "hip_r")      # keyed per pose; the arm bones are baked by IK
ARM_BONES = ("upper_l", "fore_l", "upper_r", "fore_r")

# Re-attach every body part from its empty to the matching bone, keeping where it is. The tool's parts stay on the
# tool bone; the arm parts go to their arm's upper arm or forearm.
owner = {"hips": "hips", "head": "head"}
ARM_PART = {"shoulder": "upper", "upperarm": "upper", "cuff": "upper", "forearm": "fore", "hand": "fore", "thumb": "fore"}
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    if o.parent is not None and o.parent.name == "arms":
        part, _, side = o.name.rpartition("_")
        bone = f"{ARM_PART[part]}_{side}" if part in ARM_PART else "tool"
    elif o.parent is not None:
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
    """An empty on the tool bone at a point given in the arms' own frame."""
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    w = arms.matrix_world @ Vector(local)
    e.parent = rig; e.parent_type = "BONE"; e.parent_bone = "tool"
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

# Where each hand holds the handle and where its elbow points (used by the arm IK below, and exported so the game can
# re-solve the same IK after it blends two clips; see "arms: crossfades"). The left (bottom) hand holds the handle's
# end, so it still reaches at the chop's impact, where the leaned swing takes the grip far to the right; the right
# hand holds where the arm is straight at the mining impact. Each elbow bends toward a pole beside, below and a little
# in front of its shoulder, in the torso's frame, so it points out and down.
GRIP = {"l": 0.42, "r": 0.50}                   # metres from the pivot along the handle (it starts at 0.42)
POLE = {"l": Vector((0.3, 0.5, -0.6)), "r": Vector((0.3, -0.5, -0.6))}

def bone_marker(name, bone, w):
    """An empty on a bone at the armature-space point w (the rig is still in its rest pose here)."""
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    e.parent = rig; e.parent_type = "BONE"; e.parent_bone = bone
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(w)
    return e

for s, S_ in (("l", "L"), ("r", "R")):
    bone_marker(f"Grip{S_}", "tool", PIVOT - Vector((0, 0, GRIP[s])))     # the grip on the handle
    bone_marker(f"Hand{S_}", f"fore_{s}", JOINT[s][2])                    # the hand centre, the forearm's end
    bone_marker(f"Pole{S_}", "hips", JOINT[s][0] + POLE[s])               # shoulder + pole direction

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

def pose(bone, deg=0.0, dz=0.0, roll=0.0, yaw=0.0, pull=0.0, lead=0.0):
    """Pose a bone with a rotation given in the character's frame (converted into the bone's own frame).
    For the tool, `pull` slides it along its handle toward the shoulders (its rotated +Z) and `lead` moves it
    toward the side that leads the swing (its rotated -X, where the pick tip and the axe edge point)."""
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    rot = turn(deg, roll, yaw)
    q = (rest.inverted() @ rot.to_matrix() @ rest).to_quaternion()
    # q and -q are the same rotation; keep the one nearest the last key, or Blender blends the long way round
    # (this made the wind-up swing forward through the front instead of up over the head)
    prev = LAST_Q.get(bone)
    if prev is not None and prev.dot(q) < 0:
        q.negate()
    LAST_Q[bone] = q.copy()
    pb[bone].rotation_quaternion = q
    pb[bone].location = rest.inverted() @ (Vector((0, 0, dz)) + rot @ Vector((-lead, 0, pull)))

def key(frame):
    for n in BODY:
        pb[n].keyframe_insert("rotation_quaternion", frame=frame)
        pb[n].keyframe_insert("location", frame=frame)

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
# Where the hands take the tool, per key, in metres (none at the impact keys, so the strikes are unchanged).
# PULL slides it along its handle toward the shoulders, so the elbows bend on the wind-up and straighten into the
# strike. LEAD moves it toward the side leading the swing (its -X): with arms this short a pure pull would put the
# hands inside the head at the top. Raised straight up, the hands would end up in front of the face (from the front
# they hid it for half the swing), so the mining wind-up leans its swing plane over the right shoulder (MINE_ROLL
# degrees, like the chop's CHOP_ROLL) and turns the torso right (MINE_TWIST degrees, the head turning back to keep
# looking at the rock): the pick goes up over the right shoulder with the hands beside the right cheek and the left
# forearm across below the chin, then comes down square onto the rock. Roll and twist are zero from the strike key
# on, so the impact and miner.json are unchanged. Tuned so the hands, arms and tool stay clear of the head and torso
# with both hands in reach, and the face stays in view; the "ARMS" lines printed below check every frame.
CARRY_PULL, CARRY_LEAD = 0.08, -0.08      # carried, the pick's tip points back: a negative lead holds it forward
MINE_PULL = [0.04, 0.09, 0.2, 0.3, 0.4, 0.4, 0.27, 0.03, 0, 0, 0.01, 0.03]
MINE_LEAD = [0, 0.02, 0.14, 0.26, 0.32, 0.32, 0.26, 0, 0, 0, 0, 0]
MINE_ROLL = [0, 20, 42, 48, 50, 50, 45, 0, 0, 0, 0, 0]
MINE_TWIST = [0, -5, -10, -13, -15, -15, -11, 0, 0, 0, 0, 0]
CHOP_PULL = [0.05, 0.105, 0.18, 0.265, 0.315, 0.335, 0.22, 0.07, 0, 0, 0.02, 0.035]
CHOP_LEAD = [0.025, 0.075, 0.16, 0.2, 0.24, 0.24, 0.185, 0.07, 0, 0, 0.02, 0.025]
meta = {"fps": FPS}

new_action("Idle")
for t, dz in ((0, 0.0), (100, 0.006), (200, 0.0)):
    pose("tool", CARRY + (1.5 if t == 100 else 0), pull=CARRY_PULL + (0.01 if t == 100 else 0), lead=CARRY_LEAD)
    pose("hips", 0, dz); pose("head", 0)
    pose("hip_l", 0); pose("hip_r", 0); key(t)
idle = finish_action("Idle")

new_action("Walk")
STEPS = 8
for f in range(STEPS + 1):
    ph = f / STEPS * 2 * math.pi
    swing = math.degrees(math.sin(ph) * math.radians(26))
    pose("hip_l", -swing); pose("hip_r", swing)
    pose("hips", 4, 0.025 * abs(math.cos(ph)))
    pose("tool", CARRY + 6 * math.sin(ph), pull=CARRY_PULL + 0.012 * (0.5 - abs(math.cos(ph))), lead=CARRY_LEAD)  # lags the bob
    pose("head", -2)
    key(f * 10)
walk = finish_action("Walk")
meta["walk_cycle_s"] = STEPS * 10 / FPS

# Run: how the character gets about in the game (the owner asked for twice the walking speed, 11 Oct). A longer
# stride than the walk, the torso leaning in, its shoulders turning against the hips, the tool bobbing in the hands.
# The whole body (root) dips while the legs are spread, so the straight legs don't lift the feet far off the ground.
# A leg turning SWING degrees about its hip moves the foot LEG * sin(SWING), so one cycle (two steps) covers
# 4 * LEG * sin(RUN_SWING); the game plays the clip faster or slower from run_speed_m_s so the feet don't slide.
new_action("Run")
RUN_STEPS, RUN_SWING, RUN_KEY = 8, 36, 7        # keys per cycle, leg swing (degrees), hundredths of a second per key
LEG = 0.66                                      # hip joint height
for f in range(RUN_STEPS + 1):
    ph = f / RUN_STEPS * 2 * math.pi
    swing = RUN_SWING * math.sin(ph)
    pose("hip_l", -swing); pose("hip_r", swing)
    pose("root", 0, -0.045 * math.sin(ph) ** 2)
    pose("hips", 9, 0.012 * math.cos(2 * ph), yaw=4 * math.sin(ph))       # the right shoulder forward with the left leg
    pose("tool", CARRY + 7 * math.sin(ph), pull=CARRY_PULL + 0.015 * math.cos(2 * ph), lead=CARRY_LEAD)
    pose("head", -8, yaw=-4 * math.sin(ph))     # looking ahead, steady while the shoulders turn
    key(f * RUN_KEY)
run = finish_action("Run")
meta["run_cycle_s"] = RUN_STEPS * RUN_KEY / FPS
meta["run_speed_m_s"] = round(4 * LEG * math.sin(math.radians(RUN_SWING)) / meta["run_cycle_s"], 3)

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
    pose("tool", ang); pose("hips", LEAN[IMPACT]); pose("head", 0); pose("hip_l", 0); pose("hip_r", 0)
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
    pose("tool", ang, roll=MINE_ROLL[f], pull=MINE_PULL[f], lead=MINE_LEAD[f]); pose("hips", lean, yaw=MINE_TWIST[f])
    pose("head", -lean * 0.5 + (6 if f in (IMPACT, IMPACT + 1) else 0), yaw=-MINE_TWIST[f] * 0.7); pose("hip_l", 0); pose("hip_r", 0)
    key(round(t / 10))
    if f == IMPACT:
        meta["mine_impact_s"] = t / 1000
    t += MINE_MS[f]
pose("tool", ANGLES[0], roll=MINE_ROLL[0], pull=MINE_PULL[0], lead=MINE_LEAD[0]); pose("hips", LEAN[0], yaw=MINE_TWIST[0])
pose("head", -LEAN[0] * 0.5, yaw=-MINE_TWIST[0] * 0.7); key(round(t / 10))   # loops cleanly
mine = finish_action("Mine")
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

def chop_pose(ang, f, aim, pull=0.0, lead=0.0):
    pose("tool", ang, roll=CHOP_ROLL, yaw=aim, pull=pull, lead=lead)
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
    chop_pose(ang, f, CHOP_AIM, pull=CHOP_PULL[f], lead=CHOP_LEAD[f]); key(round(t / 10))
    if f == CH_IMPACT:
        meta["chop_impact_s"] = t / 1000
    t += CH_MS[f]
chop_pose(CH_ANG[0], 0, CHOP_AIM, pull=CHOP_PULL[0], lead=CHOP_LEAD[0]); key(round(t / 10))         # loops cleanly
CHOP_END = round(t / 10)
chop = finish_action("Chop")
meta["chop_cycle_s"] = t / 1000
meta["chop_reach_m"] = CHOP_REACH
meta["chop_trunk_m"] = TRUNK_R
meta["chop_strike_deg"] = CHOP_STRIKE

def fcurves(act):
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves
    yield from getattr(act, "fcurves", [])

# Strikes should snap, not ease: linear keys for both swings.
for act in (mine, chop):
    for fc in fcurves(act):
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

# ---------- arms: two-bone IK onto the handle, baked ----------
# Each hand centre holds a fixed point on the handle's axis (the tool's local -Z through the pivot, GRIP above), and
# the elbow bends toward its POLE. Solved analytically for every frame and keyed (rotation only) on the arm bones.
bones = rig.data.bones

def frame3(axis, hinge):
    """Orthonormal frame (columns): along the bone, across it in the bend plane, the hinge axis."""
    return Matrix((axis, hinge.cross(axis), hinge)).transposed()

REST_F, ARM_LEN = {}, {}
for s in "lr":
    S0, E0, T0 = JOINT[s]
    u = (T0 - S0).normalized(); w = (E0 - S0) - (E0 - S0).dot(u) * u; w.normalize()
    REST_F[s] = (frame3((E0 - S0).normalized(), u.cross(w)), frame3((T0 - E0).normalized(), u.cross(w)))
    ARM_LEN[s] = ((E0 - S0).length, (T0 - E0).length)

def solve_arm(s, H, G):
    """Two-bone IK. H maps rest armature space to posed for anything on the hips (shoulder, pole); G is the grip
    point. Returns the posed armature-space matrices of the upper arm and forearm and the hand centre reached."""
    S0 = JOINT[s][0]
    a, b = ARM_LEN[s]
    S = H @ S0
    v = G - S; u = v.normalized()
    d = min(max(v.length, abs(a - b) + 1e-4), a + b - 1e-6)
    x = (a * a - b * b + d * d) / (2 * d); h = math.sqrt(max(a * a - x * x, 0.0))
    p = H.to_3x3() @ POLE[s]
    w = (p - p.dot(u) * u).normalized()
    E = S + u * x + w * h; T = S + u * d
    n = u.cross(w)
    Ru = frame3((E - S).normalized(), n) @ REST_F[s][0].transposed()
    Rf = frame3((T - E).normalized(), n) @ REST_F[s][1].transposed()
    Mu = Matrix.Translation(S) @ (Ru @ bones[f"upper_{s}"].matrix_local.to_3x3()).to_4x4()
    Mf = Matrix.Translation(E) @ (Rf @ bones[f"fore_{s}"].matrix_local.to_3x3()).to_4x4()
    return Mu, Mf, T

def frames_of(act):
    f0, f1 = act.frame_range
    return range(int(round(f0)), int(round(f1)) + 1)

def bake_arms(act):
    rig.animation_data.action = act
    last = {}
    rest = {n: bones[n].matrix_local for n in ("hips", "tool") + ARM_BONES}
    for fr in frames_of(act):
        scene.frame_set(fr)
        hips_m = pb["hips"].matrix.copy()
        H = hips_m @ rest["hips"].inverted()
        Tm = pb["tool"].matrix @ rest["tool"].inverted()
        for s in "lr":
            Mu, Mf, _ = solve_arm(s, H, Tm @ (PIVOT - Vector((0, 0, GRIP[s]))))
            up, fo = f"upper_{s}", f"fore_{s}"
            local = {up: rest[up].inverted() @ rest["hips"] @ hips_m.inverted() @ Mu,
                     fo: rest[fo].inverted() @ rest[up] @ Mu.inverted() @ Mf}
            for name, m in local.items():
                q = m.to_quaternion()
                if name in last and last[name].dot(q) < 0:
                    q.negate()                  # continuity, as for the swing keys
                last[name] = q
                pb[name].rotation_quaternion = q
                pb[name].keyframe_insert("rotation_quaternion", frame=fr)
    for fc in fcurves(act):
        if any(f'"{n}"' in fc.data_path for n in ARM_BONES):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
    rig.animation_data.action = None

for act in (idle, walk, run, mine, chop):
    bake_arms(act)

# ---------- arms: verify ----------
# Per clip: the largest gap between each hand centre and its grip, the elbow bend range, how deep any arm part
# (hand, thumb, forearm, cuff, upper arm) and the tool shown get into the head or torso (their convex hulls), the
# largest per-frame turn of an arm bone (a pop would show here), and how much of the face the arms and tool hide.
import numpy as np
HAND_C = {"l": Vector((0, 0.135, -0.55)), "r": Vector((0, -0.135, -0.55))}   # hand centres in the arms frame
handle = bpy.data.objects["pick_handle"]

def hull(name):
    """A body mesh's convex hull as outward planes in its own frame: inside where N.p < D."""
    bm = bmesh.new()
    for v in bpy.data.objects[name].data.vertices: bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bm.normal_update()
    c = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    N, D = [], []
    for f in bm.faces:
        n = f.normal.copy() if f.normal.dot(f.verts[0].co - c) > 0 else -f.normal
        N.append(n); D.append(n.dot(f.verts[0].co))
    bm.free()
    return bpy.data.objects[name], np.array(N), np.array(D)

BODY_HULLS = {"head": [hull("face"), hull("hair")], "torso": [hull("torso")]}
def part_pts(name, keep=lambda p: True):
    """(object, points in its mesh frame, which points count against the torso)."""
    o = bpy.data.objects[name]
    pts = np.array([v.co for v in o.data.vertices])
    return o, pts, np.array([keep(o.matrix_world @ Vector(p)) for p in pts])

# the top of the upper arm sits on the torso by design: leave it out of the torso test
ARM_PTS = [part_pts(f"{part}_{s}", (lambda p, s=s: (p - JOINT[s][0]).length > 0.12) if part == "upperarm" else (lambda p: True))
           for s in "lr" for part in ("upperarm", "cuff", "forearm", "hand", "thumb")]
PICK_PTS = [part_pts(n) for n in ("pick_handle", "pick_collar", "pick_head")]
AXE_PTS = [part_pts(n) for n in ("axe_head", "axe_blade")]
TOOL_PTS = {"Idle": PICK_PTS + AXE_PTS, "Walk": PICK_PTS + AXE_PTS, "Run": PICK_PTS + AXE_PTS, "Mine": PICK_PTS, "Chop": PICK_PTS[:1] + AXE_PTS}

def depth(kind, parts=ARM_PTS):
    """(deepest point of any of the parts inside the body kind in metres, negative if clear; the part)."""
    best = (-1.0, None)
    for body, N, D in BODY_HULLS[kind]:
        inv = body.matrix_world.inverted()
        for o, pts, mask in parts:
            if kind == "torso": pts = pts[mask]
            m = np.array(inv @ o.matrix_world)
            p = pts @ m[:3, :3].T + m[:3, 3]
            d = (D - p @ N.T).min(axis=1).max()
            if d > best[0]: best = (float(d), o.name)
    return best

# How much of the face (skin, nose, eyes and brows; the hair and ears may hide it, and don't count) the arms and the
# tool hide, from the front and from the game's camera (38 degrees up, src/render/camera.ts) straight on and turned
# 45 degrees either way: a grid of parallel rays cast at the head, counting the face hits that something is in front of.
HEAD_OBJS = [o for o in bpy.data.objects if o.type == "MESH" and o.parent_bone == "head"]
FACE_OBJS = {o.name for o in HEAD_OBJS if o.name.startswith(("face", "nose", "eye", "brow"))}
ARM_OBJS = [o for o in bpy.data.objects if o.type == "MESH" and o.parent_bone in ARM_BONES]
FACE_VIEWS = {"front": (0, 0), "game": (38, 0), "game 45 left": (38, 45), "game 45 right": (38, -45)}

def world_bvh(objs):
    verts, polys, owner = [], [], []
    for o in objs:
        m, base = o.matrix_world, len(verts)
        verts += [m @ v.co for v in o.data.vertices]
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices]); owner.append(o.name)
    return BVHTree.FromPolygons(verts, polys), owner, verts

def face_hidden(occluders, n=22):
    """(largest share of the face hidden over FACE_VIEWS, that view)."""
    head_t, owner, hv = world_bvh(HEAD_OBJS)
    occ_t = world_bvh(occluders)[0]
    face_v = [v for o in HEAD_OBJS if o.name in FACE_OBJS for v in (o.matrix_world @ w.co for w in o.data.vertices)]
    mid = sum(face_v, Vector()) / len(face_v)
    worst = (0.0, None)
    for view, (pitch, yaw) in FACE_VIEWS.items():
        p, y = math.radians(pitch), math.radians(yaw)
        eye = Vector((math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p)))
        d = -eye; r = d.cross(Vector((0, 0, 1))).normalized(); up = r.cross(d)
        us = [(v - mid).dot(r) for v in face_v]; vs = [(v - mid).dot(up) for v in face_v]
        seen = hid = 0
        for i in range(n):
            for j in range(n):
                o = mid + eye * 2 + r * (min(us) + (max(us) - min(us)) * (i + 0.5) / n) + up * (min(vs) + (max(vs) - min(vs)) * (j + 0.5) / n)
                hit = head_t.ray_cast(o, d)
                if hit[0] is None or owner[hit[2]] not in FACE_OBJS: continue
                seen += 1
                if occ_t.ray_cast(o, d, hit[3])[0] is not None: hid += 1
        if seen and hid / seen > worst[0]: worst = (hid / seen, view)
    return worst

def arm_report(act):
    rig.animation_data.action = act
    gap = {"l": 0.0, "r": 0.0}; bend = {"l": [999.0, -1.0], "r": [999.0, -1.0]}
    deep = {"head": (-1.0, None), "torso": (-1.0, None), "tool": (-1.0, None)}
    prev, spin = {}, (0.0, None)
    tool_objs = [o for o, _, _ in TOOL_PTS[act.name]]
    face, face_over_half = (0.0, None), 0
    for fr in frames_of(act):
        scene.frame_set(fr)
        for s in "lr":
            c = bpy.data.objects[f"hand_{s}"].matrix_world @ HAND_C[s]
            g = handle.matrix_world @ Vector((0, 0, -GRIP[s]))
            gap[s] = max(gap[s], (c - g).length)
            up, fo = pb[f"upper_{s}"], pb[f"fore_{s}"]
            ang = math.degrees((up.tail - up.head).angle(fo.tail - fo.head))
            bend[s] = [min(bend[s][0], ang), max(bend[s][1], ang)]
        for n in ARM_BONES:
            q = pb[n].matrix.to_quaternion()
            if n in prev:
                d = math.degrees(2 * math.acos(min(1.0, abs(prev[n].dot(q)))))
                if d > spin[0]: spin = (d, f"{n} frame {fr}")
            prev[n] = q
        for kind, d in (("head", depth("head")), ("torso", depth("torso")),
                        ("tool", max(depth("head", TOOL_PTS[act.name]), depth("torso", TOOL_PTS[act.name])))):
            if d[0] > deep[kind][0]: deep[kind] = (d[0], f"{d[1]} frame {fr}")
        f = face_hidden(ARM_OBJS + tool_objs)
        face_over_half += f[0] > 0.5
        if f[0] > face[0]: face = (f[0], f"{f[1]}, frame {fr}")
    rig.animation_data.action = None
    print(f"ARMS {act.name}: hand gap L {gap['l'] * 100:.2f} cm R {gap['r'] * 100:.2f} cm; "
          f"elbow bend L {bend['l'][0]:.0f}-{bend['l'][1]:.0f} deg R {bend['r'][0]:.0f}-{bend['r'][1]:.0f} deg; "
          f"arms in head {max(deep['head'][0], 0) * 100:.1f} cm ({deep['head'][1]}), "
          f"in torso {max(deep['torso'][0], 0) * 100:.1f} cm ({deep['torso'][1]}); "
          f"tool in head or torso {max(deep['tool'][0], 0) * 100:.1f} cm ({deep['tool'][1]}); "
          f"largest turn per frame {spin[0]:.1f} deg ({spin[1]}); "
          f"face hidden up to {face[0] * 100:.0f}% ({face[1]}), over half in {face_over_half} of {len(frames_of(act))} frames",
          flush=True)
    return max(gap.values()), face_over_half

reports = {act.name: arm_report(act) for act in (idle, walk, run, mine, chop)}
worst_gap = max(g for g, _ in reports.values())
assert worst_gap < 0.01, f"a hand is {worst_gap * 100:.1f} cm off its grip"
# the tool may sweep past the face for a moment in a swing, but never stay in front of it
hidden = {name: n for name, (_, n) in reports.items() if n > 10}
assert not hidden, f"over half the face hidden for more than 0.1 s: {hidden} (frames)"

# ---------- arms: crossfades ----------
# The game crossfades clips over 0.18 s (src/render/view.ts): three.js mixes each bone's local rotation (slerp) and
# position (lerp), and a swing that is interrupted stays frozen where it was. A blend of two arm poses doesn't follow
# the blend of the two tool poses, so on its own it takes the hands off the handle. The game fixes the blended pose
# every frame (src/render/arms.ts, from the GripL/R, HandL/R and PoleL/R markers), the same way as draw_in() and
# solve_arm() here: if a grip has gone out of an arm's reach (the tool's slide along its handle is blended apart from
# its turn), the tool is drawn in toward the shoulders until both grips are in reach, then each arm is re-solved onto
# its grip. Here, for every pair of clips at every phase (every 5th frame) blended 25, 50 and 75%: how far a hand
# would be off its grip blended alone, how far the tool is drawn in, and how far a hand is off after the fix.
ARM_REACH = {s: sum(ARM_LEN[s]) - 1e-6 for s in "lr"}  # as far as solve_arm reaches

def draw_in(S, G):
    """Translation that brings both grips G[s] within reach of their shoulders S[s] (alternating projections; the
    two reach balls always overlap, since the shoulders are 0.54 m apart and the grips 0.08 m)."""
    t = Vector()
    for _ in range(8):
        for s in "lr":
            v = G[s] + t - S[s]
            if v.length > ARM_REACH[s]:
                t -= v * (1 - ARM_REACH[s] / v.length)
    return t

CHANNELS = {}
def channels(act, fr):
    """{bone: (location, rotation)} of an action at a frame, from its curves."""
    k = (act.name, fr)
    if k not in CHANNELS:
        raw = {}
        for fc in fcurves(act):
            if fc.data_path.startswith('pose.bones["'):
                bone, prop = fc.data_path[12:].split('"].')
                raw.setdefault(bone, {}).setdefault(prop, {})[fc.array_index] = fc.evaluate(fr)
        CHANNELS[k] = {b: (Vector([p.get("location", {}).get(i, 0.0) for i in range(3)]),
                           Quaternion([p.get("rotation_quaternion", {}).get(i, 1.0 if i == 0 else 0.0) for i in range(4)]).normalized())
                       for b, p in raw.items()}
    return CHANNELS[k]

FK_ORDER = ("root", "hips", "tool", "upper_l", "fore_l", "upper_r", "fore_r")
def fk(chan):
    """Armature-space pose matrices of the bones in FK_ORDER for the given channels."""
    out = {}
    for n in FK_ORDER:
        b = bones[n]
        loc, q = chan.get(n, (Vector(), Quaternion()))
        basis = Matrix.Translation(loc) @ q.to_matrix().to_4x4()
        out[n] = (out[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local if b.parent else b.matrix_local) @ basis
    return out

def blend_gaps(a, b, wb):
    """(largest hand gap blended alone, largest draw-in, largest hand gap after the fix) over all phases of clips a
    and b, b weighted wb."""
    raw = drawn = fixed = 0.0
    for fa in frames_of(a)[::5]:
        ca = channels(a, fa)
        for fb in frames_of(b)[::5]:
            cb = channels(b, fb)
            chan = {}
            for n in FK_ORDER:
                (la, qa), (lb, qb) = ca.get(n, (Vector(), Quaternion())), cb.get(n, (Vector(), Quaternion()))
                chan[n] = (la.lerp(lb, wb), qa.slerp(qb, wb))
            P = fk(chan)
            H = P["hips"] @ bones["hips"].matrix_local.inverted()
            Tm = P["tool"] @ bones["tool"].matrix_local.inverted()
            G = {s: Tm @ (PIVOT - Vector((0, 0, GRIP[s]))) for s in "lr"}
            for s in "lr":
                hand = P[f"fore_{s}"] @ Vector((0, bones[f"fore_{s}"].length, 0))
                raw = max(raw, (hand - G[s]).length)
            t = draw_in({s: P[f"upper_{s}"].translation for s in "lr"}, G)
            drawn = max(drawn, t.length)
            for s in "lr":
                fixed = max(fixed, (solve_arm(s, H, G[s] + t)[2] - (G[s] + t)).length)
    return raw, drawn, fixed

CLIPS = (idle, walk, run, mine, chop)
worst_blend = 0.0
for i, a in enumerate(CLIPS):
    for b in CLIPS[i + 1:]:
        gaps = [blend_gaps(a, b, w) for w in (0.25, 0.5, 0.75)]
        raw, drawn, fixed = (max(g[k] for g in gaps) for k in range(3))
        worst_blend = max(worst_blend, fixed)
        print(f"BLEND {a.name}+{b.name}: a hand off the handle up to {raw * 100:.1f} cm blended alone; with the game's "
              f"fix {fixed * 100:.2f} cm, the tool drawn in by up to {drawn * 100:.1f} cm", flush=True)
assert worst_blend < 0.01, f"a hand is {worst_blend * 100:.1f} cm off its grip in a crossfade, even after the fix"

# ---------- export ----------
for o in bpy.data.objects:
    o.select_set(False)
path = os.path.join(OUT, "miner.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_frame_range=False, export_lights=False, export_cameras=False)
json.dump(meta, open(os.path.join(OUT, "miner.json"), "w"), indent=1)
print("DONE", path, os.path.getsize(path), meta)

# The exported file: every clip has dense rotation keys on the four arm bones, and no measuring helpers.
glb = open(path, "rb").read()
gl = json.loads(glb[20:20 + struct.unpack_from("<I", glb, 12)[0]])
names = [n.get("name", "") for n in gl["nodes"]]
assert not [n for n in names if n.startswith("_")], "helper objects were exported"
for anim in gl["animations"]:
    keys = {names[ch["target"]["node"]]: gl["accessors"][anim["samplers"][ch["sampler"]]["input"]]["count"]
            for ch in anim["channels"] if ch["target"]["path"] == "rotation" and names[ch["target"]["node"]] in ARM_BONES}
    print(f"GLB {anim['name']}: arm rotation keys {keys}", flush=True)
    assert len(keys) == 4 and min(keys.values()) > 50, f"{anim['name']} is missing dense arm keys"

# ---------- check renders: a contact sheet of every clip from the side, three-quarter front and front ----------
if CHECK:
    import numpy as np
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.13, radius2=0.09, depth=2.3)
    bmesh.ops.translate(bm, vec=(CHOP_REACH, 0, 1.15), verts=bm.verts)
    PAL["birch_bark"] = "#e8e2d6"; trunk = obj_from_bm("trunk", bm, "birch_bark")
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), 0, math.radians(-40))
    world = bpy.data.worlds.new("w"); world.use_nodes = True; scene.world = world
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.72, 0.9, 1)
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
    TILE, GAP = 360, 4
    scene.render.resolution_x = scene.render.resolution_y = TILE
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    for p in scene.render.bl_rna.properties:    # label each tile with the note stamp only
        if p.identifier.startswith("use_stamp_"): setattr(scene.render, p.identifier, False)
    scene.render.use_stamp = scene.render.use_stamp_note = True; scene.render.stamp_font_size = 18
    scene.render.stamp_foreground = (1, 1, 1, 1); scene.render.stamp_background = (0.1, 0.1, 0.12, 0.75)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.8
    look = Vector((0.35, 0, 1.05))
    rock_root.location.x = REACH                # the rock where the game stands the miner (after the export)
    renders = os.path.join(os.getcwd(), "assets", "renders"); os.makedirs(renders, exist_ok=True)
    key_fr = lambda ms, k: round(sum(ms[:k]) / 10)
    clips = [  # (row label, action, tool shown, target shown, [(label, frame)])
        ("Mine", mine, "pick", rock_root, [("wind-up", key_fr(MINE_MS, 3)), ("top", key_fr(MINE_MS, 5)), ("strike", key_fr(MINE_MS, 7)),
                                           ("impact", round(meta["mine_impact_s"] * FPS)), ("recover", key_fr(MINE_MS, 10))]),
        ("Chop", chop, "axe", trunk, [("wind-up", key_fr(CH_MS, 3)), ("top", key_fr(CH_MS, 5)), ("strike", key_fr(CH_MS, 7)),
                                      ("impact", impact_f), ("recover", key_fr(CH_MS, 10))]),
        ("Idle/Walk/Run", None, "pick", None, [("idle", (idle, 0)), ("walk 0.2 s", (walk, 20)), ("run 0.14 s", (run, 14)), ("run 0.42 s", (run, 42))]),
    ]
    TOOLS = {"pick": ("pick_head", "pick_collar"), "axe": ("axe_head", "axe_blade")}
    # the side, a three-quarter front, and straight on from the front at the game camera's pitch (38 degrees,
    # src/render/camera.ts), where the face shows; the rock or trunk is left out of that one so it hides nothing
    p38 = math.radians(38)
    VIEWS = (("side", Vector((0, -1, 0.08))), ("3/4 front", Vector((1, 0.8, 0.35))), ("front, game pitch", Vector((math.cos(p38), 0, math.sin(p38)))))
    rows = []
    for row_label, act, tool, target, shots in clips:
        for tl, names_ in TOOLS.items():
            for n in names_: bpy.data.objects[n].hide_render = tl != tool
        for view, d in VIEWS:
            for o in [rock_root, *rock_root.children, trunk]:
                o.hide_render = target is None or view.startswith("front") or not (o is target or o.parent is target)
            cam.location = look + d.normalized() * 8
            cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
            row = []
            for label, fr in shots:
                a, fr = (act, fr) if act else fr
                rig.animation_data.action = a
                scene.frame_set(fr)
                scene.render.stamp_note_text = f"{a.name} {label} ({view})"
                scene.render.filepath = os.path.join(renders, f"_rig_check_{len(rows)}_{len(row)}.png")
                bpy.ops.render.render(write_still=True)
                row.append(scene.render.filepath)
            rows.append(row)
    rig.animation_data.action = None
    cols = max(len(r) for r in rows)
    W, H_ = cols * TILE + (cols - 1) * GAP, len(rows) * TILE + (len(rows) - 1) * GAP
    sheet = np.ones((H_, W, 4), dtype=np.float32)
    for r, row in enumerate(rows):
        for c, f in enumerate(row):
            img = bpy.data.images.load(f)
            px = np.empty(TILE * TILE * 4, dtype=np.float32); img.pixels.foreach_get(px)
            y0 = H_ - (r + 1) * TILE - r * GAP       # Blender images start at the bottom row
            sheet[y0:y0 + TILE, c * (TILE + GAP):c * (TILE + GAP) + TILE] = px.reshape(TILE, TILE, 4)
            bpy.data.images.remove(img); os.remove(f)
    out = bpy.data.images.new("rig_check_sheet", W, H_)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(renders, "rig_check_sheet.png"); out.file_format = "PNG"; out.save()
    print("CHECK sheet", out.filepath_raw)
