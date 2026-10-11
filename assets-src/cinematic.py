# Recipe: a ~42 s cinematic of the v2 miner (the game's own assets/models/miner.glb) in a clearing:
# walk, mine two rocks, day -> dusk -> night with a lantern, eight camera shots, title and fade.
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/cinematic.py -- [test|full]
#   test: one still from the middle of each shot -> assets/video/test_shotN.png (quick check)
#   full: the video -> assets/video/hearthfolk_cinematic.mp4
import bpy, bmesh, math, os, sys, random, json
from mathutils import Vector, Euler, Matrix

MODE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "test"
ROOT = os.getcwd()
OUT = os.path.join(ROOT, "assets", "video"); os.makedirs(OUT, exist_ok=True)
FPS = 30
META = json.load(open(os.path.join(ROOT, "assets", "models", "miner.json")))
REACH = META.get("reach_m", 1.05)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)

def mat(name, hexcol, rough=0.8, emit=None, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(hexcol); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = lin(emit); b.inputs["Emission Strength"].default_value = 0.0
    return m

def obj(name, bm, material, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(material)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    return o

# ---------- the game's miner and rock ----------
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "miner.glb"))
rig = bpy.data.objects["Miner"]
rock1 = bpy.data.objects["Rock"]
tip = bpy.data.objects["PickTip"]
acts = {n: next(a for a in bpy.data.actions if a.name.startswith(n)) for n in ("Idle", "Walk", "Mine")}
if rig.animation_data: rig.animation_data.action = None

# A second rock (tin: pale ore) made by copying the first
def copy_tree(src, parent=None):
    c = src.copy()
    if src.data: c.data = src.data.copy()
    scene.collection.objects.link(c); c.parent = parent
    for ch in src.children: copy_tree(ch, c)
    return c
rock2 = copy_tree(rock1)
tin = mat("tin_ore", "#c9ccd1", 0.4, metal=0.3)
for o in rock2.children_recursive:
    if o.name.startswith("Ore"): o.data.materials[0] = tin

R1, R2 = Vector((1.5, 0.6, 0)), Vector((4.6, -2.4, 0))
rock1.location, rock2.location = R1, R2
rock2.rotation_euler = (0, 0, 1.9)
START = Vector((-4.2, -2.0, 0))

def stand_for(rock, frm):
    d = (frm - rock); d.z = 0; d.normalize()
    return rock + d * REACH, math.atan2(-d.y, -d.x)

S1, H1 = stand_for(R1, START)
S2, H2 = stand_for(R2, S1)

# ---------- timeline ----------
SPEED = 1.45
T_WALK1 = 75
T_MINE1 = T_WALK1 + round((S1 - START).length / SPEED * FPS)
T_WALK2 = 660
T_MINE2 = T_WALK2 + round((S2 - S1).length / SPEED * FPS)
END = 1260
scene.frame_start, scene.frame_end = 1, END

def key_root(f, pos, heading):
    rig.location = pos; rig.rotation_euler = (0, 0, heading)
    rig.keyframe_insert("location", frame=f); rig.keyframe_insert("rotation_euler", frame=f)

h0 = math.atan2((S1 - START).y, (S1 - START).x)
key_root(1, START, 0.6); key_root(T_WALK1 - 6, START, 0.6); key_root(T_WALK1 + 4, START, h0)
key_root(T_MINE1, S1, h0); key_root(T_MINE1 + 6, S1, H1)
h1 = math.atan2((S2 - S1).y, (S2 - S1).x)
key_root(T_WALK2, S1, H1)
# turn the short way round
while h1 - H1 > math.pi: h1 -= 2 * math.pi
while h1 - H1 < -math.pi: h1 += 2 * math.pi
key_root(T_WALK2 + 8, S1, h1); key_root(T_MINE2, S2, h1)
h2 = H2
while h2 - h1 > math.pi: h2 -= 2 * math.pi
while h2 - h1 < -math.pi: h2 += 2 * math.pi
key_root(T_MINE2 + 6, S2, h2); key_root(END, S2, h2)
for fc in (rig.animation_data.action.fcurves if hasattr(rig.animation_data.action, "fcurves") else []):
    for kp in fc.keyframe_points: kp.interpolation = "LINEAR"

