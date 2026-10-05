"""Sera - base body blockout (adult elf warrior, ~1.75 m tall).

A blockout is a rough sculpt built from simple shapes. It nails proportions
before any detailed modeling. This one uses metaballs: blobby primitives that
melt into each other where they overlap, which suits organic bodies.

Run in Blender (5.x): Scripting tab -> Open -> Run Script.
Clears the current scene first.

Tweak the PROPORTIONS block below and re-run to reshape her.
All units are meters. Blender is Z-up; she faces -Y (toward the front view).
"""
import math
import bpy
from mathutils import Vector

# ---------- proportions (edit these) ----------
P = {
    "hip_width": 0.21,     # half-distance between hip blobs
    "hip_size": 0.15,      # how big the hip/pelvis masses are
    "butt_size": 0.16,     # glute volume
    "butt_push": 0.095,     # how far the glutes stick out backward
    "chest_size": 0.12,    # bust volume
    "chest_spread": 0.085, # half-distance between the two
    "waist": 0.095,        # waist thickness (smaller = narrower)
    "thigh": 0.15,        # upper thigh thickness
    "calf": 0.085,
    "shoulder_width": 0.19,
    "arm": 0.062,
}

# ---------- reset ----------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for block in (bpy.data.meshes, bpy.data.metaballs, bpy.data.materials,
              bpy.data.lights, bpy.data.cameras, bpy.data.curves):
    for item in list(block):
        block.remove(item)

mb = bpy.data.metaballs.new("SeraMeta")
mb.resolution = 0.012          # viewport detail (smaller = smoother, slower)
mb.render_resolution = 0.008
mb.threshold = 0.6
meta_obj = bpy.data.objects.new("SeraMeta", mb)
bpy.context.collection.objects.link(meta_obj)

# A metaball's visible surface sits at roughly 0.58x its radius when alone,
# so helpers below take the *visible* radius you want and scale it up.
VIS = 1 / 0.58


def blob(co, r, sx=1.0, sy=1.0, sz=1.0, stiff=2.0):
    """Ellipsoid blob. r = visible radius, sx/sy/sz stretch it per axis."""
    el = mb.elements.new(type="ELLIPSOID")
    el.co = co
    el.radius = r * VIS
    el.size_x, el.size_y, el.size_z = sx, sy, sz
    el.stiffness = stiff
    return el


def limb(a, b, ra, rb, steps=None):
    """Chain of balls from point a to b, radius tapering ra -> rb."""
    a, b = Vector(a), Vector(b)
    steps = steps or max(3, int((b - a).length / (min(ra, rb) * 0.6)))
    for i in range(steps + 1):
        t = i / steps
        # chained balls overlap and fatten each other; 0.62 compensates
        blob(a.lerp(b, t), (ra + (rb - ra) * t) * 0.62, stiff=1.6)


def mirrored(fn):
    """Call fn(side) for left (-1) and right (+1)."""
    for side in (-1, 1):
        fn(side)


# ---------- head + neck ----------
blob((0, 0, 1.635), 0.098, sx=0.85, sy=1.0, sz=1.1)       # cranium
blob((0, -0.03, 1.575), 0.065, sx=0.9, sy=0.9, sz=1.0)     # jaw / chin
limb((0, 0.005, 1.54), (0, 0.0, 1.43), 0.075, 0.09)       # neck

# pointed elf ears: thin tapering chain angled up and back
mirrored(lambda s: limb((s * 0.075, 0.015, 1.615), (s * 0.19, 0.075, 1.665), 0.04, 0.008, steps=12))

# ---------- torso ----------
blob((0, 0.0, 1.38), 0.12, sx=1.55, sy=0.75, sz=0.55)      # shoulder girdle
blob((0, 0.01, 1.27), 0.12, sx=1.15, sy=0.78, sz=0.9)      # ribcage
blob((0, 0.01, 1.12), P["waist"], sx=1.15, sy=0.82, sz=1.1)  # waist
blob((0, 0.01, 1.00), 0.13, sx=1.35, sy=0.85, sz=0.8)      # belly / lower abdomen

# bust
mirrored(lambda s: blob((s * P["chest_spread"], -0.085, 1.255), P["chest_size"] * 0.62,
                        sx=1.0, sy=0.95, sz=0.92))

# ---------- pelvis, hips, glutes ----------
blob((0, 0.02, 0.92), 0.14, sx=1.45, sy=0.9, sz=0.75)      # pelvis core
mirrored(lambda s: blob((s * P["hip_width"] * 0.62, 0.02, 0.90), P["hip_size"] * 0.62,
                        sx=1.0, sy=0.95, sz=1.05))          # hip shelf
