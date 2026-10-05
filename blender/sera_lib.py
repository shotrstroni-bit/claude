"""Shared building blocks for the game's characters.

Used by sera_character.py and sera_anim_test.py - keep this file in the
same folder as them, with data/sera_base.npz next to it.

  build_human()   MakeHuman body + shape keys + skeleton + skin weights
  add_sera_face() eyes, hair cap, bun and side locks
  Rig             pose helpers in world terms, two-bone IK, keyframing
  toon / outline / ghost materials, scene reset, stage setup
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

LIGHT_DIR = Vector((0.45, -0.65, 0.6)).normalized()     # toon light, world space
MH_TO_M = 0.1                                           # MakeHuman units are decimeters

# ---------------------------------------------------------------- body definitions
# Each slider = sum of MakeHuman targets (path, factor). "*" expands to l and r.
SERA_BASE = [
    ("macrodetails/universal-female-young-averagemuscle-averageweight", 1),
    ("macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions", 1),
]
SERA_SLIDERS = {
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
MALE_BASE = [
    ("macrodetails/universal-male-young-averagemuscle-averageweight", 1),
    ("macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions", 1),
]
MALE_SLIDERS = {
    "Muscle": [("macrodetails/universal-male-young-maxmuscle-averageweight", 1),
               ("macrodetails/universal-male-young-averagemuscle-averageweight", -1)],
    "Height": [("macrodetails/height/male-young-averagemuscle-averageweight-maxheight", 1)],
}


# ---------------------------------------------------------------- data
def _find_data():
    here = [os.path.dirname(os.path.abspath(__file__))]
    for t in bpy.data.texts:
        if t.filepath:
            here.append(os.path.dirname(bpy.path.abspath(t.filepath)))
    if bpy.data.filepath:
        here.append(os.path.dirname(bpy.data.filepath))
    for h in here:
        for p in (os.path.join(h, "data", "sera_base.npz"), os.path.join(h, "sera_base.npz")):
            if os.path.exists(p):
                return p
    raise FileNotFoundError("Can't find data/sera_base.npz - keep it in a 'data' folder next to the scripts.")


D = np.load(_find_data())
BASE = D["base_verts"].astype(np.float64)
N = len(BASE)
BONE_NAMES = [str(n) for n in D["bone_names"]]


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
    """MakeHuman is Y-up facing +Z; Blender is Z-up and characters face -Y."""
    return np.stack([a[:, 0], -a[:, 2], a[:, 1]], axis=1) * MH_TO_M


# ---------------------------------------------------------------- scene
def reset_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.metaballs, bpy.data.curves, bpy.data.actions):
        for item in list(block):
            block.remove(item)


def deselect_all():
    for ob in bpy.context.selected_objects:
        ob.select_set(False)


def setup_stage(cam_location, look_at, floor_radius=0.9):
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=floor_radius, fill_type="NGON")
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.data.materials.append(toon_material("Floor", (0.62, 0.78, 0.62), (0.50, 0.64, 0.50)))

    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
    sun = bpy.context.active_object
    sun.data.energy = 3
    sun.rotation_euler = Vector((0, 0, 1)).rotation_difference(LIGHT_DIR).to_euler()

    bpy.ops.object.camera_add(location=cam_location)
    cam = bpy.context.active_object
    cam.data.lens = 55
    cam.rotation_euler = (Vector(look_at) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.86, 0.90, 0.95, 1)

    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    bpy.context.scene.view_settings.view_transform = "Standard"
    return cam


# ---------------------------------------------------------------- materials
def _toon_ramp(nt, lit, shadow, highlight=None):
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
        ramp.color_ramp.elements.new(0.82).color = (*highlight, 1)
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(light.outputs[0], dot.inputs[1])
    nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
    return ramp


def _set_blended(mat):
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"


def toon_material(name, lit, shadow, highlight=None):
    """Two-tone toon shading from a fixed light direction (engine independent)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    ramp = _toon_ramp(nt, lit, shadow, highlight)
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


