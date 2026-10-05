"""Doggy-style motion test built on the hentai-motion skill.

Builds two adult mannequins from metaballs, rigs both in one armature, keys a
4-stroke, 64-frame loop by the rules in .claude/skills/hentai-motion/SKILL.md,
bakes jiggle, checks for clipping and IK reach, and renders with Cycles.

The bodies are deliberately plain proxies (no faces, no genital modelling): a
motion test, the way a studio blocks on mannequins before final characters.
The rig layout, timing and jiggle setup carry over to real character meshes.

Run with Blender's Python (the `bpy` wheel, or `blender -b -P`):

    python examples/doggy_motion_test.py --out renders --render side,pov
    python examples/doggy_motion_test.py --out renders --render side --frames 1,46,48
"""

import argparse
import math
import os
import shutil
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "hentai-motion", "scripts"))
import jiggle_bake as jb  # noqa: E402

K = 0.575          # metaball surface radius / element radius (stiffness 2, threshold 0.6)
FPS = 24
PERIOD = 64        # loop: frames 1..64, frame 65 == frame 1
GAP = 0.012        # rest gap between his hips and her ass at the contact pose
V = Vector

# Contacts (impact frames) and per-stroke settings. Four strokes that aren't
# clones: normal, quicker, shallow with a grind, then a deep one with a hold.
CONTACTS = [1, 17, 32, 46, 65]
STROKES = [
    dict(comp=0.008, travel=0.100, hold=0, grind=0.0, s=1.0),
    dict(comp=0.008, travel=0.085, hold=0, grind=0.0, s=0.9),
    dict(comp=0.007, travel=0.070, hold=0, grind=4.0, s=0.8),
    dict(comp=0.014, travel=0.130, hold=3, grind=0.0, s=1.5),
]


# ---------------------------------------------------------------- body parts

def _align_x(direction):
    return V((1, 0, 0)).rotation_difference(V(direction).normalized())


def ell(co, r, bone, size=(1, 1, 1), axis=None):
    """Ellipsoid blob. r is the surface radius before `size` scaling."""
    return dict(kind="ell", co=V(co), r=r, size=V(size),
                rot=_align_x(axis) if axis is not None else Quaternion(), bone=bone)


def cap(p0, p1, r, bone, trim=0.3, negative=False):
    """Capsule between two joints, trimmed so neighbours don't balloon.
    negative=True carves instead of adds (creases, clefts)."""
    p0, p1 = V(p0), V(p1)
    u = (p1 - p0).normalized()
    cut = min(trim * r, (p1 - p0).length * 0.3)
    return dict(kind="cap", p0=p0 + u * cut, p1=p1 - u * cut, r=r, bone=bone, negative=negative)


def solve_elbow(shoulder, wrist, upper, fore, hint):
    d = wrist - shoulder
    length = d.length
    u = d / length
    a = (upper * upper - fore * fore + length * length) / (2 * length)
    h = math.sqrt(max(upper * upper - a * a, 1e-8))
    perp = hint - u * hint.dot(u)
    perp.normalize()
    return shoulder + u * a + perp * h