mirrored(lambda s: blob((s * 0.075, P["butt_push"], 0.865), P["butt_size"] * 0.62,
                        sx=1.0, sy=1.0, sz=0.95))           # glutes

# ---------- legs ----------
def leg(s):
    hip = (s * 0.115, 0.015, 0.85)
    knee = (s * 0.10, 0.0, 0.49)
    ankle = (s * 0.085, 0.025, 0.08)
    limb(hip, knee, P["thigh"], P["thigh"] * 0.55)
    blob((s * 0.135, 0.01, 0.75), P["thigh"] * 0.68, sx=1.0, sy=1.0, sz=1.5)  # outer-thigh fullness
    limb(knee, ankle, P["calf"] * 0.85, P["calf"] * 0.45)
    blob((s * 0.097, 0.025, 0.36), P["calf"] * 0.62, sx=1.0, sy=1.05, sz=1.8)  # calf muscle
    limb(ankle, (s * 0.09, -0.12, 0.025), 0.035, 0.025)                        # foot


mirrored(leg)

# ---------- arms (relaxed A-pose, good for rigging later) ----------
def arm(s):
    shoulder = (s * P["shoulder_width"], 0.0, 1.40)
    elbow = (s * 0.29, 0.02, 1.13)
    wrist = (s * 0.36, -0.01, 0.89)
    blob((s * (P["shoulder_width"] - 0.02), 0.0, 1.385), P["arm"] * 0.8, sx=1.0, sy=1.0, sz=1.2, stiff=1.4)   # deltoid
    limb(shoulder, elbow, P["arm"], P["arm"] * 0.75)
    limb(elbow, wrist, P["arm"] * 0.8, P["arm"] * 0.55)
    blob((s * 0.385, -0.015, 0.83), 0.04, sx=0.6, sy=1.0, sz=1.6)  # hand paddle


mirrored(arm)

# ---------- convert metaballs -> real mesh ----------
bpy.context.view_layer.objects.active = meta_obj
meta_obj.select_set(True)
bpy.ops.object.convert(target="MESH")
body = bpy.context.active_object
body.name = "Sera_Body"
bpy.ops.object.shade_smooth()

# ---------- toon material + outline ----------
def toon_material(name, color, shade=0.62, edge=0.42):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*color, 1)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")   # EEVEE only: turns lighting into a value
    ramp = nt.nodes.new("ShaderNodeValToRGB")         # ...which we snap into 2 flat tones
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (*[c * shade for c in color], 1)
    ramp.color_ramp.elements[1].position = edge
    ramp.color_ramp.elements[1].color = (*color, 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


skin = toon_material("Skin", (0.80, 0.58, 0.46))    # warm tan, like the reference
body.data.materials.append(skin)

# Outline trick ("inverted hull"): a slightly fatter copy of the mesh with
# flipped normals and backfaces hidden, so only a dark rim shows around edges.
outline = bpy.data.materials.new("Outline")
outline.use_nodes = True
outline.use_backface_culling = True
nt = outline.node_tree
nt.nodes.clear()
o_out = nt.nodes.new("ShaderNodeOutputMaterial")
o_emit = nt.nodes.new("ShaderNodeEmission")
o_emit.inputs["Color"].default_value = (0.12, 0.07, 0.07, 1)
nt.links.new(o_emit.outputs["Emission"], o_out.inputs["Surface"])
body.data.materials.append(outline)

sol = body.modifiers.new("Outline", "SOLIDIFY")
sol.thickness = 0.004
sol.offset = 1
sol.use_flip_normals = True
sol.material_offset = 1          # use the 2nd material slot (Outline) for the shell

# ---------- stage: ground, light, camera ----------
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.2, fill_type="NGON")
floor = bpy.context.active_object
floor.name = "Floor"
floor.data.materials.append(toon_material("Floor", (0.72, 0.85, 0.72)))

bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
sun = bpy.context.active_object
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(30))

bpy.ops.object.camera_add(location=(1.6, -4.2, 1.15))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(88), 0, math.radians(21))
cam.data.lens = 50
bpy.context.scene.camera = cam

world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.80, 0.85, 0.90, 1)

engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
bpy.context.scene.view_settings.view_transform = "Standard"

print("Sera blockout built:", len(body.data.vertices), "verts")