def ghost_material(name, lit, shadow, opacity=0.55):
    """See-through toon material for the faceless 'ghost' partner."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    _set_blended(mat)
    nt = mat.node_tree
    nt.nodes.clear()
    ramp = _toon_ramp(nt, lit, shadow)
    emit = nt.nodes.new("ShaderNodeEmission")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = opacity
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def outline_material(color=(0.16, 0.08, 0.08), name="Outline"):
    """Inverted-hull ink line: show only the shell faces that point at the camera."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    _set_blended(mat)
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    ink = nt.nodes.new("ShaderNodeEmission")
    ink.inputs["Color"].default_value = (*color, 1)
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(ink.outputs[0], mix.inputs[1])     # Backfacing 0 -> ink (the rim)
    nt.links.new(clear.outputs[0], mix.inputs[2])   # Backfacing 1 -> see-through
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def add_outline(obj, thickness, material=None):
    obj.data.materials.append(material or outline_material())
    sol = obj.modifiers.new("Outline", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1
    sol.use_rim = False
    sol.use_flip_normals = True
    sol.material_offset = len(obj.data.materials) - 1


def eye_material(iris):
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
    els[1].color = (*iris, 1)                             # iris
    els.new(0.92).color = (0.04, 0.02, 0.02, 1)           # pupil
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- body + rig
class Human:
    """A built character: body mesh, rig, and the rest-shape vertices (world)."""

    def __init__(self, body, rig, final, used):
        self.body, self.rig, self.final, self.used = body, rig, final, used
        self.pose = Rig(rig, body)

    def verts_of(self, bones):
        """Body-mesh vertex indices whose strongest skin weight is one of these bones."""
        idx = [BONE_NAMES.index(b) for b in bones]
        return np.where(np.isin(D["weight_bones"][self.used, 0], idx))[0]

    def joint(self, name):
        """Rest position of a MakeHuman joint helper, in world space."""
        return self.rig.matrix_world @ Vector(self.final[D[f"joint:{name}"]].mean(0))


def build_human(name, base_targets, sliders, values, skin, outline, location=(0, 0, 0),
                outline_width=0.0035):
    """Body mesh with shape keys + skeleton + skin weights, standing on z=0."""
    basis_mh = BASE + combo_delta(base_targets)
    slider_deltas = {k: combo_delta(v) for k, v in sliders.items()}
    final_mh = basis_mh + sum(values.get(k, 0) * slider_deltas[k] for k in sliders)
    basis, final = mh_to_blender(basis_mh), mh_to_blender(final_mh)
    deltas = {k: mh_to_blender(v) for k, v in slider_deltas.items()}

    body_faces = D["faces_body"]
    ground = final[np.unique(body_faces)][:, 2].min()
    basis[:, 2] -= ground
    final[:, 2] -= ground

    used = np.unique(body_faces)
    remap = -np.ones(N, dtype=np.int64)
    remap[used] = np.arange(len(used))

    mesh = bpy.data.meshes.new(f"{name}_Body")
    mesh.from_pydata(basis[used].tolist(), [], remap[body_faces].tolist())
    mesh.uv_layers.new(name="UVMap").data.foreach_set("uv", D["uvs_body"].reshape(-1))
    mesh.materials.append(skin)
    mesh.polygons.foreach_set("use_smooth", np.ones(len(body_faces), bool))
    mesh.update()
    body = bpy.data.objects.new(f"{name}_Body", mesh)
    bpy.context.collection.objects.link(body)

    body.shape_key_add(name="Basis")
    for key_name, delta in deltas.items():
        key = body.shape_key_add(name=key_name, from_mix=False)
        key.data.foreach_set("co", (basis[used] + delta[used]).reshape(-1))
        key.slider_min, key.slider_max = -1.0, 2.0
        key.value = values.get(key_name, 0)

    # skeleton from joint helpers
    parents = [str(p) for p in D["bone_parents"]]
    heads = [str(h) for h in D["bone_heads"]]
    tails = [str(t) for t in D["bone_tails"]]
    wb, wv = D["weight_bones"], D["weight_values"].astype(np.float32)

    def joint_rest(j):
        return Vector(final[D[f"joint:{j}"]].mean(0))

    arm_data = bpy.data.armatures.new(f"{name}_Rig")
    arm_data.display_type = "STICK"
    rig = bpy.data.objects.new(f"{name}_Rig", arm_data)
    bpy.context.collection.objects.link(rig)
    deselect_all()
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for bname, h, t in zip(BONE_NAMES, heads, tails):
        b = eb.new(bname)
        if bname.startswith("breast"):
            idx = BONE_NAMES.index(bname)
            pts = final[np.where((wb[:, 0] == idx) & (wv[:, 0] > 0.5))[0]]
            c = pts.mean(0)
            b.head = Vector((c[0], c[1] + 0.05, c[2] + 0.01))
            b.tail = Vector((c[0], pts[:, 1].min(), c[2]))
        else:
            b.head, b.tail = joint_rest(h), joint_rest(t)
        b.roll = 0
    for bname, p in zip(BONE_NAMES, parents):
        if p:
            eb[bname].parent = eb[p]
            eb[bname].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    for i, bname in enumerate(BONE_NAMES):
        vg = body.vertex_groups.new(name=bname)
        for k in range(4):
            sel = np.where((wb[used, k] == i) & (wv[used, k] > 0.001))[0]
            for vi, w in zip(sel.tolist(), wv[used, k][sel].tolist()):
                vg.add([vi], w, "ADD")

    body.parent = rig
    body.modifiers.new("Armature", "ARMATURE").object = rig
    sub = body.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    add_outline(body, outline_width, outline)
    rig.location = location
    bpy.context.view_layer.update()
    return Human(body, rig, final, used)


def add_glute_bones(h, radius=0.13):
    """Extra bones inside each butt cheek, skinned with a soft falloff, for impact jiggle."""
    rig, body, final, used = h.rig, h.body, h.final, h.used
    pelvis = Vector(final[D["joint:pelvis"]].mean(0))
    co = final[used]
    deselect_all()
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    centers = {}
    for s, side in (("L", 1), ("R", -1)):
        m = (side * co[:, 0] > 0.02) & (co[:, 1] > pelvis.y + 0.02) & \
            (np.abs(co[:, 2] - (pelvis.z - 0.06)) < 0.12)
        pts = co[m]
        w = (pts[:, 1] - pts[:, 1].min()) ** 3              # bias toward the most rounded part
        c = (pts * w[:, None]).sum(0) / w.sum()
        centers[s] = c
        b = rig.data.edit_bones.new(f"glute.{s}")
        b.head = Vector((c[0], c[1] - 0.07, c[2]))
        b.tail = Vector((c[0], c[1] + 0.02, c[2]))
        b.parent = rig.data.edit_bones["hips"]
    bpy.ops.object.mode_set(mode="OBJECT")
    for s, c in centers.items():
        dist = np.linalg.norm(co - c, axis=1)
        w = np.clip(1 - dist / radius, 0, 1) ** 1.5
        w[co[:, 1] < pelvis.y - 0.02] = 0                   # back side only
        w[np.sign(co[:, 0]) != (1 if s == "L" else -1)] *= 0.3
        vg = body.vertex_groups.new(name=f"glute.{s}")
        for vi in np.where(w > 0.01)[0].tolist():
            vg.add([vi], float(w[vi]) * 1.5, "REPLACE")
    bpy.context.view_layer.update()


def _vertex_normals(co, quads):
    a, b, c, d = (co[quads[:, i]] for i in range(4))
    fn = np.cross(c - a, d - b)
    vn = np.zeros_like(co)
    for i in range(4):
        np.add.at(vn, quads[:, i], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)


def add_sera_face(h, hair_mat, iris, outline):
    """Eyes, hair cap, bun and side locks - all parented to the head bone."""
    final, body_faces = h.final, D["faces_body"]
    wb = D["weight_bones"]
    parts = []

    eye_mat = eye_material(iris)
    for s in "lr":
        pts = final[np.unique(D[f"faces_{s}-eye"])]
        center = Vector(pts.mean(0))
        radius = float(np.linalg.norm(pts - pts.mean(0), axis=1).mean())
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=center)
        eye = bpy.context.active_object
        eye.name = f"Sera_Eye.{s.upper()}"
        eye.scale = (radius,) * 3
        look = (Vector(final[D[f"joint:{s}-eye-target"]].mean(0)) - center).normalized()
        eye.rotation_euler = Vector((0, 0, 1)).rotation_difference(look).to_euler()
        eye.data.materials.append(eye_mat)
        bpy.ops.object.shade_smooth()
        parts.append(eye)

    # hair cap: scalp faces above a hairline, puffed outward
    def j(name):
        return Vector(final[D[f"joint:{name}"]].mean(0))

    head_c = (j("head") + j("head-2")) / 2
    eye_z = (j("l-eye").z + j("r-eye").z) / 2

    def hairline(rel):
        ang = np.degrees(np.abs(np.arctan2(rel[:, 0], -rel[:, 1])))   # 0 = face, 180 = back
        front, side, back = eye_z - head_c.z + 0.042, eye_z - head_c.z + 0.012, eye_z - head_c.z - 0.085
        return np.interp(ang, [0, 35, 70, 105, 180], [front, front, side, side, back])

    vn = _vertex_normals(final, body_faces)
    rel = final - np.array(head_c)
    in_cap = (rel[:, 2] > hairline(rel)) & (wb[:, 0] == BONE_NAMES.index("head")) & \
             (np.linalg.norm(rel, axis=1) < 0.16)
    cap_faces = body_faces[in_cap[body_faces].all(1)]
    cap_v = np.unique(cap_faces)
    crown = np.clip(rel[cap_v, 2] / 0.1, 0, 1)
    cap_co = final[cap_v] + vn[cap_v] * (0.008 + 0.010 * crown)[:, None]
    # quads make a stair-stepped edge; snap edge vertices onto the smooth hairline
    others = body_faces[~in_cap[body_faces].all(1)]
    edge = np.isin(cap_v, np.unique(others))
    cap_co[edge, 2] = head_c.z + hairline(rel[cap_v[edge]]) - 0.004
    cmap = -np.ones(N, dtype=np.int64)
    cmap[cap_v] = np.arange(len(cap_v))
    hmesh = bpy.data.meshes.new("Sera_Hair")
    hmesh.from_pydata(cap_co.tolist(), [], cmap[cap_faces].tolist())
    hmesh.polygons.foreach_set("use_smooth", np.ones(len(cap_faces), bool))
    hmesh.materials.append(hair_mat)
    hair = bpy.data.objects.new("Sera_Hair", hmesh)
    bpy.context.collection.objects.link(hair)
    hsub = hair.modifiers.new("Subdivision", "SUBSURF")
    hsub.levels = hsub.render_levels = 1
    add_outline(hair, 0.003, outline)
    parts.append(hair)

    top = Vector(final[cap_v][np.argmax(final[cap_v][:, 2])])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1,
                                         location=top + Vector((0, 0.07, -0.005)))
    bun = bpy.context.active_object
    bun.name = "Sera_HairBun"
    bun.scale = (0.075, 0.068, 0.066)
    bun.data.materials.append(hair_mat)
    bpy.ops.object.shade_smooth()
    add_outline(bun, 0.003, outline)
    parts.append(bun)

    for s in (-1, 1):
        eye = j(("l" if s > 0 else "r") + "-eye")
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
        deselect_all()
        bpy.context.view_layer.objects.active = lock
        lock.select_set(True)
        bpy.ops.object.convert(target="MESH")
        lock = bpy.context.active_object
        lock.data.materials.append(hair_mat)
        bpy.ops.object.shade_smooth()
        add_outline(lock, 0.002, outline)
        parts.append(lock)

    for ob in parts:
        h.pose.attach(ob, "head")
    return parts


