"""Sera standing pose sheet - a library of natural standing poses for the game.

Each pose is keyed on its own frame (frame 1 = first pose, 2 = second...) with a
timeline marker named after it: run the script, then scrub the timeline (or press
Up/Down arrow in the 3D view) to flip through them. Edit a recipe in POSES and re-run.

What keeps a standing pose from looking stiff (studied from model sheets):
  - weight on one leg: that hip rises, the other drops, the free knee bends
  - the shoulders tilt back the other way, so the spine makes a soft S (contrapposto)
  - balance: her mass sits over the standing foot (the solver below checks this)
  - nothing mirrored: the two arms and two legs always do different things
  - soft joints: elbows and knees never locked, feet turned out a little
  - relaxed hands: fingers curl more from index to pinky
  - head tilted / turned a touch, arms away from the body so the silhouette reads

Run in Blender: Scripting tab -> Open this file -> Run Script (~1 min).
Needs sera_lib.py and data/sera_base.npz next to this script. Clears the scene first.
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

BODY = {
    "Weight": 0.2, "Muscle": 0.15, "Height": 0.35, "Breast Size": 1.1, "Breast Perky": 1.3,
    "Breast Lift": 0.9, "Hips Wide": 1.15, "Butt Big": 1.3, "Waist Narrow": 1.1, "Belly Flat": 1.0,
    "Thighs Thick": 1.35, "Calves": 0.35, "Legs Long": 0.45, "Slim Shoulders": 0.35, "Slim Arms": 0.3,
    "Slim Neck": 0.35, "Small Hands Feet": 0.25, "Face Soft": 0.5, "Lips Full": 0.45, "Eyes Big": 0.6,
    "Eyes Feline": 0.35, "Elf Ears": 1.0,
}
BUTT_ROUND = 1.0

# ---------------------------------------------------------------- build
L.reset_scene()
outline = L.outline_material()
sera = L.build_human("Sera", L.SERA_BASE, L.SERA_SLIDERS, BODY,
                     L.skin_material("Skin", (0.50, 0.26, 0.16), (0.30, 0.13, 0.09)), outline)
L.add_sera_face(sera, L.toon_material("Hair", (0.58, 0.44, 0.72), (0.34, 0.22, 0.48),
                                      highlight=(0.78, 0.66, 0.90)), (0.85, 0.45, 0.15), outline)
L.round_butt(sera, BUTT_ROUND)
L.set_gloss(sera)
P = sera.pose
heavy = [m for m in sera.body.modifiers if m.type in ("SUBSURF", "SOLIDIFY")]
for m in heavy:
    m.show_viewport = False

SPINE = ["spine", "spine1", "chest", "upper_chest"]


# ---------------------------------------------------------------- pose building blocks
def stance(support, feet, tilt=4, turn=0, arch=4, chest=(0, 0, 0), head=(0, 0, 0),
           lean=(0, 0), counter=1.25, straight=0.995):
    """The body of every standing pose (arms come after).
    support  "L"/"R": leg carrying the weight, or None for both
    feet     {"L": (x, y, toe_out_deg, heel_lift_deg[, knee_out]), "R": ...} where each foot
             stands; knee_out < 0 turns that knee in
    tilt     how far the free hip drops (deg); the shoulders tilt back by tilt * (counter - 1)
    turn     pelvis turned toward her left (+) / right (-) (deg)
    arch     lower-back sway (deg): pelvis tips forward, spine curves back up
    chest    (lean forward, lean to her left, twist to her left) on top of that (deg)
    head     (nod down, tilt to her left, turn to her left) (deg)
    lean     pelvis shift (m) - the balance solver sets this"""
    P.reset()
    P.shift("hips", (lean[0], lean[1], 0))
    P.rotate("hips", "Z", turn)
    sign = {"R": 1, "L": -1, None: 0}[support]           # + about Y lifts her right hip
    P.rotate("hips", "Y", sign * tilt)
    P.rotate("hips", "X", arch)
    P.bend(SPINE, "X", -arch * 1.1 + chest[0], [0.4, 0.3, 0.2, 0.1])
    P.bend(SPINE, "Y", -sign * tilt * counter + chest[1], [0.35, 0.3, 0.2, 0.15])
    P.bend(SPINE, "Z", chest[2], [0.2, 0.3, 0.3, 0.2])
    # hip height: the standing leg straight (both legs when there's no favorite)
    legs = [support] if support else ["L", "R"]
    P.shift("hips", (0, 0, min(P.reach_floor(s, *feet[s][:2], turn=feet[s][2], heel=feet[s][3],
                                             straight=straight, apply=False) for s in legs)))
    for s, (x, y, out, heel, *knee) in feet.items():
        P.plant(s, x, y, turn=out, heel=heel, knee_out=knee[0] if knee else 0.15)
    P.bend(["neck", "head"], "X", head[0], [0.4, 0.6])
    P.bend(["neck", "head"], "Y", head[1], [0.4, 0.6])
    P.bend(["neck", "head"], "Z", head[2], [0.4, 0.6])


def hip_spot(s, up=0.04, back=0.03):
    """A point on the side of her hip at the waist line - where a hand rests."""
    side = 1 if s == "L" else -1
    pelvis, waist = P.head("hips"), P.head("spine1")
    z = pelvis.z + (waist.z - pelvis.z) * 0.3 + up
    co = P.surface()
    near = (abs(co[:, 2] - z) < 0.02) & (abs(co[:, 1] - pelvis.y) < 0.12)
    xs = co[near, 0]
    x = xs.max() if side > 0 else xs.min()
    return Vector((x, pelvis.y + back, z))


def hand_on_hip(s, hand="soft"):
    side = 1 if s == "L" else -1
    spot = hip_spot(s)
    P.arm_reach(s, spot + Vector((side * 0.05, 0.03, 0.045)), elbow_dir=(side, 0.45, 0.05),
                hand_dir=(-side * 0.3, -0.55, -0.65), palm=(-side, 0.1, 0), hand=hand)


def hand_behind_head(s):
    side = 1 if s == "L" else -1
    head = P.head("head")
    P.arm_reach(s, head + Vector((side * 0.07, 0.11, 0.05)), elbow_dir=(side, 0.1, 0.8),
                hand_dir=(-side * 0.6, 0.15, 0.25), palm=(0, -1, 0.2), hand="relaxed", drop=-12)


# ---------------------------------------------------------------- the poses
# x = her left (+) / right (-), y = forward is negative. view = camera angle around her
# (0 = front, 90 = her left side, 180 = back) for the sheet render.
def relaxed():
    P.arm_hang("L", out=11, forward=2, elbow=12)
    P.arm_hang("R", out=14, forward=2, elbow=18)


def contrapposto():
    hand_on_hip("R")
    P.arm_hang("L", out=14, forward=-2, elbow=16, hand="relaxed")


def power():
    hand_on_hip("L", hand="fist")
    hand_on_hip("R", hand="fist")


def coy():
    P.arm_hang("L", out=20, forward=10, elbow=28, palm=(-0.3, -0.2, -1), hand="soft")
    P.arm_hang("R", out=24, forward=-6, elbow=20, palm=(0.4, 0.2, -1), hand="open")


def over_shoulder():
    hand_on_hip("R")
    P.arm_hang("L", out=8, forward=-4, elbow=14)


def guard():
    # lead (left) fist out toward the opponent at chin height, rear fist guarding the jaw,
    # elbows down to cover the ribs. Offsets from her jaw; the opponent is straight ahead (-y).
    jaw = P.head("head")
    spots = {"L": (0.07, -0.34, -0.11), "R": (-0.11, -0.13, -0.17)}
    for s, offset in spots.items():
        side = 1 if s == "L" else -1
        P.arm_reach(s, jaw + Vector(offset), elbow_dir=(side * 0.25, 0.1, -1),
                    hand_dir=(-side * 0.1, -0.8, 0.5), palm=(-side, 0.2, -0.3), hand="fist", drop=0)


def pinup():
    hand_behind_head("L")
    hand_on_hip("R")


POSES = [
    dict(name="Relaxed", view=0, arms=relaxed, support="R", tilt=3, arch=3,
         feet={"L": (0.115, -0.02, 10, 0), "R": (-0.10, 0.0, 9, 0)}, head=(3, -2, 2)),
    dict(name="Contrapposto", view=25, arms=contrapposto, support="R", tilt=8, turn=8, arch=5,
         feet={"R": (-0.06, 0.0, 12, 0), "L": (0.10, -0.13, 18, 18)},
         chest=(0, 0, -6), head=(4, 6, -6)),
    dict(name="Power", view=15, arms=power, support=None, tilt=0, arch=6, straight=0.985,
         feet={"L": (0.21, -0.02, 14, 0), "R": (-0.21, 0.0, 12, 0)},
         chest=(-4, 0, 0), head=(-4, 0, 8)),
    dict(name="Coy", view=10, arms=coy, support="L", tilt=9, turn=-6, arch=6,
         feet={"L": (0.05, 0.0, 10, 0), "R": (0.03, -0.14, -15, 30, -0.4)},
         chest=(4, 0, 8), head=(8, -10, 10)),
    dict(name="Over the shoulder", view=150, arms=over_shoulder, support="L", tilt=9, turn=12, arch=9,
         feet={"L": (0.06, 0.0, 10, 0), "R": (-0.12, 0.05, 20, 22)},
         chest=(0, 0, 22), head=(4, 4, 55)),
    dict(name="Fight stance", view=55, arms=guard, support=None, tilt=0, turn=-40, arch=0,
         straight=0.94, feet={"L": (0.04, -0.22, -12, 0, 0.0), "R": (-0.18, 0.15, 60, 8, 0.0)},
         chest=(10, 0, -4), head=(12, 0, 34)),
    dict(name="Pin-up", view=20, arms=pinup, support="R", tilt=10, turn=6, arch=8,
         feet={"R": (-0.06, 0.0, 12, 0), "L": (0.07, -0.12, 25, 24)},
         chest=(-3, 0, -4), head=(2, 12, -4)),
]


def build(pose):
    """Pose her, then shift her hips until her mass sits over her feet, and stand her on the floor."""
    feet = pose["feet"]
    s = pose["support"]
    spots = {k: Vector(v[:2]) for k, v in feet.items()}
    if s:
        other = "L" if s == "R" else "R"
        target = spots[s] * 0.8 + spots[other] * 0.2
    else:
        target = (spots["L"] + spots["R"]) / 2
    keys = ("support", "feet", "tilt", "turn", "arch", "chest", "head", "straight")
    args = {k: pose[k] for k in keys if k in pose}
    lean = Vector((0, 0))
    for _ in range(4):
        stance(lean=lean, **args)
        pose["arms"]()
        co = P.surface()
        mass = Vector(co[:, :2].mean(0))
        lean += (target - mass) * 0.9
    stance(lean=lean, **args)
    pose["arms"]()
    P.ground()


# dark creases (under the breasts and butt, between the cheeks) from her body alone, arms out
# of the way - baking them in one pose would leave dark marks where an arm used to rest
P.reset()
P.ground()
L.bake_crease(sera)

scene = bpy.context.scene
scene.timeline_markers.clear()
for i, pose in enumerate(POSES):
    build(pose)
    P.key(i + 1)
    scene.timeline_markers.new(pose["name"], frame=i + 1)
    print(f"posed {i + 1}: {pose['name']}")
ad = sera.rig.animation_data
for fc in (L.action_fcurves(ad.action) if ad and ad.action else []):
    for kp in fc.keyframe_points:
        kp.interpolation = "CONSTANT"            # a pose sheet: snap, don't blend
scene.frame_start, scene.frame_end = 1, len(POSES)
for m in heavy:
    m.show_viewport = True
scene.frame_set(1)

L.setup_stage(cam_location=(1.2, -4.6, 1.05), look_at=(0, 0, 0.95), floor_radius=0.9,
              background=(0.78, 0.78, 0.80), floor_colors=((0.62, 0.62, 0.64), (0.52, 0.52, 0.55)))
L.deselect_all()
print("Pose sheet built:", ", ".join(p["name"] for p in POSES))
