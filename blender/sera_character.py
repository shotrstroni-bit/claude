"""Sera - rigged, posed character base built on the MakeHuman body.

What this builds:
  - A realistic female body (MakeHuman hm08 base mesh, CC0) shaped by the
    BODY sliders below: wide hips, thick thighs, big butt and bust, elf ears.
  - Every slider is also a Shape Key, so you can drag them live in
    Properties > Object Data (green triangle) > Shape Keys.
  - A game-ready skeleton (spine, arms, fingers, legs, toes, plus breast
    bones for jiggle physics) with skin weights.
  - A standing contrapposto pose: weight on one leg, hand on hip.
  - Toon shading + ink outline that work in both EEVEE and Cycles.

Run in Blender (4.2+ / 5.x): Scripting tab -> Open this file -> Run Script.
Needs data/sera_base.npz next to this script. Clears the scene first.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

# =====================================================================
# BODY SLIDERS - edit, then re-run (Alt+P) so the skeleton follows too.
# 0 = MakeHuman default woman, 1 = full effect. Most go to 2 for extreme.
# =====================================================================
BODY = {
    "Weight": 0.2,          # overall softness/fullness
    "Muscle": 0.15,
    "Height": 0.35,
    "Breast Size": 1.1,
    "Breast Perky": 1.3,
    "Breast Lift": 0.9,
    "Hips Wide": 1.15,
    "Butt Big": 1.3,
    "Waist Narrow": 1.1,
    "Belly Flat": 1.0,
    "Thighs Thick": 1.35,
    "Calves": 0.35,
    "Legs Long": 0.45,
    "Slim Shoulders": 0.35,
    "Slim Arms": 0.3,
    "Slim Neck": 0.35,
    "Small Hands Feet": 0.25,
    "Face Soft": 0.5,
    "Lips Full": 0.45,
    "Eyes Big": 0.6,
    "Eyes Feline": 0.35,
    "Elf Ears": 1.0,
}

# Each slider = sum of MakeHuman targets (path, factor). l/r pairs expand.
SLIDER_TARGETS = {
    "Weight": [("macrodetails/universal-female-young-averagemuscle-maxweight", 1),
               ("macrodetails/universal-female-young-averagemuscle-averageweight", -1)],
    "Muscle": [("macrodetails/universal-female-young-maxmuscle-averageweight", 1),
               ("macrodetails/universal-female-young-averagemuscle-averageweight", -1)],
    "Height": [("macrodetails/height/female-young-averagemuscle-averageweight-maxheight", 1)],
    "Breast Size": [("breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness", 1)],
    "Breast Perky": [("breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness", 1),
                     ("breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness", -1)],
    "Breast Lift": [("breast/breast-trans-up", 1)],
    "Hips Wide": [("measure/measure-hips-circ-incr", 1), ("hip/hip-scale-horiz-incr", 0.4),
                  ("hip/hip-scale-depth-incr", 0.2)],
    "Butt Big": [("buttocks/buttocks-volume-incr", 1), ("pelvis/pelvis-tone-incr", 0.3)],
    "Waist Narrow": [("measure/measure-waist-circ-decr", 1), ("measure/measure-underbust-circ-decr", 0.3)],
    "Belly Flat": [("stomach/stomach-pregnant-decr", 1)],
    "Thighs Thick": [("measure/measure-thigh-circ-incr", 0.8), ("armslegs/*-upperleg-fat-incr", 0.5)],
    "Calves": [("measure/measure-calf-circ-incr", 1), ("armslegs/*-lowerleg-fat-incr", 0.4)],
    "Legs Long": [("measure/measure-upperleg-height-incr", 0.8), ("measure/measure-lowerleg-height-incr", 0.6),
                  ("measure/measure-napetowaist-dist-decr", 0.4)],
    "Slim Shoulders": [("measure/measure-shoulder-dist-decr", 1), ("torso/torso-scale-horiz-decr", 0.3)],
    "Slim Arms": [("measure/measure-upperarm-circ-decr", 1), ("measure/measure-wrist-circ-decr", 0.6)],
    "Slim Neck": [("measure/measure-neck-circ-decr", 1), ("neck/neck-scale-vert-incr", 0.5),
                  ("measure/measure-ankle-circ-decr", 0.5)],
    "Small Hands Feet": [("armslegs/*-hand-scale-decr", 1), ("armslegs/*-foot-scale-decr", 1)],
    "Face Soft": [("head/head-oval", 1), ("chin/chin-width-decr", 0.6), ("cheek/*-cheek-bones-incr", 0.6),
                  ("nose/nose-scale-horiz-decr", 0.4)],
    "Lips Full": [("mouth/mouth-lowerlip-volume-incr", 1), ("mouth/mouth-upperlip-volume-incr", 1)],
    "Eyes Big": [("eyes/*-eye-scale-incr", 1)],
    "Eyes Feline": [("eyes/*-eye-corner1-up", 1), ("eyes/*-eye-corner2-up", 1)],
    "Elf Ears": [("ears/*-ear-shape-pointed", 1), ("ears/*-ear-scale-vert-incr", 1),
                 ("ears/*-ear-scale-incr", 0.5), ("ears/*-ear-rot-backward", 0.6),
                 ("ears/*-ear-trans-up", 0.3)],
}
# Always baked into the base shape (adult woman, ~25 years, idealized build).
BASE_TARGETS = [
    ("macrodetails/universal-female-young-averagemuscle-averageweight", 1),
    ("macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions", 1),
]

COLORS = {
    "skin": ((0.50, 0.26, 0.16), (0.30, 0.13, 0.09)),   # (lit, shadow) warm caramel (linear values)
    "hair": ((0.58, 0.44, 0.72), (0.34, 0.22, 0.48)),   # lavender
    "iris": (0.85, 0.45, 0.15),                         # amber
    "outline": (0.16, 0.08, 0.08),
}
LIGHT_DIR = Vector((0.45, -0.65, 0.6)).normalized()     # toon light, world space
MH_TO_M = 0.1                                           # MakeHuman units are decimeters


# ---------------------------------------------------------------- data
def find_data():
    here = []
    try:
        here.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath:
            here.append(os.path.dirname(bpy.path.abspath(t.filepath)))
    if bpy.data.filepath:
        here.append(os.path.dirname(bpy.data.filepath))
    for h in here:
        for p in (os.path.join(h, "data", "sera_base.npz"), os.path.join(h, "sera_base.npz")):
            if os.path.exists(p):
                return p
    raise FileNotFoundError("Can't find data/sera_base.npz - keep it in a 'data' folder next to this script.")


D = np.load(find_data())
BASE = D["base_verts"].astype(np.float64)
N = len(BASE)


def target_delta(path):
    out = np.zeros((N, 3))
    out[D[f"target:{path}:index"]] = D[f"target:{path}:vector"] * 1e-3
    return out


def combo_delta(items):
    total = np.zeros((N, 3))
    for path, f in items:
        for p in ([path.replace("*", s) for s in "lr"] if "*" in path else [path]):
            total += f * target_delta(p)
    return total


def mh_to_blender(a):
    """MakeHuman is Y-up facing +Z; Blender is Z-up and she faces -Y."""
    return np.stack([a[:, 0], -a[:, 2], a[:, 1]], axis=1) * MH_TO_M


# ---------------------------------------------------------------- reset
bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.lights,
              bpy.data.cameras, bpy.data.metaballs, bpy.data.curves):
    for item in list(block):
        block.remove(item)

# ---------------------------------------------------------------- shapes
basis_mh = BASE + combo_delta(BASE_TARGETS)
slider_deltas = {k: combo_delta(v) for k, v in SLIDER_TARGETS.items()}
final_mh = basis_mh + sum(BODY[k] * slider_deltas[k] for k in BODY)

basis = mh_to_blender(basis_mh)
final = mh_to_blender(final_mh)
deltas = {k: mh_to_blender(v) for k, v in slider_deltas.items()}

body_faces = D["faces_body"]
ground = final[np.unique(body_faces)][:, 2].min()
basis[:, 2] -= ground
final[:, 2] -= ground



def joint(name):
    return Vector(final[D[f"joint:{name}"]].mean(0))


# ---------------------------------------------------------------- materials
def toon_material(name, lit, shadow, highlight=None):
    """Two-tone toon shading from a fixed light direction (engine independent)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    light = nt.nodes.new("ShaderNodeCombineXYZ")
    light.inputs[0].default_value, light.inputs[1].default_value, light.inputs[2].default_value = LIGHT_DIR
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (*shadow, 1)
    ramp.color_ramp.elements[1].position = 0.12
    ramp.color_ramp.elements[1].color = (*lit, 1)
    if highlight:
        e = ramp.color_ramp.elements.new(0.82)
        e.color = (*highlight, 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(light.outputs[0], dot.inputs[1])
    nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


def outline_material():
    """Inverted-hull ink line: show only the shell faces that point at the camera."""
    mat = bpy.data.materials.new("Outline")
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    ink = nt.nodes.new("ShaderNodeEmission")
    ink.inputs["Color"].default_value = (*COLORS["outline"], 1)
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(ink.outputs[0], mix.inputs[1])     # Backfacing 0 -> ink (the rim)
    nt.links.new(clear.outputs[0], mix.inputs[2])   # Backfacing 1 -> see-through
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def add_outline(obj, thickness):
    obj.data.materials.append(OUTLINE)
    sol = obj.modifiers.new("Outline", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1
    sol.use_rim = False
    sol.use_flip_normals = True
    sol.material_offset = len(obj.data.materials) - 1


skin_lit, skin_shadow = COLORS["skin"]
SKIN = toon_material("Skin", skin_lit, skin_shadow)
HAIR = toon_material("Hair", *COLORS["hair"], highlight=(0.78, 0.66, 0.90))
OUTLINE = outline_material()

# ---------------------------------------------------------------- mesh
used = np.unique(body_faces)
remap = -np.ones(N, dtype=np.int64)
remap[used] = np.arange(len(used))
faces = body_faces
uvs = D["uvs_body"]

mesh = bpy.data.meshes.new("Sera_Body")
mesh.from_pydata(basis[used].tolist(), [], remap[faces].tolist())
uv_layer = mesh.uv_layers.new(name="UVMap")
uv_layer.data.foreach_set("uv", uvs.reshape(-1))
mesh.materials.append(SKIN)
mesh.polygons.foreach_set("use_smooth", np.ones(len(faces), bool))
mesh.update()

body = bpy.data.objects.new("Sera_Body", mesh)
bpy.context.collection.objects.link(body)

# shape keys: one per slider, preset to Sera's values
body.shape_key_add(name="Basis")
for name, delta in deltas.items():
    key = body.shape_key_add(name=name, from_mix=False)
    key.data.foreach_set("co", (basis[used] + delta[used]).reshape(-1))
    key.slider_min, key.slider_max = -1.0, 2.0
    key.value = BODY[name]

# ---------------------------------------------------------------- skeleton
names = [str(n) for n in D["bone_names"]]
parents = [str(p) for p in D["bone_parents"]]
heads = [str(h) for h in D["bone_heads"]]
tails = [str(t) for t in D["bone_tails"]]
wb, wv = D["weight_bones"], D["weight_values"].astype(np.float32)

arm_data = bpy.data.armatures.new("Sera_Rig")
arm_data.display_type = "STICK"
rig = bpy.data.objects.new("Sera_Rig", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for name, h, t in zip(names, heads, tails):
    b = eb.new(name)
    if name.startswith("breast"):
        idx = names.index(name)
        vids = np.where((wb[:, 0] == idx) & (wv[:, 0] > 0.5))[0]
        pts = final[vids]
        c = pts.mean(0)
        front = pts[:, 1].min()                 # most forward point (-Y)
        b.head = Vector((c[0], c[1] + 0.05, c[2] + 0.01))
        b.tail = Vector((c[0], front, c[2]))
    else:
        b.head, b.tail = joint(h), joint(t)
    b.roll = 0
for name, p in zip(names, parents):
    if p:
        eb[name].parent = eb[p]
        eb[name].use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# skin weights -> vertex groups
for i, name in enumerate(names):
    vg = body.vertex_groups.new(name=name)
    for k in range(4):
        sel = np.where((wb[used, k] == i) & (wv[used, k] > 0.001))[0]
        for vi, w in zip(sel.tolist(), wv[used, k][sel].tolist()):
            vg.add([vi], w, "ADD")

body.parent = rig
mod = body.modifiers.new("Armature", "ARMATURE")
mod.object = rig
sub = body.modifiers.new("Subdivision", "SUBSURF")
sub.levels, sub.render_levels = 1, 2
add_outline(body, 0.0035)


# ---------------------------------------------------------------- eyes + hair
def eye_material():
    mat = bpy.data.materials.new("Eye")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].color = (0.95, 0.93, 0.90, 1)                  # sclera
    els[1].position = 0.80
    els[1].color = (*COLORS["iris"], 1)                   # iris
    els.new(0.92).color = (0.04, 0.02, 0.02, 1)           # pupil
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


EYE = eye_material()
for s in "lr":
    pts = final[np.unique(D[f"faces_{s}-eye"])]
    center = Vector(pts.mean(0))
    radius = float(np.linalg.norm(pts - pts.mean(0), axis=1).mean())
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=center)
    eye = bpy.context.active_object
    eye.name = f"Sera_Eye.{s.upper()}"
    eye.scale = (radius,) * 3
    look = (joint(f"{s}-eye-target") - center).normalized()
    eye.rotation_euler = Vector((0, 0, 1)).rotation_difference(look).to_euler()
    eye.data.materials.append(EYE)
    bpy.ops.object.shade_smooth()

# Hair cap: copy the scalp faces above a hairline and puff them outward.
head_c = (joint("head") + joint("head-2")) / 2
eye_z = (joint("l-eye").z + joint("r-eye").z) / 2
head_idx = names.index("head")


def vertex_normals(co, quads):
    a, b, c, d = (co[quads[:, i]] for i in range(4))
    fn = np.cross(c - a, d - b)
    vn = np.zeros_like(co)
    for i in range(4):
        np.add.at(vn, quads[:, i], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)


def hairline(rel):
    """Height (relative to head center) where hair starts, by direction around the head."""
    ang = np.degrees(np.abs(np.arctan2(rel[:, 0], -rel[:, 1])))   # 0 = face, 180 = back
    front, side, back = eye_z - head_c.z + 0.042, eye_z - head_c.z + 0.012, eye_z - head_c.z - 0.085
    return np.interp(ang, [0, 35, 70, 105, 180], [front, front, side, side, back])


vn = vertex_normals(final, body_faces)
rel = final - np.array(head_c)
in_cap = (rel[:, 2] > hairline(rel)) & (wb[:, 0] == head_idx) & (np.linalg.norm(rel, axis=1) < 0.16)
cap_faces = body_faces[in_cap[body_faces].all(1)]
cap_v = np.unique(cap_faces)
crown = np.clip(rel[cap_v, 2] / 0.1, 0, 1)
cap_co = final[cap_v] + vn[cap_v] * (0.008 + 0.010 * crown)[:, None]
# Quads make a stair-stepped edge; snap the edge vertices onto the smooth hairline.
others = body_faces[~in_cap[body_faces].all(1)]
edge = np.isin(cap_v, np.unique(others))
cap_co[edge, 2] = head_c.z + hairline(rel[cap_v[edge]]) - 0.004
cmap = -np.ones(N, dtype=np.int64)
cmap[cap_v] = np.arange(len(cap_v))
hmesh = bpy.data.meshes.new("Sera_Hair")
hmesh.from_pydata(cap_co.tolist(), [], cmap[cap_faces].tolist())
hmesh.polygons.foreach_set("use_smooth", np.ones(len(cap_faces), bool))
hmesh.materials.append(HAIR)
hair = bpy.data.objects.new("Sera_Hair", hmesh)
bpy.context.collection.objects.link(hair)
hsub = hair.modifiers.new("Subdivision", "SUBSURF")
hsub.levels = hsub.render_levels = 1
add_outline(hair, 0.003)

# Bun high on the back of the head
top = Vector(final[cap_v][np.argmax(final[cap_v][:, 2])])
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1,
                                     location=top + Vector((0, 0.07, -0.005)))
