"""Animation test: Sera bent over a table, ghost partner behind her, looping.

A procedural loop: every frame is posed from a few sine waves (thrust,
her answering rock with a lag, head bob, breast jiggle), with IK keeping
hands and feet planted. The partner is the faceless see-through "ghost"
used in the reference games.

Run in Blender: Scripting tab -> Open this file -> Run Script (takes ~1 min).
Then hover the 3D view and press Space to play. For his point of view:
click POV_Cam in the Outliner, hover the 3D view, press Ctrl+Numpad0. Needs sera_lib.py and
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
THRUST = 0.10             # how far his hips travel (meters)
SNAP = 0.45               # 0 = even in/out, higher = snaps in and eases out
PUSH = 0.062              # how far each hit shoves her forward
LAG = 0.55                # her reaction delay (radians of the cycle)
BEND = 86                 # how far she bends over (degrees)
ARCH = 10                 # sway in her lower back (doggy-style arch)
HEAD_TOSS = 16            # head lifts on each hit (degrees)
JIGGLE = 21               # breast swing (degrees)
GLUTE = 12                 # butt wobble (degrees)
GLUTE_SQUASH = 0.022      # butt flesh pushed in on impact (meters)
CENSOR_SIZE = 0.035       # mosaic radius around the contact (meters)

SERA_BODY = {
    "Weight": 0.2, "Muscle": 0.15, "Height": 0.35, "Breast Size": 1.1, "Breast Perky": 1.3,
    "Breast Lift": 0.9, "Hips Wide": 1.15, "Butt Big": 1.3, "Waist Narrow": 1.1, "Belly Flat": 1.0,
    "Thighs Thick": 1.35, "Calves": 0.35, "Legs Long": 0.45, "Slim Shoulders": 0.35, "Slim Arms": 0.3,
    "Slim Neck": 0.35, "Small Hands Feet": 0.25, "Face Soft": 0.5, "Lips Full": 0.45, "Eyes Big": 0.6,
    "Eyes Feline": 0.35, "Elf Ears": 1.0,
}
PARTNER_BODY = {"Muscle": 0.5, "Height": 0.65}

TABLE_TOP = 0.64          # table height (m)
TABLE_EDGE = -0.52        # y of the table edge nearest her

# ---------------------------------------------------------------- build
L.reset_scene()
outline = L.outline_material()
sera = L.build_human("Sera", L.SERA_BASE, L.SERA_SLIDERS, SERA_BODY,
                     L.toon_material("Skin", (0.50, 0.26, 0.16), (0.30, 0.13, 0.09)), outline)
L.add_sera_face(sera, L.toon_material("Hair", (0.58, 0.44, 0.72), (0.34, 0.22, 0.48),
                                      highlight=(0.78, 0.66, 0.90)), (0.85, 0.45, 0.15), outline)
L.add_glute_bones(sera)
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
wrist = {s: Vector((side * 0.24, TABLE_EDGE - 0.12, TABLE_TOP + 0.035)) for s, side in (("L", 1), ("R", -1))}
hand_verts = {s: sera.verts_of([f"hand.{s}"] + [f"finger{f}_{k}.{s}" for f in range(1, 6) for k in range(1, 4)])
              for s in "LR"}


def stroke(phase):
    """-1 (pulled out) .. +1 (deepest). SNAP warps it so the push is quicker than the pull."""
    return math.sin(phase + SNAP * math.sin(phase))


def hit(phase, delay=0.0):
    """0..1 impact felt by her body, sharper than the stroke, arriving `delay` later."""
    return ((1 + stroke(phase - LAG - delay)) / 2) ** 2


def plant_leg(P, s, ankle_target, knee_dir):
    P.ik(f"thigh.{s}", f"shin.{s}", ankle_target, P.head(f"shin.{s}") + knee_dir)
    a = P.head(f"foot.{s}")
    P.aim(f"foot.{s}", Vector((a.x, a.y - 0.13, 0.025)))
    t = P.head(f"toe.{s}")
    P.aim(f"toe.{s}", Vector((t.x, t.y - 0.06, 0.01)))


def pose_sera(phase):
    h0 = hit(phase)
    wobble = math.sin(2 * (phase - LAG) - 0.4)                  # flesh settling after the hit
    S.reset()
    S.shift("hips", (0, 0.03 - PUSH * h0, -0.07 + 0.012 * h0))   # knees soft, hips lowered
    S.rotate("hips", "X", BEND + 3 * h0)
    # the hit travels up her spine as a wave, ending in a head lift
    S.rotate("spine", "X", -ARCH - 3 * hit(phase, 0.25))
    S.rotate("spine1", "X", -6 - 4 * hit(phase, 0.45))
    S.rotate("chest", "X", -2 - 3 * hit(phase, 0.65))
    S.rotate("neck", "X", -26 - 0.5 * HEAD_TOSS * hit(phase, 0.85))
    S.rotate("head", "X", -30 - HEAD_TOSS * hit(phase, 1.05))
    for s, side in (("L", 1), ("R", -1)):
        plant_leg(S, s, Vector((side * 0.22, 0.10, ankle[s].z)), Vector((side * 0.25, -1, 0)))
        S.ik(f"upper_arm.{s}", f"forearm.{s}", wrist[s], S.head(f"upper_arm.{s}") + Vector((side * 0.5, 0.25, 0.1)))
        w = S.head(f"hand.{s}")
        S.aim(f"hand.{s}", (w.x + side * 0.02, w.y - 0.15, w.z - 0.012))
        S.level_palm(s)
        swing = JIGGLE * (math.sin(phase - LAG - 1.1) + 0.45 * math.sin(2 * (phase - LAG) - 2.2))
        S.rotate(f"breast.{s}", "X", swing)
        S.rotate(f"breast.{s}", "Y", side * 0.25 * swing)
        S.shift(f"glute.{s}", (0, -GLUTE_SQUASH * h0, 0))
        S.rotate(f"glute.{s}", "X", GLUTE * wobble)
        S.rotate(f"glute.{s}", "Y", side * 0.3 * GLUTE * wobble)
    S.curl_fingers(3, 3)


# censor anchor points, measured at rest and stored relative to each hip bone
S.reset()
co, pel = S.surface(), S.head("hips")
hip_v = sera.verts_of(["hips"])
mid = hip_v[(abs(co[hip_v, 0]) < 0.012) & (abs(co[hip_v, 1] - pel.y) < 0.15)]
her_spot = S.to_bone("hips", Vector(co[mid[co[mid, 2].argmin()]]))     # lowest midline point = crotch

# settle the palms flat on the table top
pose_sera(LAG)
co = S.surface()
for s in "LR":
    wrist[s].z -= co[hand_verts[s], 2].min() - (TABLE_TOP + 0.003)

# where her hips are when he's mid-thrust, and where his hands go
pose_sera(LAG)
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
    grip[s] = S.to_bone("hips", Vector((x + side * 0.006, waist.y, waist.z - 0.02)))

G.reset()
gco = G.surface()
g_pelvis = G.head("hips")
gband = (abs(gco[:, 0]) < 0.08) & (abs(gco[:, 2] - g_pelvis.z) < 0.05)
front_y = gco[gband, 1].min()
g_hip_v = ghost.verts_of(["hips"])
gmid = g_hip_v[(abs(gco[g_hip_v, 0]) < 0.015) & (gco[g_hip_v, 2] < g_pelvis.z - 0.10) &
               (gco[g_hip_v, 2] > g_pelvis.z - 0.17)]
his_spot = G.to_bone("hips", Vector(gco[gmid[gco[gmid, 1].argmin()]]))   # base of his groin
ghost.rig.location.y += butt_y - front_y - 0.005       # just touching at mid-thrust
G.update()
g_ankle = {s: ghost.joint(f"{s.lower()}-ankle") for s in "LR"}
crotch = S.bone_point("hips", her_spot)
root = G.bone_point("hips", his_spot)
drop = crotch.z + 0.01 - root.z                       # his groin level with hers; he bends his knees
print(f"her crotch z {crotch.z:.3f}, his groin z {root.z:.3f}, his hips drop {drop:+.3f} "
      f"({'OK' if drop <= 0 else 'partner too short - raise his Height'})")


def pose_ghost(phase):
    t = stroke(phase)
    G.reset()
    G.shift("hips", (0, -THRUST * 0.5 * t, min(drop, 0) - 0.01))
    G.rotate("hips", "X", -5 - 7 * (0.5 + 0.5 * t))  # pelvis tucks on the thrust
    G.rotate("spine1", "X", 16 + 2 * t)              # leaning over her
    G.rotate("chest", "X", 10)
    G.rotate("neck", "X", 10)
    G.rotate("head", "X", 22)
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

# ---------------------------------------------------------------- cameras
L.setup_stage(cam_location=(4.0, -3.5, 1.5), look_at=(0, 0.1, 0.88), floor_radius=1.6)

# POV: his eyes, looking down her back. Rides his head bone so it moves with him.
eyes = (G.pb("head").matrix.translation + G.pb("head").tail) / 2
eyes = ghost.rig.matrix_world @ eyes + Vector((0, -0.05, 0.02))
bpy.ops.object.camera_add(location=eyes)
pov = bpy.context.active_object
pov.name = "POV_Cam"
pov.data.lens = 28
pov.data.clip_start = 0.42          # clips away his own head and chest, like a POV game
look = (S.head("hips") + S.head("spine")) / 2
pov.rotation_euler = (look - eyes).to_track_quat("-Z", "Y").to_euler()
G.attach(pov, "head")

# ---------------------------------------------------------------- censor
# Small pixel mosaic over the genital contact only - it follows the hips, and switches
# off whenever her body hides that spot from the active camera.
L.add_mosaic_censor(lambda dg: (S.bone_point("hips", her_spot, dg), G.bone_point("hips", his_spot, dg)),
                    sera.body, radius=CENSOR_SIZE)

L.deselect_all()
print("Animation test built:", LOOP_FRAMES, "frame loop")
