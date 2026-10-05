"""Sera - rigged, posed character base built on the MakeHuman body.

What this builds:
  - A realistic female body (MakeHuman hm08 base mesh, CC0) shaped by the
    BODY sliders below: wide hips, thick thighs, big butt and bust, elf ears.
  - Every slider is also a Shape Key, so you can drag them live in
    Properties > Object Data (green triangle) > Shape Keys.
  - A game-ready skeleton (spine, arms, fingers, legs, toes, plus breast
    bones for jiggle physics) with skin weights.
  - A standing contrapposto pose: weight on one leg, hand on hip.
  - Anime skin shading (soft light-to-shadow falloff, glossy highlights, dark
    creases) + ink outline, the same in EEVEE and Cycles.

Run in Blender (4.2+ / 5.x): Scripting tab -> Open this file -> Run Script.
Needs sera_lib.py and data/sera_base.npz next to this script. Clears the scene first.
"""
import importlib
import os
import sys

import bpy
from mathutils import Vector


def _add_script_dir():
    """Let Blender find sera_lib.py (it sits next to this script)."""
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
importlib.reload(L)   # pick up edits when re-running inside one Blender session

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
BUTT_ROUND = 1.0            # 0..2: rounder cheeks and a deeper split (shape key "Butt Round")

COLORS = {
    "skin": ((0.50, 0.26, 0.16), (0.30, 0.13, 0.09)),   # (lit, shadow) warm caramel (linear values)
    "hair": ((0.58, 0.44, 0.72), (0.34, 0.22, 0.48)),   # lavender
    "iris": (0.85, 0.45, 0.15),                         # amber
}

L.reset_scene()
outline = L.outline_material()
sera = L.build_human("Sera", L.SERA_BASE, L.SERA_SLIDERS, BODY,
                     L.skin_material("Skin", *COLORS["skin"]), outline)
L.round_butt(sera, BUTT_ROUND)
L.set_gloss(sera)                   # shiny butt, thighs and breasts; satin everywhere else
L.add_sera_face(sera, L.toon_material("Hair", *COLORS["hair"], highlight=(0.78, 0.66, 0.90)),
                COLORS["iris"], outline)
rig, P = sera.rig, sera.pose

# ---------------------------------------------------------------- pose: contrapposto
# Weight on her right leg (-X). Right hip rises, left hip drops, shoulders
# counter-tilt, relaxed left knee bends forward. Right hand on hip.
P.update()
P.shift("hips", (-0.03, 0, 0))
P.rotate("hips", "Y", 7)           # pelvis tilt: right hip up
P.rotate("hips", "X", 5)           # anterior tilt: butt back, small of back arched
P.rotate("hips", "Z", 6)           # quarter-turn of the pelvis
P.rotate("thigh.R", "Y", -11)      # standing leg in under the body
P.rotate("thigh.R", "X", -4)
P.rotate("thigh.L", "Y", 4)        # relaxed leg drifts in
P.rotate("thigh.L", "X", -14)      # ...and forward
P.rotate("thigh.L", "Z", 10)       # knee turned out a touch
P.rotate("shin.L", "X", 20)        # knee bend
P.rotate("foot.R", "Y", 4)         # keep feet flat after the hip tilt
P.rotate("foot.L", "Y", -11)
P.rotate("foot.L", "X", 6)         # heel lifts, weight on the ball of the foot
P.rotate("spine", "X", -4)         # arch
P.rotate("spine1", "Y", -4)        # counter-tilt up the spine
P.rotate("chest", "Y", -5)
P.rotate("chest", "X", -3)         # chest out
P.rotate("chest", "Z", -5)
P.rotate("upper_chest", "Y", -2)
P.rotate("neck", "Y", 3)
P.rotate("head", "Y", 6)           # head tilt
P.rotate("head", "Z", -8)
P.rotate("head", "X", 4)           # chin slightly down

# arms - hand on right hip, left arm relaxed beside the hip
hip_z = (P.head("hips").z + P.head("spine1").z) / 2
x_r = P.surface_x(-1, hip_z)
P.ik("upper_arm.R", "forearm.R", (x_r - 0.03, 0.035, hip_z + 0.03),
     P.head("upper_arm.R") + Vector((-0.4, 0.25, -0.1)))
P.aim("hand.R", P.head("hand.R") + Vector((0.25, -0.55, -0.6)))

x_l = P.surface_x(1, hip_z - 0.12)
P.ik("upper_arm.L", "forearm.L", (x_l + 0.06, -0.01, hip_z - 0.13),
     P.head("upper_arm.L") + Vector((0.1, 0.4, -0.3)))
P.aim("hand.L", P.head("hand.L") + Vector((0.08, -0.08, -1)))
P.curl_fingers()

# plant the lowest foot on the floor
rig.location.z -= P.surface()[:, 2].min()
P.update()
L.bake_crease(sera)                 # dark creases for this pose

# ---------------------------------------------------------------- stage
L.setup_stage(cam_location=(1.2, -4.6, 1.05), look_at=(0, 0, 0.88))
L.deselect_all()
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
print("Sera built:", len(rig.pose.bones), "bones")