def build_her():
    p = lambda x, y, z: V((x, y, z))  # noqa: E731
    j = dict(pelvis=p(0.0, 0, 0.53), sacrum=p(0.07, 0, 0.565), waist=p(0.22, 0, 0.535),
             chest=p(0.33, 0, 0.55), neck=p(0.52, 0, 0.62), head=p(0.60, 0, 0.665),
             head_tip=p(0.78, 0, 0.71))
    hair = [p(0.655, 0.03, 0.83), p(0.66, 0.10, 0.76), p(0.665, 0.118, 0.64),
            p(0.67, 0.118, 0.52), p(0.675, 0.115, 0.41)]

    body = [
        ell((-0.01, 0, 0.53), 0.125, "F_pelvis", (0.85, 1.35, 0.85)),
        ell((0.14, 0, 0.535), 0.092, "F_spine1", (1.0, 1.12, 0.85)),
        ell((0.25, 0, 0.535), 0.085, "F_spine2", (1.0, 1.15, 0.9)),
        ell((0.40, 0, 0.565), 0.115, "F_breath", (1.15, 1.12, 0.95)),
        ell((0.48, 0, 0.595), 0.085, "F_chest", (0.9, 1.75, 0.75)),
        ell((0.20, 0, 0.475), 0.07, "F_belly", (1.25, 1.1, 0.75)),
        cap(j["neck"], j["head"], 0.045, "F_neck", trim=0.2),
        ell((0.685, 0, 0.70), 0.10, "F_head", (1.08, 0.82, 0.95)),
    ]
    hair_parts = [ell((0.655, 0, 0.745), 0.106, "F_head", (0.98, 0.88, 0.95))]
    hair_parts += [cap(hair[i], hair[i + 1], r, f"F_hair{i + 1}", trim=0.0)
                   for i, r in enumerate((0.035, 0.034, 0.030, 0.022))]

    bones = [
        ("F_pelvis", j["pelvis"], j["sacrum"], "root", True),
        ("F_spine1", j["sacrum"], j["waist"], "F_pelvis", True),
        ("F_spine2", j["waist"], j["chest"], "F_spine1", True),
        ("F_chest", j["chest"], j["neck"], "F_spine2", True),
        ("F_breath", p(0.40, 0, 0.565), p(0.40, 0, 0.64), "F_chest", True),
        ("F_neck", j["neck"], j["head"], "F_chest", True),
        ("F_head", j["head"], j["head_tip"], "F_neck", True),
        ("F_belly", p(0.20, 0, 0.53), p(0.20, 0, 0.45), "F_spine1", True),
    ]
    parent = "F_head"
    for i in range(4):
        bones.append((f"F_hair{i + 1}", hair[i], hair[i + 1], parent, True))
        parent = f"F_hair{i + 1}"

    arms = {}
    for s, k in (("L", 1), ("R", -1)):
        hip, knee = p(0.0, 0.095 * k, 0.50), p(0.03, 0.11 * k, 0.065)
        ankle, toe = p(-0.36, 0.12 * k, 0.05), p(-0.53, 0.12 * k, 0.035)
        sh, wr, hand = p(0.50, 0.165 * k, 0.575), p(0.53, 0.17 * k, 0.045), p(0.62, 0.165 * k, 0.028)
        el = solve_elbow(sh, wr, 0.275, 0.275, V((-1, 0, 0)))
        arms[s] = el
        body += [
            ell((-0.095, 0.075 * k, 0.55), 0.116, f"F_butt.{s}", (1.0, 0.92, 1.0)),
            ell((0.375, 0.08 * k, 0.425), 0.072, f"F_breast.{s}", (1.0, 0.95, 1.12)),
            ell((0.50, 0.155 * k, 0.585), 0.058, "F_chest"),
            cap(sh, el, 0.043, f"F_upperarm.{s}"),
            cap(el, wr, 0.036, f"F_forearm.{s}"),
            ell((wr + hand) / 2, 0.045, f"F_hand.{s}", (1.3, 0.85, 0.42), axis=hand - wr),
            cap(hip, knee, 0.072, f"F_thigh.{s}"),
            ell(hip.lerp(knee, 0.22), 0.088, f"F_thigh.{s}"),
            cap(knee, ankle, 0.045, f"F_shin.{s}"),
            ell(knee.lerp(ankle, 0.3), 0.053, f"F_shin.{s}", (1.5, 1, 0.85), axis=ankle - knee),
            cap(ankle, toe, 0.03, f"F_foot.{s}"),
        ]
        bones += [
            (f"F_butt.{s}", p(-0.015, 0.065 * k, 0.61), p(-0.10, 0.08 * k, 0.535), "F_pelvis", True),
            (f"F_breast.{s}", p(0.38, 0.075 * k, 0.49), p(0.373, 0.082 * k, 0.42), "F_chest", True),
            (f"F_hipsock.{s}", hip, hip + V((0, 0, 0.05)), "F_pelvis", False),
            (f"F_shin.{s}", knee, ankle, "root", True),
            (f"F_thigh.{s}", knee, hip, "root", True),
            (f"F_foot.{s}", ankle, toe, f"F_shin.{s}", True),
            (f"F_upperarm.{s}", sh, el, "F_chest", True),
            (f"F_forearm.{s}", el, wr, f"F_upperarm.{s}", True),
            (f"F_hand.{s}", wr, hand, f"F_forearm.{s}", True),
            (f"F_hand_ik.{s}", wr, hand, "root", False),
            (f"F_elbow_pole.{s}", el + V((-0.3, 0, 0)), el + V((-0.3, 0, 0.05)), "F_chest", False),
        ]
    return body, hair_parts, bones, arms


