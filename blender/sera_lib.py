"""Shared building blocks for the game's characters.

Used by sera_character.py and sera_anim_test.py - keep this file in the
same folder as them, with data/sera_base.npz next to it.

  build_human()   MakeHuman body + shape keys + skeleton + skin weights
  round_butt()    rounder cheeks / deeper split shape key; add_glute_bones() for jiggle
  add_sera_face() eyes, hair cap, bun and side locks
  Rig             pose helpers in world terms, two-bone IK, keyframing
  skin_material() anime skin (gloss, dark creases) - with set_gloss() and bake_crease()
  toon / outline / ghost materials, one shared toon light (toon_light, set_toon_light)
  hide_in_pov()   first-person view shows only his hands
  scene reset, stage setup, mosaic censor, looping
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

LIGHT_DIR = Vector((0.25, 0.35, 1.0)).normalized()      # toon key light, world space (mostly overhead)
LIGHT_FOLLOW = 0.65         # how much the light also comes from the camera (0 = fixed sun)
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
    if "ToonLight" in bpy.data.node_groups:          # rebuilt fresh, in case this file changed
        bpy.data.node_groups.remove(bpy.data.node_groups["ToonLight"])


def deselect_all():
    for ob in bpy.context.selected_objects:
        ob.select_set(False)


def setup_stage(cam_location, look_at, floor_radius=0.9, background=(0.86, 0.90, 0.95),
                floor_colors=((0.62, 0.78, 0.62), (0.50, 0.64, 0.50))):
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=floor_radius, fill_type="NGON")
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.data.materials.append(toon_material("Floor", *floor_colors))

    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
    sun = bpy.context.active_object
    sun.data.energy = 3
    sun.rotation_euler = Vector((0, 0, 1)).rotation_difference(LIGHT_DIR).to_euler()   # for reference only:
    # the toon materials are self-lit (see toon_light), so they look the same in EEVEE and Cycles

    bpy.ops.object.camera_add(location=cam_location)
    cam = bpy.context.active_object
    cam.data.lens = 55
    cam.rotation_euler = (Vector(look_at) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*background, 1)

    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    bpy.context.scene.view_settings.view_transform = "Standard"
    return cam


# ---------------------------------------------------------------- materials
def _node(nt, kind, *inputs, **props):
    """Add a node, set properties, and feed its inputs (sockets get linked, numbers set)."""
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    for i, v in enumerate(inputs):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n


def _math(nt, op, a, b=None, c=None, clamp=False):
    return _node(nt, "ShaderNodeMath", a, b, c, operation=op, use_clamp=clamp).outputs[0]


def _vmath(nt, op, a, b=None, out="Vector"):
    return _node(nt, "ShaderNodeVectorMath", a, b, operation=op).outputs[out]


def _smooth(nt, value, lo, hi):
    """0 below lo, 1 above hi, smooth in between (lo > hi flips it)."""
    return _node(nt, "ShaderNodeMapRange", value, lo, hi, 0.0, 1.0,
                 interpolation_type="SMOOTHSTEP", clamp=True).outputs[0]


def toon_light():
    """The one light every toon material reads. A key light from LIGHT_DIR blended with
    light from the camera (LIGHT_FOLLOW), so whatever the player looks at gets lit from
    the front and above - shadows fall under round shapes, highlights sit on top.
    Outputs N.L, N.H (highlights) and N.V (rims), each -1..1. Change it with set_toon_light()."""
    ng = bpy.data.node_groups.get("ToonLight")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("ToonLight", "ShaderNodeTree")
    for name in ("NdotL", "NdotH", "NdotV"):
        ng.interface.new_socket(name, in_out="OUTPUT", socket_type="NodeSocketFloat")
    geo = ng.nodes.new("ShaderNodeNewGeometry")
    key = _node(ng, "ShaderNodeCombineXYZ", *LIGHT_DIR, name="Key", label="Key light direction")
    follow = _node(ng, "ShaderNodeValue", name="Follow", label="Follow camera")
    follow.outputs[0].default_value = LIGHT_FOLLOW
    view = geo.outputs["Incoming"]                                   # toward the camera
    light = _vmath(ng, "NORMALIZE", _vmath(ng, "ADD", key.outputs[0],
                                           _node(ng, "ShaderNodeVectorMath", view, None, None,
                                                 follow.outputs[0], operation="SCALE").outputs[0]))
    half = _vmath(ng, "NORMALIZE", _vmath(ng, "ADD", light, view))
    out = ng.nodes.new("NodeGroupOutput")
    for i, v in enumerate((light, half, view)):
        ng.links.new(_vmath(ng, "DOT_PRODUCT", geo.outputs["Normal"], v, out="Value"), out.inputs[i])
    return ng


def set_toon_light(direction=None, follow=None):
    """Re-aim the shared toon light, e.g. set_toon_light((0, -1, 1), follow=0) for a fixed sun."""
    ng = toon_light()
    if direction is not None:
        for i, v in enumerate(Vector(direction).normalized()):
            ng.nodes["Key"].inputs[i].default_value = v
    if follow is not None:
        ng.nodes["Follow"].outputs[0].default_value = follow


def _light_node(nt):
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = toon_light()
    return grp


def _toon_ramp(nt, lit, shadow, highlight=None):
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (*shadow, 1)
    ramp.color_ramp.elements[1].position = 0.12
    ramp.color_ramp.elements[1].color = (*lit, 1)
    if highlight:
        ramp.color_ramp.elements.new(0.82).color = (*highlight, 1)
    nt.links.new(_light_node(nt).outputs["NdotL"], ramp.inputs["Fac"])
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


def skin_material(name, lit, shadow, gloss=0.32, rim=0.12):
    """Soft anime skin (self-lit like toon_material, so EEVEE and Cycles match):
      - smooth falloff from light to shadow, with a warm band where they meet
      - creases (between the cheeks, under the butt and breasts) darkened, read from the
        'Crease' attribute that bake_crease() writes on the mesh
      - a glossy highlight + broad sheen that slide over round shapes as they move,
        which is what makes jiggle readable
      - a faint cool rim along the silhouette
    gloss/rim are strengths."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    light = _light_node(nt)
    ndl, ndh, ndv = (light.outputs[k] for k in ("NdotL", "NdotH", "NdotV"))
    crease = _node(nt, "ShaderNodeAttribute", attribute_name="Crease").outputs["Fac"]   # missing = 0
    opened = _node(nt, "ShaderNodeMapRange", crease, 0.12, 0.7, 1.0, 0.45,
                   interpolation_type="SMOOTHSTEP", clamp=True).outputs[0]
    fac = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY_ADD", ndl, 0.5, 0.5), opened)

    ramp = _node(nt, "ShaderNodeValToRGB", fac)
    ramp.color_ramp.interpolation = "LINEAR"
    lit_v, shadow_v = Vector(lit), Vector(shadow)
    warm = shadow_v.lerp(lit_v, 0.5)
    warm = Vector((min(1.0, warm.x * 1.12), warm.y * 0.86, warm.z * 0.8))   # reddish, like light under skin
    stops = [(0.0, shadow_v * 0.72), (0.40, shadow_v), (0.50, warm), (0.60, lit_v.lerp(warm, 0.4)),
             (0.82, lit_v), (1.0, Vector([min(1.0, c * 1.15) for c in lit_v]))]
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        els.new(pos).color = (*col, 1)

    spot = _smooth(nt, ndh, 0.962, 0.988)
    sheen = _math(nt, "POWER", _math(nt, "MAXIMUM", ndh, 0.0), 12.0)
    shine = _math(nt, "MULTIPLY_ADD", sheen, 0.15, spot)
    matte = _node(nt, "ShaderNodeAttribute", attribute_name="Matte").outputs["Fac"]   # see set_gloss
    shine = _math(nt, "MULTIPLY", shine, _math(nt, "SUBTRACT", 1.0, matte))
    shine = _math(nt, "MULTIPLY", shine, _smooth(nt, ndl, -0.1, 0.3))
    shine = _math(nt, "MULTIPLY", shine, _smooth(nt, crease, 0.4, 0.1))
    shine = _math(nt, "MULTIPLY", shine, gloss)
    edge = _math(nt, "MULTIPLY", _smooth(nt, ndv, 0.42, 0.06), rim)

    def scaled(color, amount):
        return _node(nt, "ShaderNodeVectorMath", color, None, None, amount, operation="SCALE").outputs[0]

    color = _vmath(nt, "ADD", ramp.outputs["Color"], scaled((1.0, 0.88, 0.80), shine))
    color = _vmath(nt, "ADD", color, scaled((0.55, 0.50, 0.95), edge))
    emit = _node(nt, "ShaderNodeEmission", color)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