# body animation through the NLA, one strip per stretch, looped
ad = rig.animation_data
def strip(name, start, end):
    act = acts[name]
    tr = ad.nla_tracks.new(); tr.name = f"{name}_{start}"
    s = tr.strips.new(name, int(start), act)
    try:
        if hasattr(act, "slots") and len(act.slots): s.action_slot = act.slots[0]
    except Exception: pass
    a0, a1 = act.frame_range
    s.repeat = max(1.0, (end - start) / max(1e-3, a1 - a0))
    s.blend_in = s.blend_out = 4
    s.extrapolation = "NOTHING"
    return s
strip("Idle", 1, T_WALK1); strip("Walk", T_WALK1, T_MINE1); strip("Mine", T_MINE1, T_WALK2)
strip("Walk", T_WALK2, T_MINE2); strip("Mine", T_MINE2, END + 1)
MINE_CYCLE = META["mine_cycle_s"] * FPS
IMPACT = META["mine_impact_s"] * FPS

# ---------- hands on the handle through the strip blends ----------
# Each clip holds the handle, but the strips blend over 4 frames, and a blend of two arm poses doesn't follow the
# blend of the two tool poses, so the hands would come off the handle. Fixed every frame as the game does
# (src/render/arms.ts, draw_in and solve_arm in export_miner_glb.py): if a grip is out of reach the tool is drawn in
# toward the shoulders, then each arm is re-solved onto its grip with the elbow toward its pole (the markers GripL/R,
# HandL/R and PoleL/R in miner.glb). The result plays on a top NLA track.
pb, bones = rig.pose.bones, rig.data.bones
mark = {n: bpy.data.objects[n] for n in ("GripL", "GripR", "HandL", "HandR", "PoleL", "PoleR")}
ARM = {}
def frame3(axis, hinge):
    return Matrix((axis, hinge.cross(axis), hinge)).transposed()
rig.data.pose_position = "REST"; bpy.context.view_layer.update()
for s in "lr":
    S0, E0 = bones[f"upper_{s}"].head_local, bones[f"fore_{s}"].head_local
    T0 = rig.matrix_world.inverted() @ mark[f"Hand{s.upper()}"].matrix_world.translation
    u = (T0 - S0).normalized(); w = (E0 - S0) - (E0 - S0).dot(u) * u; w.normalize(); n = u.cross(w)
    a, b = (E0 - S0).length, (T0 - E0).length
    ARM[s] = dict(a=a, b=b, reach=a + b - 1e-6, Fu=frame3((E0 - S0).normalized(), n), Ff=frame3((T0 - E0).normalized(), n))
rig.data.pose_position = "POSE"; bpy.context.view_layer.update()

def hand_gap():
    return max((mark[f"Hand{S}"].matrix_world.translation - mark[f"Grip{S}"].matrix_world.translation).length for S in "LR")

fixes, before, drawn = {}, 0.0, 0.0
for f in range(1, END + 1):
    scene.frame_set(f)
    before = max(before, hand_gap())
    inv = rig.matrix_world.inverted()
    S = {s: pb[f"upper_{s}"].head.copy() for s in "lr"}
    G = {s: inv @ mark[f"Grip{s.upper()}"].matrix_world.translation for s in "lr"}
    t = Vector()
    for _ in range(8):
        for s in "lr":
            v = G[s] + t - S[s]
            if v.length > ARM[s]["reach"]: t -= v * (1 - ARM[s]["reach"] / v.length)
    drawn = max(drawn, t.length)
    tool = bones["tool"]
    rel = tool.parent.matrix_local.inverted() @ tool.matrix_local
    tool_loc = (rel.inverted() @ pb[tool.parent.name].matrix.inverted() @ Matrix.Translation(t) @ pb["tool"].matrix).translation
    fix = {"tool": tool_loc}
    for s in "lr":
        A = ARM[s]; a, b = A["a"], A["b"]
        g = G[s] + t
        v = g - S[s]; u = v.normalized()
        d = min(max(v.length, abs(a - b) + 1e-4), a + b - 1e-6)
        x = (a * a - b * b + d * d) / (2 * d); h = math.sqrt(max(a * a - x * x, 0.0))
        p = inv @ mark[f"Pole{s.upper()}"].matrix_world.translation - S[s]
        w = (p - p.dot(u) * u).normalized()
        E = S[s] + u * x + w * h; T = S[s] + u * d; n = u.cross(w)
        up, fo = bones[f"upper_{s}"], bones[f"fore_{s}"]
        Mu = Matrix.Translation(S[s]) @ (frame3((E - S[s]).normalized(), n) @ A["Fu"].transposed() @ up.matrix_local.to_3x3()).to_4x4()
        Mf = Matrix.Translation(E) @ (frame3((T - E).normalized(), n) @ A["Ff"].transposed() @ fo.matrix_local.to_3x3()).to_4x4()
        fix[up.name] = (up.matrix_local.inverted() @ up.parent.matrix_local @ pb[up.parent.name].matrix.inverted() @ Mu).to_quaternion()
        fix[fo.name] = (fo.matrix_local.inverted() @ up.matrix_local @ Mu.inverted() @ Mf).to_quaternion()
    fixes[f] = fix