# ---------------------------------------------------------------- posing
class Rig:
    """Pose a rig with world-space intuition. Axes: X = her left/right,
    Y = back(+)/front(-), Z = up. Positive angles follow the right-hand rule."""

    def __init__(self, rig, body=None):
        self.rig, self.body = rig, body

    def update(self):
        bpy.context.view_layer.update()

    def pb(self, bone):
        return self.rig.pose.bones[bone]

    def head(self, bone):
        return self.rig.matrix_world @ self.pb(bone).head

    def tail(self, bone):
        return self.rig.matrix_world @ self.pb(bone).tail

    def to_local(self, world_point):
        return self.rig.matrix_world.inverted() @ Vector(world_point)

    def to_world_from_bone(self, bone, local):
        """A point stored in a bone's space (see to_bone) -> world, following the pose."""
        return self.rig.matrix_world @ self.pb(bone).matrix @ Vector(local)

    def bone_point(self, bone, local, depsgraph=None):
        """Like to_world_from_bone, but reads the evaluated pose (safe inside handlers/renders)."""
        rig = self.rig.evaluated_get(depsgraph) if depsgraph else self.rig
        return rig.matrix_world @ rig.pose.bones[bone].matrix @ Vector(local)

    def to_bone(self, bone, world_point):
        return (self.rig.matrix_world @ self.pb(bone).matrix).inverted() @ Vector(world_point)

    def reset(self):
        for pb in self.rig.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.matrix_basis = Matrix.Identity(4)
        self.update()

    def rotate(self, bone, axis, deg):
        """Rotate a bone (and everything below it) around its head."""
        pb = self.pb(bone)
        m = pb.matrix.copy()
        pivot = m.translation.copy()
        r = Matrix.Rotation(math.radians(deg), 4, axis)
        pb.matrix = Matrix.Translation(pivot) @ r @ Matrix.Translation(-pivot) @ m
        self.update()

    def rotate_axis(self, bone, axis, radians):
        """Rotate a bone around its head about an arbitrary world-space axis vector."""
        pb = self.pb(bone)
        m = pb.matrix.copy()
        pivot = m.translation.copy()
        r = Matrix.Rotation(radians, 4, Vector(axis).normalized())
        pb.matrix = Matrix.Translation(pivot) @ r @ Matrix.Translation(-pivot) @ m
        self.update()

    def level_palm(self, side_letter, down=(0, 0, -1)):
        """Twist a hand around its own length so the palm faces `down`."""
        hand = f"hand.{side_letter}"
        side = 1 if side_letter == "L" else -1
        d = (self.tail(hand) - self.head(hand)).normalized()
        across = self.head(f"finger5_1.{side_letter}") - self.head(f"finger2_1.{side_letter}")
        across = (across - d * across.dot(d)).normalized()
        palm = -side * d.cross(across)                  # current palm direction
        want = Vector(down) - d * Vector(down).dot(d)
        if want.length < 1e-6:
            return
        want.normalize()
        angle = palm.angle(want)
        if d.dot(palm.cross(want)) < 0:
            angle = -angle
        self.rotate_axis(hand, d, angle)

    def shift(self, bone, offset):
        pb = self.pb(bone)
        m = pb.matrix.copy()
        m.translation += Vector(offset)
        pb.matrix = m
        self.update()

    def aim(self, bone, world_target):
        """Swing a bone so its tail points at a world-space target."""
        pb = self.pb(bone)
        head, tail = pb.head.copy(), pb.tail.copy()
        q = (tail - head).rotation_difference(self.to_local(world_target) - head)
        m = pb.matrix.copy()
        pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ m
        self.update()

    def ik(self, upper, lower, world_target, world_pole):
        """Two-bone IK: put the elbow/knee so the chain reaches the target."""
        s = self.head(upper)
        a, b = self.pb(upper).length, self.pb(lower).length
        t = Vector(world_target)
        d = max(min((t - s).length, (a + b) * 0.999), abs(a - b) + 1e-4)
        u = (t - s).normalized()
        v = Vector(world_pole) - s
        v = (v - u * v.dot(u)).normalized()
        cos_a = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
        bend = s + a * (u * cos_a + v * math.sqrt(1 - cos_a * cos_a))
        self.aim(upper, bend)
        self.aim(lower, t)

    def curl_fingers(self, deg_fingers=12, deg_thumb=6):
        for s in "LR":
            for f in range(1, 6):
                for k in range(1, 4):
                    pb = self.pb(f"finger{f}_{k}.{s}")
                    pb.rotation_mode = "QUATERNION"
                    q = Matrix.Rotation(math.radians(deg_thumb if f == 1 else deg_fingers), 4, "X").to_quaternion()
                    pb.rotation_quaternion = pb.rotation_quaternion @ q
        self.update()

    def attach(self, obj, bone):
        """Parent an object to a bone without moving it."""
        mw = obj.matrix_world.copy()
        obj.parent = self.rig
        obj.parent_type = "BONE"
        obj.parent_bone = bone
        self.update()
        obj.matrix_world = mw

    def key(self, frame):
        for pb in self.rig.pose.bones:
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("rotation_quaternion", frame=frame)

    def surface(self):
        """Posed world-space vertices of the body (with modifiers as currently enabled)."""
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.body.evaluated_get(dg)
        co = np.empty(len(ev.data.vertices) * 3)
        ev.data.vertices.foreach_get("co", co)
        mw = np.array(self.body.matrix_world)
        return co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]

    def surface_x(self, side, z, y_band=(-0.2, 0.2)):
        """Outermost skin x at height z on one side of the posed body."""
        co = self.surface()
        m = (np.abs(co[:, 2] - z) < 0.015) & (co[:, 1] > y_band[0]) & (co[:, 1] < y_band[1])
        xs = co[m, 0]
        return xs.max() if side > 0 else xs.min()