def build_him(dx):
    p = lambda x, y, z: V((x + dx, y, z))  # noqa: E731
    j = dict(pelvis=p(-0.31, 0, 0.56), sacrum=p(-0.325, 0, 0.66), waist=p(-0.335, 0, 0.80),
             chest=p(-0.34, 0, 0.93), neck=p(-0.345, 0, 1.13), head=p(-0.35, 0, 1.19),
             head_tip=p(-0.35, 0, 1.40))
    body = [
        ell(j["pelvis"], 0.125, "M_pelvis", (0.85, 1.2, 0.8)),
        ell(p(-0.32, 0, 0.72), 0.12, "M_spine1", (0.85, 1.12, 1.0)),
        ell(p(-0.33, 0, 0.84), 0.125, "M_spine2", (0.85, 1.22, 1.0)),
        ell(p(-0.34, 0, 0.97), 0.15, "M_breath", (0.8, 1.15, 1.0)),
        ell(p(-0.345, 0, 1.07), 0.10, "M_chest", (0.8, 2.0, 0.7)),
        cap(j["neck"], j["head"], 0.06, "M_neck", trim=0.2),
        ell(p(-0.35, 0, 1.29), 0.11, "M_head", (0.95, 0.8, 1.1)),
    ]
    bones = [
        ("M_pelvis", j["pelvis"], j["sacrum"], "root", True),
        ("M_spine1", j["sacrum"], j["waist"], "M_pelvis", True),
        ("M_spine2", j["waist"], j["chest"], "M_spine1", True),
        ("M_chest", j["chest"], j["neck"], "M_spine2", True),
        ("M_breath", p(-0.34, 0, 0.97), p(-0.34, 0, 1.05), "M_chest", True),
        ("M_neck", j["neck"], j["head"], "M_chest", True),
        ("M_head", j["head"], j["head_tip"], "M_neck", True),
    ]
    arms = {}
    for s, k in (("L", 1), ("R", -1)):
        hip, knee = p(-0.31, 0.10 * k, 0.53), p(-0.52, 0.25 * k, 0.07)
        ankle, toe = p(-0.93, 0.25 * k, 0.055), p(-1.10, 0.25 * k, 0.04)
        sh = p(-0.34, 0.20 * k, 1.08)
        # Hands grip her hips, so they don't shift with his body.
        wr, hand = V((-0.075, 0.18 * k, 0.645)), V((0.025, 0.165 * k, 0.605))
        el = solve_elbow(sh, wr, 0.31, 0.31, V((-0.3, 1.0 * k, -0.2)))
        arms[s] = el
        body += [
            ell(p(-0.39, 0.06 * k, 0.55), 0.09, "M_pelvis"),
            ell(sh, 0.07, "M_chest"),
            ell(p(-0.275, 0.085 * k, 1.0), 0.08, "M_breath", (0.6, 1.1, 0.8)),
            cap(sh, el, 0.05, f"M_upperarm.{s}"),
            cap(el, wr, 0.043, f"M_forearm.{s}"),
            ell((wr + hand) / 2, 0.05, f"M_hand.{s}", (1.45, 0.55, 0.95), axis=hand - wr),
            cap(hip, knee, 0.085, f"M_thigh.{s}"),
            ell(hip.lerp(knee, 0.2), 0.098, f"M_thigh.{s}"),
            cap(knee, ankle, 0.052, f"M_shin.{s}"),
            ell(knee.lerp(ankle, 0.3), 0.06, f"M_shin.{s}", (1.5, 1, 0.85), axis=ankle - knee),
            cap(ankle, toe, 0.035, f"M_foot.{s}"),
        ]
        bones += [
            (f"M_hipsock.{s}", hip, hip + V((0, 0, 0.05)), "M_pelvis", False),
            (f"M_shin.{s}", knee, ankle, "root", True),
            (f"M_thigh.{s}", knee, hip, "root", True),
            (f"M_foot.{s}", ankle, toe, f"M_shin.{s}", True),
            (f"M_upperarm.{s}", sh, el, "M_chest", True),
            (f"M_forearm.{s}", el, wr, f"M_upperarm.{s}", True),
            (f"M_hand.{s}", wr, hand, f"M_forearm.{s}", True),
            # IK target rides on HER pelvis: his hands stay locked to her hips.
            (f"M_hand_ik.{s}", wr, hand, "F_pelvis", False),
            (f"M_elbow_pole.{s}", el + V((0, 0.3 * k, 0)), el + V((0, 0.3 * k, 0.05)), "M_chest", False),
        ]
    knee_to_hip = (V((-0.31, 0.10, 0.53)) - V((-0.52, 0.25, 0.07)))
    return body, bones, arms, knee_to_hip


# ---------------------------------------------------------------- mesh + weights

