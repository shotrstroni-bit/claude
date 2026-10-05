"""Animation test: Sera bent over a table, ghost partner behind her, looping.

A procedural loop: every frame is posed from a few sine waves (thrust,
her answering rock with a lag, head bob, breast jiggle), with IK keeping
hands and feet planted. The partner is the faceless see-through "ghost"
used in the reference games.

Run in Blender: Scripting tab -> Open this file -> Run Script (takes ~1 min).
Then hover the 3D view and press Space to play. Needs sera_lib.py and
data/sera_base.npz next to this script. Clears the scene first.

Tweak the MOTION numbers below and re-run.
"""
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector


def _add_script_dir():
    dirs = []
    try:
        dirs.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    dirs += [os.path.dirname(bpy.path.abspath(t.filepath)) for t in bpy.data.texts if t.filepath]
    for d in dirs:
        if os.path.exists(os.path.join(d, "sera_lib.py")):
            if d not in sys.path:
                sys.path.insert(0, d)
            return
    raise FileNotFoundError("Keep sera_lib.py in the same folder as this script.")


_add_script_dir()
import sera_lib as L  # noqa: E402
importlib.reload(L)

# =====================================================================
# MOTION - edit and re-run
# =====================================================================
LOOP_FRAMES = 16          # frames per thrust (24 fps -> 1.5 per second)
THRUST = 0.08             # how far his hips travel (meters)
PUSH = 0.025              # how far she gets pushed forward
LAG = 0.7                 # her reaction delay (radians of the cycle)
BEND = 60                 # how far she bends over (degrees)
JIGGLE = 12               # breast swing (degrees)
HEAD_BOB = 5              # degrees

SERA_BODY = {
    "Weight": 0.2, "Muscle": 0.15, "Height": 0.35, "Breast Size": 1.1, "Breast Perky": 1.3,
    "Breast Lift": 0.9, "Hips Wide": 1.15, "Butt Big": 1.3, "Waist Narrow": 1.1, "Belly Flat": 1.0,
    "Thighs Thick": 1.35, "Calves": 0.35, "Legs Long": 0.45, "Slim Shoulders": 0.35, "Slim Arms": 0.3,
    "Slim Neck": 0.35, "Small Hands Feet": 0.25, "Face Soft": 0.5, "Lips Full": 0.45, "Eyes Big": 0.6,
    "Eyes Feline": 0.35, "Elf Ears": 1.0,
}
PARTNER_BODY = {"Muscle": 0.5, "Height": 0.4}

TABLE_TOP = 0.84          # table height (m)
TABLE_EDGE = -0.52        # y of the table edge nearest her

# ---------------------------------------------------------------- build
L.reset_scene()
outline = L.outline_material()
sera = L.build_human("Sera", L.SERA_BASE, L.SERA_SLIDERS, SERA_BODY,
                     L.toon_material("Skin", (0.50, 0.26, 0.16), (0.30, 0.13, 0.09)), outline)
L.add_sera_face(sera, L.toon_material("Hair", (0.58, 0.44, 0.72), (0.34, 0.22, 0.48),
                                      highlight=(0.78, 0.66, 0.90)), (0.85, 0.45, 0.15), outline)
ghost = L.build_human("Partner", L.MALE_BASE, L.MALE_SLIDERS, PARTNER_BODY,
                      L.ghost_material("Ghost", (0.30, 0.58, 1.0), (0.12, 0.30, 0.85), opacity=0.4),
                      L.outline_material((0.05, 0.14, 0.50), "GhostOutline"),
                      location=(0, 0.6, 0), outline_width=0.004)

# table
wood = L.toon_material("Wood", (0.42, 0.22, 0.10), (0.26, 0.13, 0.06))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, TABLE_EDGE - 0.38, TABLE_TOP - 0.025))
top = bpy.context.active_object
top.name = "Table"
top.scale = (1.3, 0.76, 0.05)
top.data.materials.append(wood)
for x in (-0.58, 0.58):
    for y in (TABLE_EDGE - 0.06, TABLE_EDGE - 0.70):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, (TABLE_TOP - 0.05) / 2))
        leg = bpy.context.active_object
        leg.scale = (0.06, 0.06, TABLE_TOP - 0.05)
        leg.data.materials.append(wood)
        leg.parent = top
        leg.matrix_parent_inverse = top.matrix_world.inverted()

# fast posing: skip subdivision/outline while baking, restore afterwards
heavy = [m for h in (sera, ghost) for m in h.body.modifiers if m.type in ("SUBSURF", "SOLIDIFY")]
for m in heavy:
    m.show_viewport = False

S, G = sera.pose, ghost.pose
ankle = {s: sera.joint(f"{s.lower()}-ankle") for s in "LR"}
g_ankle = {s: ghost.joint(f"{s.lower()}-ankle") for s in "LR"}