root_act, root_slot = ad.action, ad.action_slot
held = bpy.data.actions.new("HandsOnHandle")
ad.action = held
last = {}
for f, fix in fixes.items():
    for name, val in fix.items():
        if name == "tool":
            pb[name].location = val; pb[name].keyframe_insert("location", frame=f)
        else:
            if name in last and last[name].dot(val) < 0: val.negate()     # continuity
            last[name] = val
            pb[name].rotation_quaternion = val; pb[name].keyframe_insert("rotation_quaternion", frame=f)
ad.action = root_act
try: ad.action_slot = root_slot
except Exception: pass
tr = ad.nla_tracks.new(); tr.name = "HandsOnHandle"
st = tr.strips.new("HandsOnHandle", 1, held)
try:
    if hasattr(held, "slots") and len(held.slots): st.action_slot = held.slots[0]
except Exception: pass
st.blend_type = "REPLACE"; st.extrapolation = "HOLD"
after = 0.0
for f in range(1, END + 1):
    scene.frame_set(f); after = max(after, hand_gap())
print(f"ARMS cinematic: a hand off the handle up to {before * 100:.1f} cm in the strip blends alone, "
      f"{after * 100:.2f} cm fixed (the tool drawn in by up to {drawn * 100:.1f} cm)", flush=True)

# ---------- the clearing ----------
random.seed(4)
grass_m = bpy.data.materials.new("ground"); grass_m.use_nodes = True
nt = grass_m.node_tree; bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.95
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.6; noise.inputs["Detail"].default_value = 4
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = lin("#4f9140"); ramp.color_ramp.elements[1].color = lin("#69ad55")
nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
obj("ground", bm, grass_m)

dirt_m = bpy.data.materials.new("dirt"); dirt_m.use_nodes = True
nt = dirt_m.node_tree; b = nt.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = lin("#a8865a"); b.inputs["Roughness"].default_value = 1
tc = nt.nodes.new("ShaderNodeTexCoord"); grad = nt.nodes.new("ShaderNodeTexGradient"); grad.gradient_type = "SPHERICAL"
nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 9
mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
rp = nt.nodes.new("ShaderNodeValToRGB"); rp.color_ramp.elements[0].position = 0.25; rp.color_ramp.elements[1].position = 0.55
nt.links.new(tc.outputs["Object"], grad.inputs["Vector"]); nt.links.new(grad.outputs["Fac"], mul.inputs[0])
nt.links.new(nz.outputs["Fac"], mul.inputs[1]); nt.links.new(mul.outputs[0], rp.inputs["Fac"]); nt.links.new(rp.outputs["Color"], b.inputs["Alpha"])
for r in (R1, R2):
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=1.0)
    d = obj("dirt", bm, dirt_m); d.location = r + Vector((0, 0, 0.004)); d.scale = (2.0, 1.7, 1)

grass_blade = mat("blade", "#4b8c3b", 0.9)
bm = bmesh.new()
for i in range(3200):
    x, y = random.uniform(-14, 14), random.uniform(-12, 12)
    if min((Vector((x, y, 0)) - R1).length, (Vector((x, y, 0)) - R2).length) < 1.7: continue
    h = random.uniform(0.1, 0.2)
    g = bmesh.ops.create_cone(bm, cap_ends=False, segments=3, radius1=0.035, radius2=0.0, depth=h)
    vs = g["verts"]
    bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Euler((random.uniform(-.3, .3), random.uniform(-.3, .3), random.uniform(0, 6.3))).to_matrix())
    bmesh.ops.translate(bm, verts=vs, vec=(x, y, h / 2))