# ---------------------------------------------------------------- censor
def _compositor(scene):
    """Fresh compositor graph: render -> (pixelated where the mask is) -> output.
    Returns (mask node, pixelate node). Handles Blender 5.x and 4.x."""
    scene.render.use_compositing = True
    if hasattr(scene, "compositing_node_group"):                     # Blender 5.x
        tree = scene.compositing_node_group
        if tree is None:
            tree = bpy.data.node_groups.new("Compositor", "CompositorNodeTree")
            scene.compositing_node_group = tree
        tree.nodes.clear()
        if not any(i.item_type == "SOCKET" and i.in_out == "OUTPUT" for i in tree.interface.items_tree):
            tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        out = tree.nodes.new("NodeGroupOutput")
        mix = tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        sock = {x.identifier: x for x in [*mix.inputs, *mix.outputs]}
        fac, a, b, res = sock["Factor_Float"], sock["A_Color"], sock["B_Color"], sock["Result_Color"]
    else:                                                             # Blender 4.x
        scene.use_nodes = True
        tree = scene.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("CompositorNodeComposite")
        mix = tree.nodes.new("CompositorNodeMixRGB")
        fac, a, b, res = mix.inputs[0], mix.inputs[1], mix.inputs[2], mix.outputs[0]
    render = tree.nodes.new("CompositorNodeRLayers")
    pix = tree.nodes.new("CompositorNodePixelate")
    mask = tree.nodes.new("CompositorNodeEllipseMask")
    mask.name = "CensorMask"
    tree.links.new(render.outputs["Image"], pix.inputs[0])
    tree.links.new(render.outputs["Image"], a)
    tree.links.new(pix.outputs[0], b)
    tree.links.new(mask.outputs["Mask"], fac)
    tree.links.new(res, out.inputs[0])
    return mask, pix