def metaball_mesh(name, parts, resolution=0.011):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = resolution
    ob = bpy.data.objects.new(name, mb)
    bpy.context.scene.collection.objects.link(ob)
    for part in parts:
        if part["kind"] == "ell":
            e = mb.elements.new(type='ELLIPSOID')
            e.co = part["co"]
            e.size_x, e.size_y, e.size_z = part["size"]
            e.rotation = part["rot"]
        else:
            e = mb.elements.new(type='CAPSULE')
            e.co = (part["p0"] + part["p1"]) / 2
            e.size_x = max((part["p1"] - part["p0"]).length / 2, 1e-4)
            e.rotation = _align_x(part["p1"] - part["p0"])
        e.radius = part["r"] / K
        e.use_negative = part.get("negative", False)
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.metaballs.remove(mb)
    mesh.name = name
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def field_weights(obj, parts):
    """Skin weights from the same metaball fields that built the surface."""
    n = len(obj.data.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    names = sorted({p["bone"] for p in parts})
    col = {b: i for i, b in enumerate(names)}
    w = np.zeros((n, len(names)))
    for part in parts:
        if part.get("negative"):
            continue
        radius = part["r"] / K
        if part["kind"] == "ell":
            rot = np.array(part["rot"].to_matrix())
            local = (co - np.array(part["co"])) @ rot / np.array(part["size"])
            d = np.linalg.norm(local, axis=1)
        else:
            a, b = np.array(part["p0"]), np.array(part["p1"])
            ab = b - a
            t = np.clip(((co - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
            d = np.linalg.norm(co - (a + t[:, None] * ab), axis=1)
        w[:, col[part["bone"]]] += np.clip(1 - (d / radius) ** 2, 0, None) ** 3
    top = np.argsort(-w, axis=1)[:, :4]
    groups = {b: obj.vertex_groups.new(name=b) for b in names}
    for i in range(n):
        idx = top[i]
        vals = w[i, idx]
        total = vals.sum()
        if total <= 0:
            continue
        for j_, v in zip(idx, vals / total):
            if v > 0.01:
                groups[names[j_]].add([i], float(v), 'REPLACE')


def carve_cleft(obj, depth=0.022, width=0.016):
    """Sculpt the crease between her cheeks: push backward-facing midline
    verts inward along their normals with a gaussian profile."""
    for v in obj.data.vertices:
        x, y, z = v.co
        n = v.normal
        if n.x > -0.12 or not (0.42 < z < 0.68) or abs(y) > 0.07:
            continue
        top = min(1.0, max(0.0, (0.68 - z) / 0.045))       # fade in below the sacrum
        bottom = min(1.0, max(0.0, (z - 0.42) / 0.06))     # and out toward the crotch
        v.co -= n * depth * math.exp(-(y / width) ** 2) * (top * bottom) ** 2
    obj.data.update()


def mesh_extent_x(obj, pick, ymax=0.12, zlo=0.45, zhi=0.65):
    xs = [v.co.x for v in obj.data.vertices
          if abs(v.co.y) < ymax and zlo < v.co.z < zhi]
    return pick(xs)


# ---------------------------------------------------------------- rig

def build_rig(bone_specs):
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    root = arm.edit_bones.new("root")
    root.head, root.tail, root.use_deform = (0, 0, 0), (0, 0, 0.25), False
    for name, head, tail, _parent, deform in bone_specs:
        b = arm.edit_bones.new(name)
        b.head, b.tail, b.use_deform = head, tail, deform
    for name, _h, _t, parent, _d in bone_specs:
        arm.edit_bones[name].parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def add_constraints(rig, rest_elbows):
    pb = rig.pose.bones
    for who in ("F", "M"):
        for s in ("L", "R"):
            thigh = pb[f"{who}_thigh.{s}"]
            c = thigh.constraints.new('STRETCH_TO')
            c.target, c.subtarget = rig, f"{who}_hipsock.{s}"
            c.rest_length = thigh.bone.length
            c.volume = 'NO_VOLUME'

            ik = pb[f"{who}_forearm.{s}"].constraints.new('IK')
            ik.target, ik.subtarget = rig, f"{who}_hand_ik.{s}"
            ik.pole_target, ik.pole_subtarget = rig, f"{who}_elbow_pole.{s}"
            ik.chain_count = 2
            fit_pole_angle(rig, ik, f"{who}_upperarm.{s}", rest_elbows[who][s])

            cr = pb[f"{who}_hand.{s}"].constraints.new('COPY_ROTATION')
            cr.target, cr.subtarget = rig, f"{who}_hand_ik.{s}"


def fit_pole_angle(rig, ik, upper_name, rest_elbow):
    """Pick the pole angle that leaves the arm exactly in its rest pose."""
    def err(deg):
        ik.pole_angle = math.radians(deg)
        bpy.context.view_layer.update()
        return (rig.matrix_world @ rig.pose.bones[upper_name].tail - rest_elbow).length
    best = min(range(-180, 180, 10), key=err)
    for step in (1.0, 0.1):
        best = min((best + step * i for i in range(-10, 11)), key=err)
    ik.pole_angle = math.radians(best)


# ---------------------------------------------------------------- keying

def world_to_local(pb, loc=(0, 0, 0), rot_deg=(0, 0, 0)):
    m3 = pb.bone.matrix_local.to_3x3()
    mq = m3.to_quaternion()
    rx, ry, rz = (math.radians(a) for a in rot_deg)
    qw = (Quaternion((0, 0, 1), rz) @ Quaternion((0, 1, 0), ry) @ Quaternion((1, 0, 0), rx))
    return m3.inverted() @ V(loc), (mq.inverted() @ qw @ mq).to_euler('XYZ')


def key_bone(pb, frame, loc=None, rot=None, scale=None):
    pb.rotation_mode = 'XYZ'
    l, r = world_to_local(pb, loc or (0, 0, 0), rot or (0, 0, 0))
    if loc is not None:
        pb.location = l
        pb.keyframe_insert("location", frame=frame, group=pb.name)
    if rot is not None:
        pb.rotation_euler = r
        pb.keyframe_insert("rotation_euler", frame=frame, group=pb.name)
    if scale is not None:
        pb.scale = (scale, scale, scale)
        pb.keyframe_insert("scale", frame=frame, group=pb.name)


def close_cycle(keys):
    """Sort and append the first key one period later so Cycles loops it."""
    keys = sorted(keys, key=lambda k: k[0])
    return keys + [(keys[0][0] + PERIOD,) + tuple(keys[0][1:])]


def stroke_frames(i):
    c, n = CONTACTS[i], CONTACTS[i + 1]
    h = STROKES[i]["hold"]
    o = c + 2 + h + round((n - c - 2 - h) * 0.6)     # out-stroke ~60% of the cycle
    return c, n, h, o, (c + 2 + h + o) // 2, o + (n - o) // 2


def animate(rig, knee_to_hip):
    pb = rig.pose.bones
    rx0, rz0 = knee_to_hip.x, knee_to_hip.z
    reach = math.hypot(rx0, rz0)

    def arc_z(x):  # kneeling: his hips swing on an arc around his knees
        return math.sqrt(reach * reach - (rx0 + x) ** 2) - rz0

    # --- His pelvis: the engine. Arc + tilt, asymmetric spacing, hard stops.
    giver, impacts = [], set()
    for i in range(4):
        st = STROKES[i]
        c, n, h, o, mo, mi = stroke_frames(i)
        kk = st["travel"] / 0.1
        rows = [(c, 0.0, 0.0, 0.0, 0.0, 0.0),
                (c + 1, st["comp"], 0.002, 2.0, 0.0, 0.0)]
        if h:
            rows.append((c + 1 + h, st["comp"] * 0.85, 0.002, 2.5, 0.0, 1.5))
        rows += [(c + 2 + h, st["comp"] * 0.3, 0.001, 1.0, 0.0, 0.0),
                 (mo, -st["travel"] * 0.5, 0.004, -5 * kk, st["grind"], 0.0),
                 (o, -st["travel"], 0.0, -10 * kk, st["grind"] * 0.5, 0.0),
                 (mi, -st["travel"] * 0.62, -0.006, -6 * kk, -st["grind"] * 0.75, 0.0)]
        giver += rows
        impacts.add(c)
    giver = close_cycle(giver)
    impacts.add(CONTACTS[-1])
    for f, x, zmod, post, roll, yaw in giver:
        theta = -post  # posterior tilt = pubis up = negative about +Y
        key_bone(pb["M_pelvis"], f, loc=(x, 0, arc_z(x) + zmod), rot=(roll, theta, yaw))
        lean = -30 * x - 1.0
        s1 = -0.8 * theta + lean
        key_bone(pb["M_spine1"], f + 1, rot=(0, s1, 0))           # chest lags 1 frame
        key_bone(pb["M_neck"], f + 2, rot=(0, -0.5 * (theta + s1), 0))  # head stabilises

    # --- Her reaction: a scalar impulse per stroke, sent up the body with delays.
    impulse = []
    for i in range(4):
        st = STROKES[i]
        c, n, h, o, _mo, _mi = stroke_frames(i)
        s = st["s"]
        impulse += [(c, -0.35), (c + 1, 0.45 * s), (c + 2, 1.0 * s)]
        if h:
            impulse.append((c + 2 + h, 0.95 * s))
        impulse += [(c + 4 + h, 0.45 * s), (c + 6 + h, 0.05), (o + 2, -0.6)]
    impulse = close_cycle(impulse)

    chain = [  # bone, delay, loc per unit, rot per unit (deg, world axes)
        ("F_pelvis", 0, (0.030, 0, 0.004), (0, 3.5, 0)),
        ("F_spine1", 1, None, (0, 3.0, 0)),
        ("F_spine2", 2, None, (0, -1.5, 0)),
        ("F_chest", 2, None, (0, -2.0, 0)),
        ("F_neck", 3, None, (0, 2.0, 0)),
        ("F_head", 4, None, (0, 2.4, 0)),
        ("F_foot.L", 3, None, (0, 5.0, 0)),     # toes flick, L/R not twinned
        ("F_foot.R", 4, None, (0, 4.2, 0)),
    ]
    for name, delay, loc, rot in chain:
        for f, v in impulse:
            key_bone(pb[name], f + delay,
                     loc=tuple(a * v for a in loc) if loc else None,
                     rot=tuple(a * v for a in rot))

    # --- Breath: exhale on impact, inhale on the out-stroke (panting tempo).
    for name, amp in (("F_breath", 0.025), ("M_breath", 0.018)):
        keys = []
        for i in range(4):
            c, _n, h, o, _mo, _mi = stroke_frames(i)
            keys += [(c + 2 + h, 1 - amp * 0.6), (o, 1 + amp)]
        for f, sc in close_cycle(keys):
            key_bone(pb[name], f, scale=sc)

    loop_fcurves(rig, impacts={"M_pelvis": impacts})


def loop_fcurves(idblock, impacts=None):
    impacts = impacts or {}
    for fc in jb._fcurves(idblock):
        if not any(m.type == 'CYCLES' for m in fc.modifiers):
            fc.modifiers.new('CYCLES')
        bone = fc.data_path.split('"')[1] if '"' in fc.data_path else None
        for kp in fc.keyframe_points:
            if bone in impacts and int(round(kp.co.x)) in impacts[bone]:
                kp.handle_left_type = 'VECTOR'   # arrive at full speed: hard stop
        fc.update()


def impact_shape_key(her, amount):
    """Ass flattens where his hips hit, bulging out a little to the sides."""
    her.shape_key_add(name="Basis", from_mix=False)
    key = her.shape_key_add(name="impact", from_mix=False)
    for v, kd in zip(her.data.vertices, key.data):
        x, y, z = v.co
        if x > -0.12 or not (0.40 < z < 0.70) or abs(y) > 0.21:
            continue
        t = min(1.0, (-0.12 - x) / 0.09)
        push = amount * t * t * (3 - 2 * t)
        kd.co = v.co + V((push, 0.35 * push * min(1.0, abs(y) / 0.12) * math.copysign(1, y),
                          0.15 * push * math.copysign(1, z - 0.545)))
    keys = []
    for i in range(4):
        st = STROKES[i]
        c, n, h, _o, _mo, _mi = stroke_frames(i)
        peak = min(1.0, 0.7 * st["s"])
        keys += [(c, 0.6 * peak), (c + 1, peak)]
        if h:
            keys.append((c + 1 + h, peak * 0.95))
        keys += [(c + 2 + h, 0.55 * peak), (c + 4 + h, 0.1 * peak), (c + 6 + h, 0.0), (n - 1, 0.0)]
    for f, val in close_cycle(keys):
        key.value = val
        key.keyframe_insert("value", frame=f)
    loop_fcurves(her.data.shape_keys)


# ---------------------------------------------------------------- look

def material(name, color, rough, coat=0.0, sss=0.0, sheen=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    settings = {"Base Color": (*color, 1), "Roughness": rough, "Coat Weight": coat,
                "Coat Roughness": 0.12, "Subsurface Weight": sss,
                "Subsurface Radius": (1.0, 0.4, 0.25), "Subsurface Scale": 0.03,
                "Sheen Weight": sheen, "Specular IOR Level": 0.6}
    for k_, v in settings.items():
        if k_ in bsdf.inputs:
            bsdf.inputs[k_].default_value = v
    return mat


def look_at(obj, target):
    obj.rotation_euler = (V(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup_world_and_lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.008, 0.01, 0.022, 1)

    def light(name, kind, loc, target, energy, color, size=1.0):
        data = bpy.data.lights.new(name, kind)
        data.energy, data.color = energy, color
        if kind == 'AREA':
            data.size = size
        ob = bpy.data.objects.new(name, data)
        scene.collection.objects.link(ob)
        ob.location = loc
        look_at(ob, target)

    # Moody night-blue key, hot pink rim to carve the silhouette (where jiggle reads).
    light("Key", 'AREA', (0.9, -1.7, 2.1), (0, 0, 0.5), 130, (0.55, 0.66, 1.0), 1.4)
    light("Rim", 'AREA', (-0.7, 1.5, 1.7), (0.1, 0, 0.55), 260, (1.0, 0.4, 0.72), 0.9)
    light("Top", 'AREA', (0.0, 0.0, 2.6), (0, 0, 0), 22, (0.45, 0.5, 0.95), 2.0)
    light("Fill", 'POINT', (-0.3, -1.4, 0.45), (0, 0, 0.5), 5, (1.0, 0.72, 0.55))
    try:
        scene.view_settings.look = 'AgX - Punchy'
    except TypeError:
        pass


def build_set(floor_z):
    scene = bpy.context.scene

    def box(name, center, half, mat):
        cx, cy, cz = center
        hx, hy, hz = half
        verts = [(cx + sx * hx, cy + sy * hy, cz + sz * hz)
                 for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        return ob

    box("Bed", (-0.1, 0, floor_z - 0.15), (1.4, 0.95, 0.15),
        material("Sheets", (0.06, 0.03, 0.08), 0.55, sheen=0.6))
    box("Wall", (0, 1.35, 1.5), (3.0, 0.02, 1.6), material("Wall", (0.02, 0.022, 0.04), 0.8))


def setup_cameras(rig):
    scene = bpy.context.scene
    pb = rig.pose.bones

    # Side, like a wide establishing shot: static with a slow drift + impact shake.
    data = bpy.data.cameras.new("CamSide")
    data.lens = 40
    side = bpy.data.objects.new("CamSide", data)
    scene.collection.objects.link(side)

    # POV from his eyes: follows his head with a 2-frame lag, never glued to it.
    data = bpy.data.cameras.new("CamPOV")
    data.lens, data.clip_start = 24, 0.13
    pov = bpy.data.objects.new("CamPOV", data)
    scene.collection.objects.link(pov)

    shake = {46: (0, 0), 47: (0.55, -0.35), 48: (-0.4, 0.25), 49: (0.2, -0.12), 50: (-0.08, 0.05)}
    heads, hers = {}, {}
    for f in range(1, PERIOD + 1):
        scene.frame_set(f)
        heads[f] = rig.matrix_world @ pb["M_head"].head
        hers[f] = rig.matrix_world @ pb["F_pelvis"].head
    head0, her0 = heads[1], hers[1]
    for f in range(1, PERIOD + 2):
        g = (f - 1) % PERIOD + 1
        drift = math.sin(2 * math.pi * (f - 1) / PERIOD)
        sx, sz = shake.get(g, (0, 0))

        side.location = (0.0 + 0.012 * drift, -2.35, 0.80 + 0.008 * drift)
        look_at(side, (-0.12, 0, 0.50))
        side.rotation_euler.x += math.radians(sx * 0.6)
        side.rotation_euler.z += math.radians(sz * 0.6)
        side.keyframe_insert("location", frame=f)
        side.keyframe_insert("rotation_euler", frame=f)

        lag = heads[(g - 3) % PERIOD + 1]
        # Eye pushed out over his chest so the frame never starts inside his body.
        pov.location = head0 + V((0.20, -0.03, 0.0)) + (lag - head0) * 0.75
        look_at(pov, V((0.10, 0.0, 0.50)) + (hers[g] - her0) * 0.5)
        pov.rotation_euler.x += math.radians(sx)
        pov.rotation_euler.z += math.radians(sz)
        pov.keyframe_insert("location", frame=f)
        pov.keyframe_insert("rotation_euler", frame=f)
    for cam in (side, pov):
        for fc in jb._fcurves(cam):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
            fc.modifiers.new('CYCLES')
    return side, pov


# ---------------------------------------------------------------- QA

def qa(rig, her, him):
    scene = bpy.context.scene
    pb = rig.pose.bones
    skip = {him.vertex_groups[g].index for g in ("M_hand.L", "M_hand.R", "M_forearm.L", "M_forearm.R")}
    hand_verts = {v.index for v in him.data.vertices
                  if any(g.group in skip and g.weight > 0.2 for g in v.groups)}
    faces = {her: [list(p.vertices) for p in her.data.polygons],
             him: [list(p.vertices) for p in him.data.polygons
                   if not hand_verts.intersection(p.vertices)]}
    clip_frames, worst_reach, stretch, path = [], 0.0, [], []
    for f in range(1, PERIOD + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        trees = []
        for ob in (her, him):
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            trees.append(BVHTree.FromPolygons([v.co.copy() for v in me.vertices], faces[ob]))
            ev.to_mesh_clear()
        hits = trees[0].overlap(trees[1])
        if hits:
            clip_frames.append((f, len(hits)))
        for who in ("F", "M"):
            for s in ("L", "R"):
                d = (pb[f"{who}_forearm.{s}"].tail - pb[f"{who}_hand_ik.{s}"].head).length
                worst_reach = max(worst_reach, d)
                t = pb[f"{who}_thigh.{s}"]
                stretch.append((t.tail - t.head).length / t.bone.length)
        path.append(rig.matrix_world @ pb["M_pelvis"].head)
    return clip_frames, worst_reach, (min(stretch), max(stretch)), path


def close_jiggle_loop(rig):
    """Give baked jiggle curves a key at 65 == 1 and a Cycles modifier, so
    motion blur at the loop seam samples the right side of the cycle."""
    names = {pb.name for pb in jb.jiggle_bones(rig)}
    for fc in jb._fcurves(rig):
        if '"' in fc.data_path and fc.data_path.split('"')[1] in names:
            first = fc.keyframe_points[0]
            kp = fc.keyframe_points.insert(first.co.x + PERIOD, first.co.y)
            kp.interpolation = 'LINEAR'
            fc.modifiers.new('CYCLES')
            fc.update()


# ---------------------------------------------------------------- render

def render(out, cams, frames, samples, res):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.4
    scene.render.image_settings.file_format = 'PNG'
    scene.render.use_persistent_data = True
    for cam_name, (w, h) in cams:
        scene.camera = bpy.data.objects[cam_name]
        scene.render.resolution_x, scene.render.resolution_y = int(w * res), int(h * res)
        folder = os.path.join(out, cam_name)
        os.makedirs(folder, exist_ok=True)
        for f in frames:
            scene.frame_set(f)
            scene.render.filepath = os.path.join(folder, f"{f:04d}.png")
            bpy.ops.render.render(write_still=True)
        if len(frames) == PERIOD and shutil.which("ffmpeg"):
            encode(folder, os.path.join(out, cam_name))


def encode(folder, base):
    seq = os.path.join(folder, "%04d.png")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "3", "-framerate", str(FPS),
                    "-i", seq, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
                    base + ".mp4"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", seq,
                    "-vf", "split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a",
                    "-loop", "0", base + ".gif"], check=True)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="renders")
    ap.add_argument("--render", default="", help="comma list: side,pov")
    ap.add_argument("--frames", default="", help="e.g. 1,46,48 (default: whole loop)")
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--res", type=float, default=1.0, help="resolution multiplier")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, PERIOD

    her_parts, hair_parts, her_bones, her_elbows = build_her()
    her = metaball_mesh("BodyF", her_parts)
    carve_cleft(her)
    hair = metaball_mesh("HairF", hair_parts)

    # Fit his hips GAP behind her ass at the contact pose.
    probe_parts = build_him(0.0)[0]
    probe = metaball_mesh("Probe", probe_parts)
    gap = mesh_extent_x(her, min) - mesh_extent_x(probe, max)
    bpy.data.objects.remove(probe)
    dx = gap - GAP
    him_parts, him_bones, him_elbows, knee_to_hip = build_him(dx)
    him = metaball_mesh("BodyM", him_parts)
    floor_z = min(v.co.z for v in her.data.vertices) + 0.006
    print(f"[build] verts her={len(her.data.vertices)} him={len(him.data.vertices)} "
          f"hair={len(hair.data.vertices)} dx={dx:+.4f}")

    rig = build_rig(her_bones + him_bones)
    add_constraints(rig, {"F": her_elbows, "M": him_elbows})
    for ob, parts in ((her, her_parts), (him, him_parts), (hair, hair_parts)):
        field_weights(ob, parts)
        mod = ob.modifiers.new("Armature", 'ARMATURE')
        mod.object = rig
        sub = ob.modifiers.new("Subdiv", 'SUBSURF')
        sub.levels, sub.render_levels = 0, 1

    impact_shape_key(her, amount=0.03)
    animate(rig, knee_to_hip)

    jb.tag(rig, "F_breast.L", "breast", amount=1.5)
    jb.tag(rig, "F_breast.R", "breast", amount=1.5)
    # Ass: looser than the preset and pushed hard for the hentai read.
    jb.tag(rig, "F_butt.L", "butt", freq=3.6, damping=0.26, max_angle=24.0, amount=2.2)
    jb.tag(rig, "F_butt.R", "butt", freq=3.6 * 1.03, damping=0.26, max_angle=24.0, amount=2.2)
    jb.tag(rig, "F_belly", "belly", amount=0.9)
    for i in range(1, 5):
        # Hair preset is 1.4 Hz, right on top of the ~1.6 strokes/sec tempo:
        # resonance. Moved down >30% and damped harder (SKILL.md section 3).
        jb.tag(rig, f"F_hair{i}", "hair", freq=1.05, damping=0.5, max_angle=16.0, amount=0.6)
    jb.bake(rig, loop=True)
    close_jiggle_loop(rig)

    her.data.materials.append(material("SkinF", (0.80, 0.62, 0.55), 0.32, coat=0.35, sss=0.12))
    him.data.materials.append(material("SkinM", (0.33, 0.22, 0.17), 0.45, coat=0.15, sss=0.08))
    hair.data.materials.append(material("Hair", (0.42, 0.05, 0.02), 0.38, coat=0.2))
    setup_world_and_lights()
    build_set(floor_z)
    setup_cameras(rig)

    clips, reach, stretch, path = qa(rig, her, him)
    print(f"[qa] clipping frames: {clips if clips else 'none'}")
    print(f"[qa] worst IK miss: {reach * 1000:.1f} mm   thigh stretch: {stretch[0]:.3f}-{stretch[1]:.3f}")
    for jpb in jb.jiggle_bones(rig):
        peak = 0.0
        for f in range(1, PERIOD + 1):
            bpy.context.scene.frame_set(f)
            peak = max(peak, jpb.matrix_basis.to_quaternion().angle)
        print(f"[qa] jiggle {jpb.name:11s} peak swing {math.degrees(peak):5.1f} deg")
    xs = [p.x for p in path]
    zs = [p.z for p in path]
    print(f"[qa] his pelvis x range {min(xs):+.3f}..{max(xs):+.3f}  z range {min(zs):.3f}..{max(zs):.3f}")

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "doggy_motion_test.blend"))

    if args.render:
        frames = ([int(f) for f in args.frames.split(",")] if args.frames
                  else list(range(1, PERIOD + 1)))
        sizes = {"side": ("CamSide", (640, 360)), "pov": ("CamPOV", (480, 600))}
        cams = [sizes[c] for c in args.render.split(",")]
        render(out, cams, frames, args.samples, args.res)


if __name__ == "__main__":
    main()