obj("grass", bm, grass_blade)
for i in range(60):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.035)
    f = obj("flower", bm, mat(f"flower{i}", random.choice(["#f4e04d", "#f7f7f7", "#f29bb5"]), 0.6))
    f.location = (random.uniform(-12, 12), random.uniform(-10, 10), 0.06)

def tree(x, y, s, seed):
    random.seed(seed)
    bark, leaf, leaf2 = mat(f"bark{seed}", "#6b4423"), mat(f"leaf{seed}", "#3f8a3a"), mat(f"leaf2{seed}", "#5aa84a")
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.16 * s, radius2=0.11 * s, depth=1.3 * s)
    t = obj("trunk", bm, bark); t.location = (x, y, 0.65 * s)
    for k, (dx, dy, dz, r) in enumerate([(0, 0, 1.75, 0.85), (0.35, 0.2, 1.45, 0.6), (-0.3, -0.25, 1.5, 0.62)]):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * s)
        for v in bm.verts: v.co *= 0.88 + random.random() * 0.24
        c = obj("crown", bm, leaf if k == 0 else leaf2); c.location = (x + dx * s, y + dy * s, dz * s)
for i, (x, y, s) in enumerate([(-6.5, 3.5, 1.3), (-8, -1, 1.1), (-3, 5.5, 1.0), (3, 5, 1.4), (7.5, 2.5, 1.2), (8.5, -4.5, 1.0),
                              (-6, -6, 1.2), (2, -10.5, 1.1), (11.5, -8.5, 1.3), (-10, 4, 1.4), (13.5, 3.5, 1.3), (0, 8, 1.2)]):
    tree(x, y, s, 30 + i)
for i in range(9):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=random.uniform(0.15, 0.35))
    for v in bm.verts: v.co *= 0.8 + random.random() * 0.4; v.co.z *= 0.6
    p = obj("pebble", bm, mat(f"pebble{i}", "#8a8d92")); p.location = (random.uniform(-9, 9), random.uniform(-8, 8), 0.05)

# lantern beside the second rock
post = obj("post", (lambda: (lambda b: (bmesh.ops.create_cube(b, size=1), b)[1])(bmesh.new()))(), mat("post", "#6b4a2a"))
post.scale = (0.09, 0.09, 1.3); post.location = R2 + Vector((-1.1, 0.9, 0.65))
glow_m = mat("glow", "#ffd27a", 0.5, emit="#ffb050")
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.12)
glow = obj("glow", bm, glow_m); glow.location = post.location + Vector((0, 0, 0.72))
lamp = bpy.data.objects.new("lamp", bpy.data.lights.new("lamp", "POINT")); scene.collection.objects.link(lamp)
lamp.location = glow.location; lamp.data.color = (1.0, 0.68, 0.32); lamp.data.shadow_soft_size = 0.15

# ---------- light and time of day ----------
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
sun.data.angle = math.radians(3)
world = bpy.data.worlds.new("sky"); world.use_nodes = True; scene.world = world
bg = world.node_tree.nodes["Background"]
TOD = [  # frame, sun elevation, azimuth, sun colour, sun strength, sky colour, sky strength, lamp W, glow
    (1,    52, 140, "#fff3e0", 3.6, "#9cc4ec", 1.0, 0,   0.0),
    (560,  40, 175, "#fff0d8", 3.4, "#a2c6ea", 0.95, 0,  0.0),
    (760,  14, 215, "#ff9a52", 2.8, "#e0a07a", 0.8, 80,  3.0),
    (900,  5, 235, "#ff7a40", 1.4, "#4a4270", 0.55, 300, 8.0),
    (960,  35, 60,  "#9fb4ff", 1.4, "#24305c", 0.45, 450, 10.0),
    (END,  35, 60,  "#9fb4ff", 1.4, "#24305c", 0.45, 450, 10.0),
]
for f, el, az, sc, ss, kc, ks, lw, gl in TOD:
    sun.rotation_euler = (math.radians(90 - el), 0, math.radians(az)); sun.keyframe_insert("rotation_euler", frame=f)
    sun.data.color = lin(sc)[:3]; sun.data.energy = ss
    sun.data.keyframe_insert("color", frame=f); sun.data.keyframe_insert("energy", frame=f)
    bg.inputs[0].default_value = lin(kc); bg.inputs[1].default_value = ks
    bg.inputs[0].keyframe_insert("default_value", frame=f); bg.inputs[1].keyframe_insert("default_value", frame=f)
    lamp.data.energy = lw; lamp.data.keyframe_insert("energy", frame=f)
    gb = glow_m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]; gb.default_value = gl; gb.keyframe_insert("default_value", frame=f)

