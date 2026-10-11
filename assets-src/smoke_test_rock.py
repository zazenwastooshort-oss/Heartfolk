# Smoke test: build one faceted low-poly rock and render it. Run: blender -b -P assets-src/smoke_test_rock.py
import bpy, bmesh, random, math, os
random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
mesh = bpy.data.meshes.new("rock"); obj = bpy.data.objects.new("rock", mesh); scene.collection.objects.link(obj)
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
for v in bm.verts:
    v.co *= 0.8 + random.random() * 0.4; v.co.z *= 0.7
    if v.co.z < -0.2: v.co.z = -0.2
bm.to_mesh(mesh); bm.free()
for p in mesh.polygons: p.use_smooth = False
mat = bpy.data.materials.new("stone"); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.27, 0.28, 0.30, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
mesh.materials.append(mat)
ground = bpy.data.objects.new("ground", bpy.data.meshes.new("g")); scene.collection.objects.link(ground)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4); bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -0.2)); bm.to_mesh(ground.data); bm.free()
gm = bpy.data.materials.new("grass"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.13, 0.35, 0.09, 1); ground.data.materials.append(gm)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(35)); scene.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (3.2, -3.2, 2.8); cam.rotation_euler = (math.radians(60), 0, math.radians(45))
world = bpy.data.worlds.new("w"); world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.75, 0.95, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.8; scene.world = world
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.filepath = os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "assets", "renders", "smoke_test_rock.png")
bpy.ops.render.render(write_still=True)
print("RENDERED", scene.render.filepath, scene.render.engine)