bun = bpy.context.active_object
bun.name = "Sera_HairBun"
bun.scale = (0.075, 0.068, 0.066)
bun.data.materials.append(HAIR)
bpy.ops.object.shade_smooth()
add_outline(bun, 0.003)

# Two long side locks framing the face (tapered bevel curves -> mesh)
locks = []
for s in (-1, 1):
    eye = joint(("l" if s > 0 else "r") + "-eye")
    pts = [eye + Vector((s * 0.020, 0.010, 0.058)),
           eye + Vector((s * 0.042, 0.004, 0.012)),
           eye + Vector((s * 0.050, 0.010, -0.050)),
           eye + Vector((s * 0.050, 0.004, -0.105))]
    cd = bpy.data.curves.new(f"Lock{s}", "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = 0.014
    cd.bevel_resolution = 3
    sp = cd.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (*co, 1)
    sp.use_endpoint_u = True
    sp.order_u = 3
    for i, p in enumerate(sp.points):
        p.radius = 1.0 - 0.8 * (i / (len(pts) - 1)) ** 1.5
    lock = bpy.data.objects.new(f"Sera_Lock.{'L' if s > 0 else 'R'}", cd)
    bpy.context.collection.objects.link(lock)
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    bpy.context.view_layer.objects.active = lock
    lock.select_set(True)
    bpy.ops.object.convert(target="MESH")
    lock = bpy.context.active_object
    lock.data.materials.append(HAIR)
    bpy.ops.object.shade_smooth()
    add_outline(lock, 0.002)
    locks.append(lock)

# parent eyes + bun to the head bone so they follow the pose
for ob in [bpy.data.objects["Sera_Eye.L"], bpy.data.objects["Sera_Eye.R"], hair, bun, *locks]:
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = "head"
    bpy.context.view_layer.update()
    ob.matrix_world = mw


# ---------------------------------------------------------------- pose helpers
def update():
    bpy.context.view_layer.update()


def rotate(bone, axis, deg):
    """Rotate a bone around its head, axis in world terms: X=side, Y=front/back, Z=up."""
    pb = rig.pose.bones[bone]
    m = pb.matrix.copy()
    pivot = m.translation.copy()
    r = Matrix.Rotation(math.radians(deg), 4, axis)
    pb.matrix = Matrix.Translation(pivot) @ r @ Matrix.Translation(-pivot) @ m
    update()


def shift(bone, offset):
    pb = rig.pose.bones[bone]
    m = pb.matrix.copy()
    m.translation += Vector(offset)
    pb.matrix = m
    update()


def aim(bone, target):
    """Swing a bone so its tail points at target (shortest rotation)."""
    pb = rig.pose.bones[bone]
    head, tail = pb.head.copy(), pb.tail.copy()
    q = (tail - head).rotation_difference(Vector(target) - head)
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ m
    update()


def two_bone_ik(upper, lower, target, pole):
    """Place elbow/knee so the chain reaches target, bending toward pole."""
    s = rig.pose.bones[upper].head.copy()
    a = rig.pose.bones[upper].length
    b = rig.pose.bones[lower].length
    t = Vector(target)
    d = min((t - s).length, (a + b) * 0.999)
    u = (t - s).normalized()
    v = (Vector(pole) - s)
    v = (v - u * v.dot(u)).normalized()
    cos_a = (a * a + d * d - b * b) / (2 * a * d)
    elbow = s + a * (u * cos_a + v * math.sqrt(max(0, 1 - cos_a * cos_a)))
    aim(upper, elbow)
    aim(lower, t)


def surface_x(side, z, y_band=(-0.2, 0.2)):
    """Outermost skin x at height z on one side of the posed body."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    co = np.empty(len(ev.data.vertices) * 3)
    ev.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ np.array(body.matrix_world)[:3, :3].T + np.array(body.matrix_world)[:3, 3]
    m = (np.abs(co[:, 2] - z) < 0.015) & (co[:, 1] > y_band[0]) & (co[:, 1] < y_band[1])
    xs = co[m, 0]
    return (xs.max() if side > 0 else xs.min()), co


# ---------------------------------------------------------------- pose: contrapposto
# Weight on her right leg (-X). Right hip rises, left hip drops, shoulders
# counter-tilt, relaxed left knee bends forward. Right hand on hip.
update()
shift("hips", (-0.03, 0, 0))
rotate("hips", "Y", 7)           # pelvis tilt: right hip up
rotate("hips", "X", 5)           # anterior tilt: butt back, small of back arched
rotate("hips", "Z", 6)           # quarter-turn of the pelvis
rotate("thigh.R", "Y", -11)      # standing leg in under the body
rotate("thigh.R", "X", -4)
rotate("thigh.L", "Y", 4)        # relaxed leg drifts in
rotate("thigh.L", "X", -14)      # ...and forward
rotate("thigh.L", "Z", 10)       # knee turned out a touch
rotate("shin.L", "X", 20)        # knee bend
rotate("foot.R", "Y", 4)         # keep feet flat after the hip tilt
rotate("foot.L", "Y", -11)
rotate("foot.L", "X", 6)         # heel lifts, weight on the ball of the foot
rotate("spine", "X", -4)         # arch
rotate("spine1", "Y", -4)        # counter-tilt up the spine
rotate("chest", "Y", -5)
rotate("chest", "X", -3)         # chest out
rotate("chest", "Z", -5)
rotate("upper_chest", "Y", -2)
rotate("neck", "Y", 3)
rotate("head", "Y", 6)           # head tilt
rotate("head", "Z", -8)
rotate("head", "X", 4)           # chin slightly down

# arms - hand on right hip, left arm relaxed beside the hip
hip_z = (rig.pose.bones["hips"].head.z + rig.pose.bones["spine1"].head.z) / 2
x_r, _ = surface_x(-1, hip_z)
two_bone_ik("upper_arm.R", "forearm.R", (x_r - 0.03, 0.035, hip_z + 0.03),
            pole=rig.pose.bones["upper_arm.R"].head + Vector((-0.4, 0.25, -0.1)))
aim("hand.R", rig.pose.bones["hand.R"].head + Vector((0.25, -0.55, -0.6)))

x_l, _ = surface_x(1, hip_z - 0.12)
two_bone_ik("upper_arm.L", "forearm.L", (x_l + 0.06, -0.01, hip_z - 0.13),
            pole=rig.pose.bones["upper_arm.L"].head + Vector((0.1, 0.4, -0.3)))
aim("hand.L", rig.pose.bones["hand.L"].head + Vector((0.08, -0.08, -1)))

# relaxed finger curl (each joint bends toward the palm a little)
for s in "LR":
    hand = rig.pose.bones[f"hand.{s}"]
    for f in range(1, 6):
        for k in range(1, 4):
            pb = rig.pose.bones[f"finger{f}_{k}.{s}"]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler.x += math.radians(12 if f > 1 else 6)
update()

# plant the lowest foot on the floor
_, co = surface_x(1, 0.5, (-9, 9))
rig.location.z -= co[:, 2].min()
update()

# ---------------------------------------------------------------- stage
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=0.9, fill_type="NGON")
floor = bpy.context.active_object
floor.name = "Floor"
floor.data.materials.append(toon_material("Floor", (0.62, 0.78, 0.62), (0.50, 0.64, 0.50)))

bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
sun = bpy.context.active_object
sun.data.energy = 3
sun.rotation_euler = Vector((0, 0, 1)).rotation_difference(LIGHT_DIR).to_euler()

bpy.ops.object.camera_add(location=(1.2, -4.6, 1.05))
cam = bpy.context.active_object
cam.data.lens = 55
direction = Vector((0, 0, 0.88)) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam

world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.86, 0.90, 0.95, 1)

engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
bpy.context.scene.view_settings.view_transform = "Standard"

for ob in bpy.context.selected_objects:
    ob.select_set(False)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
print("Sera built:", len(used), "verts,", len(names), "bones")