# ---------- chips at every strike ----------
chip_m = [mat("chipA", "#8d8f94"), mat("chipB", "#d98a4a")]
def chips_at(f0):
    scene.frame_set(int(f0)); p = tip.matrix_world.translation.copy()
    for i in range(7):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=0.05)
        c = obj("chip", bm, chip_m[i % 2])
        v = Vector((random.uniform(-1.1, 1.1), random.uniform(-1.1, 1.1), random.uniform(1.6, 3.0)))
        c.scale = (0, 0, 0); c.keyframe_insert("scale", frame=int(f0) - 1)
        for k in range(0, 19):
            t = k / FPS; pos = p + v * t + Vector((0, 0, -4.5 * t * t)); pos.z = max(0.03, pos.z)
            c.location = pos; c.keyframe_insert("location", frame=int(f0) + k)
            c.rotation_euler = (k * 0.5, k * 0.3, 0); c.keyframe_insert("rotation_euler", frame=int(f0) + k)
            c.scale = (1, 1, 1) if k < 14 else ((18 - k) / 4,) * 3; c.keyframe_insert("scale", frame=int(f0) + k)
for start, end in ((T_MINE1, T_WALK2), (T_MINE2, END - 20)):
    n = 0
    while start + n * MINE_CYCLE + IMPACT < end:
        chips_at(start + n * MINE_CYCLE + IMPACT); n += 1

# ---------- cameras ----------
def cam(name, lens=35):
    c = bpy.data.objects.new(name, bpy.data.cameras.new(name)); scene.collection.objects.link(c); c.data.lens = lens
    c.data.clip_end = 200
    return c
def aim(c, f, pos, look):
    c.location = Vector(pos)
    c.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    c.keyframe_insert("location", frame=f); c.keyframe_insert("rotation_euler", frame=f)
def miner_at(f):
    scene.frame_set(int(f)); return rig.matrix_world.translation.copy()

SHOTS = []
def shot(name, f0, f1, keys, lens=35, dof=None, ortho=None):
    c = cam(name, lens)
    for f, pos, look in keys: aim(c, f, pos, look)
    if dof: c.data.dof.use_dof = True; c.data.dof.focus_distance = dof[0]; c.data.dof.aperture_fstop = dof[1]
    if ortho: c.data.type = "ORTHO"; c.data.ortho_scale = ortho
    m = scene.timeline_markers.new(name, frame=f0); m.camera = c
    SHOTS.append((name, f0, f1, c))

up = Vector((0, 0, 1))
# 1 establishing: crane down over the clearing
shot("establish", 1, 150, [(1, (-1, -14, 9), (0, 0, 0.5)), (150, (-4, -9.5, 3.2), START + up)], lens=30)
# 2 tracking alongside the walk
p_a, p_b = miner_at(150), miner_at(240)
side = Vector((-(S1 - START).y, (S1 - START).x, 0)).normalized()
shot("track", 150, 240, [(150, p_a - side * 4.6 + up * 1.5, p_a + up * 0.9), (240, p_b - side * 4.6 + up * 1.5, p_b + up * 0.9)], lens=28)
# 3 low close-up on the strikes, shallow focus, slow dolly
fwd1 = Vector((math.cos(H1), math.sin(H1), 0)); sd1 = Vector((-fwd1.y, fwd1.x, 0))
mid1 = (S1 + R1) / 2
shot("closeup", 240, 420, [(240, mid1 + sd1 * 3.6 + up * 0.75, mid1 + up * 1.05), (420, mid1 + sd1 * 3.2 - fwd1 * 0.7 + up * 0.7, mid1 + up * 1.05)],
     lens=35, dof=(3.5, 2.8))