def _set_mask(mask, pix, cx, cy, w, h, angle, block):
    """Mask center/size in 0..1 of the frame, angle in radians, block in pixels."""
    if "Position" in mask.inputs:                                     # Blender 5.x sockets
        mask.inputs["Position"].default_value = (cx, cy)
        mask.inputs["Size"].default_value = (w, h)
        mask.inputs["Rotation"].default_value = angle
        pix.inputs["Size"].default_value = block
    else:                                                             # Blender 4.x properties
        mask.x, mask.y, mask.width, mask.height = cx, cy, w, h
        mask.rotation = angle
        if hasattr(pix, "pixel_size"):
            pix.pixel_size = block


def add_mosaic_censor(segment_fn, occluder, radius=0.035, blocks=45):
    """Pixel-mosaic a small patch over a moving 3D segment (e.g. a genital contact point),
    seen from whatever camera is active. Samples hidden behind `occluder` are skipped,
    so the patch disappears when that spot isn't visible. Updates every frame."""
    from bpy_extras.object_utils import world_to_camera_view
    mask, pix = _compositor(bpy.context.scene)

    def censor_update(scene, depsgraph=None):
        dg = depsgraph or bpy.context.evaluated_depsgraph_get()
        cam = scene.camera
        rx = scene.render.resolution_x * scene.render.resolution_percentage / 100
        ry = scene.render.resolution_y * scene.render.resolution_percentage / 100
        block = max(3, round(ry / blocks))
        a, b = segment_fn(dg)
        cam_pos = cam.matrix_world.translation
        inv = occluder.matrix_world.inverted()
        visible = []
        for t in (0, 0.25, 0.5, 0.75, 1):
            p = a.lerp(b, t)
            o, d = inv @ cam_pos, inv @ p - inv @ cam_pos
            hit = occluder.ray_cast(o, d.normalized(), distance=max(0.0, d.length - 0.025), depsgraph=dg)[0]
            if not hit:
                visible.append(p)
        if not visible:
            _set_mask(mask, pix, 0.5, 0.5, 0, 0, 0, block)
            return
        pts = [world_to_camera_view(scene, cam, p) for p in visible]
        sensor = cam.data.sensor_width if rx >= ry else cam.data.sensor_width * rx / ry
        depth = max(0.05, sum(p.z for p in pts) / len(pts))
        r_px = radius * (cam.data.lens / sensor) * rx / depth
        p0, p1 = Vector((pts[0].x * rx, pts[0].y * ry)), Vector((pts[-1].x * rx, pts[-1].y * ry))
        mid, span = (p0 + p1) / 2, (p1 - p0)
        angle = math.atan2(span.y, span.x) if span.length > 1 else 0.0
        _set_mask(mask, pix, mid.x / rx, mid.y / ry, (span.length + 2 * r_px) / rx, 2 * r_px / rx, angle, block)

    handlers = bpy.app.handlers.frame_change_post
    for h in [h for h in handlers if getattr(h, "__name__", "") == "censor_update"]:
        handlers.remove(h)
    handlers.append(censor_update)
    censor_update(bpy.context.scene)
    return censor_update


def loop_action(rig):
    """Make the rig's animation repeat forever (Cycles F-curve modifier)."""
    ad = rig.animation_data
    if not (ad and ad.action):
        return
    curves = []
    if hasattr(ad.action, "fcurves"):
        curves = list(ad.action.fcurves)
    if not curves and hasattr(ad.action, "layers"):         # Blender 4.4+ layered actions
        for layer in ad.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        if not any(m.type == "CYCLES" for m in fc.modifiers):
            fc.modifiers.new("CYCLES")
