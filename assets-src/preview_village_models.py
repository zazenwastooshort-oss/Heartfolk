# Check render: every model in assets/models/village.glb side by side -> assets/renders/village_models.png
# Run: A:\Blender\blender-5.2.2-windows-x64\blender.exe -b --factory-startup -P assets-src/preview_village_models.py
import bpy, math, os
from mathutils import Vector

ROOT = os.getcwd()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "village.glb"))
order = ["House", "HouseTall", "HouseLong", "Bank", "CityHall", "Inn", "Forge", "Barn", "Stall", "StallBlue", "Hearth", "Well",
         "NoticeBoard", "Bench", "Crates", "Garden", "Fence", "Lantern", "TreeBirch", "TreeOak", "TreePine", "Bush", "StumpBirch", "StumpOak", "Tent", "CampfireCold"]
x = 0.0
for name in order:
    o = bpy.data.objects[name]
    w = {"CityHall": 8, "Inn": 8, "Barn": 7.5, "Bank": 7, "House": 6, "HouseTall": 6, "HouseLong": 8, "Forge": 6.5, "Stall": 4.5,
         "StallBlue": 4.5, "Garden": 4, "Fence": 3}.get(name, 3)
    o.location = (x + w / 2, 0, 0); x += w
bpy.ops.mesh.primitive_plane_add(size=200, location=(x / 2, 0, 0))
ground = bpy.context.object
gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.11, 0.33, 0.08, 1); ground.data.materials.append(gm)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
world = bpy.data.worlds.new("w"); world.use_nodes = True; scene.world = world
world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.72, 0.9, 1)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = x * 1.02
target = Vector((x / 2, 0, 2.5))
cam.location = target + Vector((0, -30, 18))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x, scene.render.resolution_y = 3600, 560
scene.render.filepath = os.path.join(ROOT, "assets", "renders", "village_models.png")
bpy.ops.render.render(write_still=True)
print("DONE")
