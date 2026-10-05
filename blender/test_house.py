"""Test scene: a small toon-shaded house.

Run in Blender (4.x): Scripting tab -> Open -> Run Script,
or headless: blender --background --python blender/test_house.py
Clears the current scene first.
"""
import math
import bpy

# ---------- reset ----------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for item in list(block):
        block.remove(item)


def toon_material(name, color):
    """Flat two-step toon shading via Shader-to-RGB + constant color ramp."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*color, 1)
    to_rgb = nodes.new("ShaderNodeShaderToRGB")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*[c * 0.55 for c in color], 1)
    ramp.color_ramp.elements[1].position = 0.35
    ramp.color_ramp.elements[1].color = (*color, 1)
    emit = nodes.new("ShaderNodeEmission")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def box(name, size, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cut(target, cutter):
    mod = target.modifiers.new("cut_" + cutter.name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter)


M = {
    "wall": toon_material("Wall", (0.92, 0.88, 0.80)),
    "trim": toon_material("Trim", (0.30, 0.22, 0.18)),
    "roof": toon_material("Roof", (0.55, 0.18, 0.15)),
    "glass": toon_material("Glass", (0.55, 0.78, 0.95)),
    "grass": toon_material("Grass", (0.45, 0.75, 0.40)),
    "stone": toon_material("Stone", (0.55, 0.55, 0.58)),
}

W, D, H, T = 8.0, 6.0, 3.2, 0.25  # width, depth, wall height, wall thickness

# ---------- ground + foundation ----------
bpy.ops.mesh.primitive_plane_add(size=40)
ground = bpy.context.active_object
ground.name = "Ground"
ground.data.materials.append(M["grass"])
box("Foundation", (W + 0.4, D + 0.4, 0.3), (0, 0, 0.15), M["stone"])

# ---------- walls (hollow shell) ----------
shell = box("Walls", (W, D, H), (0, 0, 0.3 + H / 2), M["wall"])
cut(shell, box("inner", (W - 2 * T, D - 2 * T, H), (0, 0, 0.3 + H / 2 + T), M["wall"]))

# door + windows
cut(shell, box("door_hole", (1.1, 1, 2.2), (0, -D / 2, 0.3 + 1.1), M["wall"]))
win_z = 0.3 + 1.8
for x in (-2.6, 2.6):
    cut(shell, box("win_front", (1.2, 1, 1.1), (x, -D / 2, win_z), M["wall"]))
    cut(shell, box("win_back", (1.2, 1, 1.1), (x, D / 2, win_z), M["wall"]))
for y in (-1.2, 1.2):
    cut(shell, box("win_side", (1, 1.0, 1.1), (W / 2, y, win_z), M["wall"]))

box("Door", (1.1, 0.08, 2.2), (0, -D / 2 + 0.05, 0.3 + 1.1), M["trim"])
for x in (-2.6, 2.6):
    box("Glass", (1.2, 0.05, 1.1), (x, -D / 2 + T / 2, win_z), M["glass"])
    box("Glass", (1.2, 0.05, 1.1), (x, D / 2 - T / 2, win_z), M["glass"])
    box("Sill", (1.4, 0.3, 0.1), (x, -D / 2 - 0.05, win_z - 0.6), M["trim"])
for y in (-1.2, 1.2):
    box("Glass", (0.05, 1.0, 1.1), (W / 2 - T / 2, y, win_z), M["glass"])

# porch step
box("Step", (1.8, 0.8, 0.2), (0, -D / 2 - 0.5, 0.1), M["stone"])

# ---------- gable roof ----------
top = 0.3 + H
overhang, pitch = 0.5, math.radians(35)
half_span = D / 2 + overhang
slope_len = half_span / math.cos(pitch)
ridge_h = half_span * math.tan(pitch)
for side in (-1, 1):
    panel = box("Roof", (W + 2 * overhang, slope_len, 0.15),
                (0, side * half_span / 2, top + ridge_h / 2), M["roof"])
    panel.rotation_euler.x = -side * pitch

# gable triangles fill the wall ends under the roof
verts = [(0, -D / 2, 0), (0, D / 2, 0), (0, 0, (D / 2) * math.tan(pitch))]
for x in (-W / 2, W / 2):
    mesh = bpy.data.meshes.new("Gable")
    mesh.from_pydata([(x, y, top + z) for _, y, z in verts], [], [(0, 1, 2)])
    gable = bpy.data.objects.new("Gable", mesh)
    gable.data.materials.append(M["wall"])
    bpy.context.collection.objects.link(gable)
    sol = gable.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = T

box("Chimney", (0.7, 0.7, 2.4), (2.4, 1.2, top + 1.4), M["stone"])

# ---------- light + camera ----------
bpy.ops.object.light_add(type="SUN", location=(10, -10, 15))
sun = bpy.context.active_object
sun.data.energy = 4
sun.rotation_euler = (math.radians(50), 0, math.radians(35))

bpy.ops.object.camera_add(location=(16, -19, 9))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(72), 0, math.radians(40))
bpy.context.scene.camera = cam

world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.80, 0.95, 1)

# EEVEE's internal name changed between versions (EEVEE_NEXT in 4.2-4.x, EEVEE in 5.x)
engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
# "Standard" keeps toon colors flat and true instead of the washed-out default (AgX)
bpy.context.scene.view_settings.view_transform = "Standard"
print("Test house built.")