# 4 over the shoulder
shot("shoulder", 420, 560, [(420, S1 - fwd1 * 3.1 - sd1 * 1.0 + up * 2.3, R1 + up * 0.7), (560, S1 - fwd1 * 2.8 - sd1 * 0.8 + up * 2.2, R1 + up * 0.7)], lens=35)
# 5 time-lapse orbit as the sun sets and he walks to the second rock
c5 = (R1 + R2) / 2
keys = []
for k in range(5):
    f = 560 + k * 50; a = math.radians(-60 + k * 30)
    keys.append((f, c5 + Vector((math.cos(a) * 9, math.sin(a) * 9, 4.5)), c5 + up * 0.5))
shot("timelapse", 560, 760, keys, lens=28)
# 6 the game's own overhead view (orthographic, 32 degrees down)
el, az = math.radians(32), math.radians(-72)
gdir = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
gc = (S2 + R2) / 2 + up * 0.6
shot("gameview", 760, 960, [(760, gc + gdir * 30, gc), (960, gc + gdir * 30 + Vector((0.6, 0, 0)), gc + Vector((0.6, 0, 0)))], ortho=7.5)
# 7 night close-up by the lantern
fwd2 = Vector((math.cos(H2), math.sin(H2), 0)); sd2 = Vector((-fwd2.y, fwd2.x, 0)); mid2 = (S2 + R2) / 2
night_side = sd2 if (S2 + sd2 * 3 - post.location).length > (S2 - sd2 * 3 - post.location).length else -sd2
shot("night", 960, 1140, [(960, mid2 + night_side * 3.2 + up * 0.9, mid2 + up * 0.8), (1140, mid2 + night_side * 2.7 + fwd2 * 0.5 + up * 0.8, mid2 + up * 0.8)],
     lens=35, dof=(3.1, 2.8))
# 8 crane up and away, title, fade
shot("finale", 1140, END, [(1140, mid2 + night_side * 3.4 + up * 1.6, mid2 + up * 0.6), (END, mid2 + night_side * 7 + up * 11, mid2)], lens=32)
for _, _, _, c in SHOTS:
    if c.animation_data:
        for fc in getattr(c.animation_data.action, "fcurves", []):
            for kp in fc.keyframe_points: kp.interpolation = "BEZIER"; kp.easing = "EASE_IN_OUT"

# title on the last shot's camera
fin = SHOTS[-1][3]
bpy.ops.object.text_add(); title = bpy.context.object; title.data.body = "Hearthfolk"; title.data.align_x = "CENTER"
title.data.size = 0.16; title.data.extrude = 0.004
title.data.materials.append(mat("title", "#f1e8d4", 0.5, emit="#ffe2a0"))
title.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.5
title.parent = fin; title.location = (0, 0.05, -1.5); title.rotation_euler = (0, 0, 0)
title.hide_render = True; title.keyframe_insert("hide_render", frame=1)
title.hide_render = False; title.keyframe_insert("hide_render", frame=1185)
scene.view_settings.exposure = 0; scene.view_settings.keyframe_insert("exposure", frame=1225)
scene.view_settings.exposure = -8; scene.view_settings.keyframe_insert("exposure", frame=END)

# ---------- render settings ----------
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 48
scene.render.use_motion_blur = True
scene.view_settings.view_transform = "AgX"
try: scene.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
scene.render.resolution_x, scene.render.resolution_y = 1280, 720

if MODE == "test":
    scene.render.image_settings.file_format = "PNG"
    for i, (name, f0, f1, c) in enumerate(SHOTS):
        scene.frame_set((f0 + f1) // 2); scene.camera = c
        scene.render.filepath = os.path.join(OUT, f"test_{i + 1}_{name}.png")
        bpy.ops.render.render(write_still=True)
        print("TEST", name, flush=True)
else:
    try: scene.render.image_settings.media_type = "VIDEO"
    except Exception: pass
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"; scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "HIGH"; scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.filepath = os.path.join(OUT, "hearthfolk_cinematic.mp4")
    bpy.ops.render.render(animation=True)
print("DONE", MODE, json.dumps({"walk1": T_WALK1, "mine1": T_MINE1, "walk2": T_WALK2, "mine2": T_MINE2}))