def _pov_visibility(nt, near_fade=(0.25, 0.5), pov_range=(0.9, 1.6)):
    """0..1 visibility for a first-person body: anything within near_fade=(start, end) m of
    the camera fades out, and skin marked by hide_in_pov() disappears whenever the camera is
    closer than pov_range (i.e. riding with him), while far cameras still see all of him."""
    dist = nt.nodes.new("ShaderNodeCameraData").outputs["View Distance"]
    hidden = _node(nt, "ShaderNodeAttribute", attribute_name="PovHide").outputs["Fac"]
    close = _math(nt, "SUBTRACT", 1.0, _smooth(nt, dist, *pov_range))
    return _math(nt, "MULTIPLY", _smooth(nt, dist, *near_fade),
                 _math(nt, "SUBTRACT", 1.0, _math(nt, "MULTIPLY", hidden, close)))


def ghost_material(name, lit, shadow, opacity=0.55):
    """See-through toon material for the faceless 'ghost' partner. In a POV shot his own
    head and torso vanish (see hide_in_pov) so they don't block the view."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    _set_blended(mat)
    nt = mat.node_tree
    nt.nodes.clear()
    ramp = _toon_ramp(nt, lit, shadow)
    emit = nt.nodes.new("ShaderNodeEmission")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(_math(nt, "MULTIPLY", _pov_visibility(nt), opacity), mix.inputs["Fac"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def outline_material(color=(0.16, 0.08, 0.08), name="Outline", pov=False):
    """Inverted-hull ink line: show only the shell faces that point at the camera.
    pov=True hides it the same way ghost_material hides a POV body."""
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
    hide = geo.outputs["Backfacing"]
    if pov:
        hide = _math(nt, "MAXIMUM", hide, _math(nt, "SUBTRACT", 1.0, _pov_visibility(nt)))
    nt.links.new(hide, mix.inputs["Fac"])
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
    arm_mod = body.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = rig
    # dual-quaternion skinning: keeps hips and butt round when the legs fold up (plain
    # linear skinning crushes them). Engines without it (e.g. Godot) need a corrective shape.
    arm_mod.use_deform_preserve_volume = True
    sub = body.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    add_outline(body, outline_width, outline)
    rig.location = location
    bpy.context.view_layer.update()
    return Human(body, rig, final, used)


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def round_butt(h, amount=1.0, bulge=0.022, cleft=0.012):
    """'Butt Round' shape key: pushes each cheek out onto a round (ellipsoid) dome, keeps the
    inner sides falling away into a deeper cleft, and gives the bottom a defined under-curve.
    Sized from the skeleton, so it follows the body sliders. bulge = extra push at the
    fullest point (m), cleft = how much deeper the split gets (m). Call before add_glute_bones."""
    final, used, body = h.final, h.used, h.body
    co = final[used]
    pel = final[D["joint:pelvis"]].mean(0)
    hx = abs(final[D["joint:l-upper-leg"]].mean(0)[0])         # half hip-joint spacing
    size = pel[2] / 1.13                                         # 1.0 for Sera's height
    cx, cz = 0.82 * hx, pel[2] - 0.03 * size                     # cheek centers
    rx, ry, rz = 0.92 * hx, 0.14 * size, 0.15 * size             # cheek dome radii
    out = co.copy()
    for s in (1, -1):
        side = s * co[:, 0] > 0
        back = side & (co[:, 1] > pel[1]) & (np.abs(co[:, 2] - cz) < rz * 1.3)
        c = np.array([s * cx, co[back, 1].max() + bulge - ry, cz])
        d = co - c
        rho = np.maximum(np.linalg.norm(d / np.array([rx, ry, rz]), axis=1), 1e-6)
        k = 0.12                                                  # soft max(1/rho, 1): no crease at the dome edge
        f = np.maximum(0.5 * (1 / rho + 1 + np.sqrt((1 / rho - 1) ** 2 + k * k)) - k / 2, 1.0)
        reach = np.hypot((co[:, 0] - s * cx) / (rx * 1.3), (co[:, 2] - cz) / (rz * 1.25))
        w = ((1 - _smoothstep(0.6, 1.0, reach)) * _smoothstep(pel[1] - 0.01, pel[1] + 0.06, co[:, 1]) *
             _smoothstep(0.0, 0.03, s * co[:, 0]) * side)
        out += d * (f - 1)[:, None] * w[:, None]
    # deepen the cleft: pull the back midline in
    zc = _smoothstep(cz - rz * 1.1, cz - rz * 0.6, co[:, 2]) * (1 - _smoothstep(cz + rz * 0.7, cz + rz * 1.15, co[:, 2]))
    out[:, 1] -= cleft * np.exp(-(co[:, 0] / 0.014) ** 2) * zc * _smoothstep(pel[1], pel[1] + 0.06, co[:, 1])
    delta = out - co

    basis = np.empty(len(body.data.vertices) * 3)
    body.data.shape_keys.key_blocks["Basis"].data.foreach_get("co", basis)
    key = body.shape_key_add(name="Butt Round", from_mix=False)
    key.data.foreach_set("co", (basis.reshape(-1, 3) + delta).reshape(-1))
    key.slider_min, key.slider_max = 0.0, 2.0
    key.value = amount
    h.final = final.copy()
    h.final[used] = co + delta * amount
    return key


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


def bake_crease(h, distance=0.07, rays=40):
    """Bake how tucked-in each skin point is (ambient occlusion) for the CURRENT pose into a
    'Crease' attribute (0 = open, 1 = deep fold) that skin_material darkens. Baked rather
    than rendered so the outline shell doesn't count as an occluder, and it works the same
    in EEVEE, Cycles and a game engine (it's just vertex data). Re-run after re-posing."""
    from mathutils.bvhtree import BVHTree
    body = h.body
    toggled = [m for m in body.modifiers if m.type in ("SUBSURF", "SOLIDIFY") and m.show_viewport]
    for m in toggled:
        m.show_viewport = False
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    n = len(me.vertices)
    co = np.empty(n * 3)
    nrm = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    me.vertices.foreach_get("normal", nrm)
    co, nrm = co.reshape(-1, 3), nrm.reshape(-1, 3)
    edges = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", edges)
    bvh = BVHTree.FromPolygons(co.tolist(), [tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear()
    for m in toggled:
        m.show_viewport = True

    # cosine-weighted hemisphere directions (golden-angle spiral), turned to each normal
    k = np.arange(rays) + 0.5
    r, phi = np.sqrt(k / rays), k * math.pi * (3 - math.sqrt(5))
    local = np.stack([r * np.cos(phi), r * np.sin(phi), np.sqrt(1 - r * r)], 1)
    helper = np.where(np.abs(nrm[:, 2:3]) < 0.9, [[0, 0, 1]], [[1, 0, 0]])
    t = np.cross(helper, nrm)
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    b = np.cross(nrm, t)
    dirs = (local[None, :, 0:1] * t[:, None] + local[None, :, 1:2] * b[:, None] +
            local[None, :, 2:3] * nrm[:, None])
    origins = co + nrm * 0.002
    occ = np.zeros(n)
    for i in range(n):
        o = Vector(origins[i])
        total = 0.0
        for d in dirs[i]:
            hit = bvh.ray_cast(o, Vector(d), distance)
            if hit[0] is not None:
                total += 1.0 - hit[3] / distance          # near walls count more
        occ[i] = total / rays
    e = edges.reshape(-1, 2)
    for _ in range(2):                                    # soften the per-vertex noise
        acc = np.zeros(n)
        cnt = np.zeros(n)
        np.add.at(acc, e[:, 0], occ[e[:, 1]])
        np.add.at(acc, e[:, 1], occ[e[:, 0]])
        np.add.at(cnt, e.ravel(), 1)
        occ = 0.5 * occ + 0.5 * acc / np.maximum(cnt, 1)
    occ = np.clip(occ * 2.2, 0, 1)                        # ~45% blocked counts as a full fold
    attr = body.data.attributes.get("Crease") or body.data.attributes.new("Crease", "FLOAT", "POINT")
    attr.data.foreach_set("value", occ.astype(np.float32))
    body.data.update()
    return occ


def set_gloss(h, glossy=("glute.L", "glute.R", "hips", "thigh.L", "thigh.R", "breast.L", "breast.R"),
              matte=0.8):
    """Where skin_material may shine: full gloss on the skin of the `glossy` bones (butt,
    thighs, breasts by default), dulled by `matte` (0..1) everywhere else - big flat areas
    like the back otherwise catch blotchy highlights. Stored as a 'Matte' attribute."""
    body = h.body
    ids = {body.vertex_groups[b].index for b in glossy if b in body.vertex_groups}
    n = len(body.data.vertices)
    shine = np.zeros(n)
    for v in body.data.vertices:
        for g in v.groups:
            if g.group in ids:
                shine[v.index] = max(shine[v.index], g.weight)
    edges = np.empty(len(body.data.edges) * 2, dtype=np.int64)
    body.data.edges.foreach_get("vertices", edges)
    e = edges.reshape(-1, 2)
    for _ in range(3):                                    # soft edges between glossy and matte skin
        acc, cnt = np.zeros(n), np.zeros(n)
        np.add.at(acc, e[:, 0], shine[e[:, 1]])
        np.add.at(acc, e[:, 1], shine[e[:, 0]])
        np.add.at(cnt, e.ravel(), 1)
        shine = 0.5 * shine + 0.5 * acc / np.maximum(cnt, 1)
    values = (matte * (1 - _smoothstep(0.3, 0.75, shine))).astype(np.float32)   # core of each area only
    attr = body.data.attributes.get("Matte") or body.data.attributes.new("Matte", "FLOAT", "POINT")
    attr.data.foreach_set("value", values)
    body.data.update()


def hide_in_pov(h, keep=("upper_arm", "forearm", "hand", "finger")):
    """Mark all his skin except the arms (`keep`) as 'PovHide', so ghost_material drops it
    when the camera rides along with him - like a first-person game shows only your hands."""
    body = h.body
    wb, wv = D["weight_bones"][h.used], D["weight_values"][h.used].astype(np.float32)
    arm = np.isin(wb, [i for i, b in enumerate(BONE_NAMES) if b.startswith(keep)])
    values = (1 - np.clip((wv * arm).sum(1) * 1.5, 0, 1)).astype(np.float32)
    attr = body.data.attributes.get("PovHide") or body.data.attributes.new("PovHide", "FLOAT", "POINT")
    attr.data.foreach_set("value", values)
    body.data.update()


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
            pb.keyframe_insert("scale", frame=frame)

    def squash(self, bone, along_x=1.0, along_y=1.0, along_z=1.0):
        """Scale a bone in its own axes (call after rotate/shift for that bone)."""
        self.pb(bone).scale = (along_x, along_y, along_z)
        self.update()

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
