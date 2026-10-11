# Recipe: walk / idle / mine animations of the v2 miner in 8 facings, plus the copper rock on its own,
# for the click-to-move demo. Builds the character from assets-src/sprite_miner_v2.py (everything above
# its "# Copper rock" line), adds leg joints and a turning root, and writes:
#   assets/sprites/miner_v2_demo/<anim>_<facing>_<frame>.png   (anim = walk 8 frames, mine 12, idle 1)
#   assets/sprites/miner_v2_demo/rock.png
#   assets/sprites/miner_v2_demo/meta.json   (anchors, facing directions on screen, where to stand to mine)
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/sprite_miner_v2_demo.py
import bpy, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.path.join(os.getcwd(), "assets-src")
src = open(os.path.join(os.getcwd(), "assets-src", "sprite_miner_v2.py"), encoding="utf-8").read()
exec(src[:src.index("# Copper rock")])          # helpers, materials and the character itself

OUT = os.path.join(os.getcwd(), "assets", "sprites", "miner_v2_demo")
os.makedirs(OUT, exist_ok=True)
RES = 256
FACINGS = 8
ROCK_C = Vector((0.0, 0.0, 0.0))                 # rock is rendered on its own, centred here

# ---------- rig the static v2 model a little more ----------
def reparent(obj, parent):
    mw = obj.matrix_world.copy(); obj.parent = parent; obj.matrix_world = mw

bpy.context.view_layer.update()
root = empty("root", (0, 0, 0))
legs = {}
for side, y in (("l", 0.11), ("r", -0.11)):
    pivot = empty(f"hip_{side}", (0, y, 0.66), root)
    bpy.context.view_layer.update()              # the new pivot's world matrix must be current before reparenting
    reparent(bpy.data.objects[f"leg_{side}"], pivot)
    reparent(bpy.data.objects[f"boot_{side}"], pivot)
    legs[side] = pivot
reparent(hips, root)

# The rock: same recipe as the v2 sprite, moved to ROCK_C; hidden while the character renders.
rock_objs = [blob("rock", 0.42, (0.0, 0, 0.2), "stone", 7, squash=(1.0, 1.1, 0.72)),
             blob("rock_small", 0.22, (0.27, 0.33, 0.1), "stone_dark", 11, squash=(1.1, 1, 0.7))]
for i, (x, y, z) in enumerate([(-0.22, -0.15, 0.38), (-0.08, 0.22, 0.42), (0.12, -0.25, 0.33), (-0.16, 0.05, 0.47), (0.22, 0.05, 0.4)]):
    rock_objs.append(blob(f"ore_{i}", 0.08, (x, y, z), "ore" if i % 2 else "ore_hi", 20 + i, subdiv=0, jitter=0.25))
for o in rock_objs:                              # a bigger boulder reads better next to the miner in the game view
    o.scale = (1.45, 1.45, 1.2)

bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
ground = obj_from_bm("ground", bm, "stone"); ground.is_shadow_catcher = True

# ---------- light, camera ----------
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.2; sun.data.color = (1.0, 0.95, 0.85); sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(30), math.radians(-12), math.radians(-30)); scene.collection.objects.link(sun)
world = bpy.data.worlds.new("sky"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.75, 1.0, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
scene.world = world

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.0
elev, az = math.radians(32), math.radians(-72)
look = Vector((0, 0, 0.75))
cam.location = look + Vector((10 * math.cos(elev) * math.cos(az), 10 * math.cos(elev) * math.sin(az), 10 * math.sin(elev)))
tc = cam.constraints.new("TRACK_TO"); tc.target = empty("look", look); tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
bpy.context.view_layer.update()

def px(p):
    """World point -> pixel (x right, y down) in a RES x RES render."""
    v = world_to_camera_view(scene, cam, Vector(p))
    return [v.x * RES, (1 - v.y) * RES]

def render(path):
    scene.render.filepath = os.path.join(OUT, path)
    bpy.ops.render.render(write_still=True)

origin_px = px((0, 0, 0))

# ---------- rock alone ----------
for o in bpy.data.objects:
    if o.type == "MESH" and o not in rock_objs and o is not ground:
        o.hide_render = True
render("rock.png")
for o in bpy.data.objects:
    if o.type == "MESH":
        o.hide_render = o in rock_objs

# ---------- character: 8 facings x (idle, walk, mine) ----------
CARRY = -32                                      # arm angle while walking: pick held low in both hands
WALK = 8
meta = {"res": RES, "anchor": origin_px, "rock_anchor": px(ROCK_C), "impact_frame": IMPACT,
        "anims": {"idle": 1, "walk": WALK, "mine": len(ANGLES)}, "facings": []}
tip_local = Vector((-0.36, 0, -1.02))
for fi in range(FACINGS):
    yaw = fi * 2 * math.pi / FACINGS
    root.rotation_euler = (0, 0, yaw)
    fwd = Vector((math.cos(yaw), math.sin(yaw), 0))
    a, b = px((0, 0, 0)), px(fwd)
    sd = Vector((b[0] - a[0], b[1] - a[1])).normalized()
    # where the feet go so the pick lands on the near side of the rock: the v2 layout had the
    # rock centre 1.08 m in front of the feet
    stand = px(ROCK_C - fwd * 1.08)
    rk = px(ROCK_C)
    meta["facings"].append({"yaw_deg": math.degrees(yaw), "screen_dir": [sd.x, sd.y],
                            "stand_offset": [stand[0] - rk[0], stand[1] - rk[1]]})

    for leg in legs.values(): leg.rotation_euler = (0, 0, 0)
    hips.location.z = 0.62; hips.rotation_euler = (0, 0, 0); head.rotation_euler = (0, 0, 0)
    arms.rotation_euler = (0, math.radians(CARRY), 0)
    render(f"idle_{fi}_0.png")

    for f in range(WALK):
        ph = f / WALK * 2 * math.pi
        swing = math.sin(ph) * math.radians(26)
        legs["l"].rotation_euler = (0, -swing, 0)
        legs["r"].rotation_euler = (0, swing, 0)
        hips.location.z = 0.62 + 0.025 * abs(math.cos(ph))
        hips.rotation_euler = (0, math.radians(4), 0)
        arms.rotation_euler = (0, math.radians(CARRY + 6 * math.sin(ph)), 0)
        head.rotation_euler = (0, math.radians(-2), 0)
        render(f"walk_{fi}_{f}.png")

    for leg in legs.values(): leg.rotation_euler = (0, 0, 0)
    hips.location.z = 0.62
    for f, (ang, lean) in enumerate(zip(ANGLES, LEAN)):
        arms.rotation_euler = (0, math.radians(ang), 0)
        hips.rotation_euler = (0, math.radians(lean), 0)
        head.rotation_euler = (0, math.radians(-lean * 0.5 + (6 if f in (IMPACT, IMPACT + 1) else 0)), 0)
        render(f"mine_{fi}_{f}.png")
        if f == IMPACT:
            bpy.context.view_layer.update()
            meta["facings"][fi]["impact_px"] = px(arms.matrix_world @ tip_local)
    print("facing", fi, flush=True)

json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
print("DONE", OUT)