def plant_leg(P, s, ankle_target, knee_dir):
    P.ik(f"thigh.{s}", f"shin.{s}", ankle_target, P.head(f"shin.{s}") + knee_dir)
    a = P.head(f"foot.{s}")
    P.aim(f"foot.{s}", Vector((a.x, a.y - 0.13, 0.025)))
    t = P.head(f"toe.{s}")
    P.aim(f"toe.{s}", Vector((t.x, t.y - 0.06, 0.01)))


def pose_sera(phase):
    r = 0.5 + 0.5 * math.sin(phase - LAG)          # 0..1, how hard she's been pushed
    S.reset()
    S.shift("hips", (0, 0.03 - PUSH * r, -0.02))
    S.rotate("hips", "X", BEND + 2 * r)
    S.rotate("spine", "X", -10)
    S.rotate("spine1", "X", -6 - 3 * r)             # back arches on impact
    S.rotate("chest", "X", -4)
    S.rotate("neck", "X", -18)
    S.rotate("head", "X", -24 + HEAD_BOB * math.sin(phase - LAG - 0.6))
    for s, side in (("L", 1), ("R", -1)):
        plant_leg(S, s, Vector((side * 0.16, 0.10, ankle[s].z)), Vector((side * 0.15, -1, 0)))
        sh = S.head(f"upper_arm.{s}")
        S.ik(f"upper_arm.{s}", f"forearm.{s}", (side * 0.24, TABLE_EDGE - 0.16, TABLE_TOP + 0.035),
             sh + Vector((side * 0.5, 0.25, 0.1)))
        w = S.head(f"hand.{s}")
        S.aim(f"hand.{s}", (w.x + side * 0.02, w.y - 0.15, TABLE_TOP + 0.02))
        swing = JIGGLE * math.sin(phase - LAG - 1.1)
        S.rotate(f"breast.{s}", "X", swing)
        S.rotate(f"breast.{s}", "Y", side * 0.25 * swing)
    S.curl_fingers(4, 4)


# where her hips are when he's mid-thrust, and where his hands go
pose_sera(0.0 + LAG)
co = S.surface()
pelvis = S.head("hips")
band = (abs(co[:, 0]) < 0.08) & (abs(co[:, 2] - pelvis.z) < 0.12)
butt_y = co[band, 1].max()
contact_z = co[band][co[band, 1].argmax(), 2] - 0.06
grip = {}
for s, side in (("L", 1), ("R", -1)):
    waist = S.head("spine")
    m = (abs(co[:, 1] - waist.y) < 0.05) & (abs(co[:, 2] - waist.z) < 0.06)
    x = co[m, 0].max() if side > 0 else co[m, 0].min()
    grip[s] = S.to_bone("hips", Vector((x + side * 0.03, waist.y, waist.z + 0.02)))

G.reset()
gco = G.surface()
g_pelvis = G.head("hips")
gband = (abs(gco[:, 0]) < 0.08) & (abs(gco[:, 2] - g_pelvis.z) < 0.05)
front_y = gco[gband, 1].min()
ghost.rig.location.y += butt_y - front_y - 0.005       # just touching at mid-thrust
G.update()
g_ankle = {s: ghost.joint(f"{s.lower()}-ankle") for s in "LR"}
drop = contact_z - g_pelvis.z
print(f"contact height {contact_z:.3f}, partner pelvis {g_pelvis.z:.3f}, drop {drop:+.3f}")


def pose_ghost(phase):
    t = math.sin(phase)                              # -1 out .. +1 deepest
    G.reset()
    G.shift("hips", (0, -THRUST * 0.5 * t, min(drop, 0) - 0.01))
    G.rotate("hips", "X", -5 - 6 * (0.5 + 0.5 * t))  # pelvis tucks on the thrust
    G.rotate("spine1", "X", 8)
    G.rotate("chest", "X", 6)
    G.rotate("neck", "X", 12)
    G.rotate("head", "X", 18)
    for s, side in (("L", 1), ("R", -1)):
        plant_leg(G, s, Vector((g_ankle[s].x + side * 0.03, g_ankle[s].y + 0.04, g_ankle[s].z)),
                  Vector((side * 0.2, -1, 0)))
        target = S.to_world_from_bone("hips", grip[s])
        G.ik(f"upper_arm.{s}", f"forearm.{s}", target, G.head(f"upper_arm.{s}") + Vector((side * 0.5, 0.2, -0.4)))
        w = G.head(f"hand.{s}")
        G.aim(f"hand.{s}", w + Vector((-side * 0.03, -0.14, -0.06)))
    G.curl_fingers(25, 10)


# ---------------------------------------------------------------- bake the loop
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, LOOP_FRAMES
for f in range(LOOP_FRAMES + 1):
    phase = 2 * math.pi * f / LOOP_FRAMES
    pose_sera(phase)
    pose_ghost(phase)
    S.key(f + 1)
    G.key(f + 1)
for h in (sera, ghost):
    L.loop_action(h.rig)
for m in heavy:
    m.show_viewport = True
scene.frame_set(1)

L.setup_stage(cam_location=(4.0, -3.5, 1.5), look_at=(0, 0.1, 0.88), floor_radius=1.6)
L.deselect_all()
print("Animation test built:", LOOP_FRAMES, "frame loop")
