"""Spring-jiggle baker for Blender armatures.

Bakes damped-spring secondary motion (tits, ass, belly, thighs, balls, hair)
onto dedicated jiggle bones, driven by whatever the rest of the rig is doing.
Blender has no native jiggle bones; this fills that gap without an add-on and
without soft-body sims, and the result is plain keyframes you can still edit.

Run it LAST, after the primary motion is final. Re-run it every time the
primary motion changes -- it wipes and rewrites the jiggle bones' rotation.

Rig contract
------------
* Each jiggle bone is a dedicated bone parented to the body part the flesh
  hangs from (breast.L -> chest, butt.L -> pelvis). Never hand-key it.
* No constraints on jiggle bones.
* Head of the bone at the root of the mass, tail at its centre of mass
  (roughly behind the nipple for a tit, centre of the cheek for an ass).
  Skin weights for that flesh go on the jiggle bone.
* Chains work (hair strands, long jiggle chains): children are baked after
  their parents, so they ride on the parent's jiggle.

Usage
-----
From Blender's Python console or another script::

    import sys; sys.path.append("/path/to/scripts")
    import jiggle_bake as jb
    arm = bpy.data.objects["Armature"]
    jb.tag(arm, "breast.L", "breast")
    jb.tag(arm, "breast.R", "breast")       # .R/_R bones get auto-detuned
    jb.tag(arm, "butt.L", "butt", amount=1.4)
    jb.tag(arm, "butt.R", "butt", amount=1.4)
    jb.bake(arm, loop=True)                 # loop=True for seamless cycles

Or open this file in the Text Editor, select the armature, set LOOP below
and hit Run Script. Bones are picked up by their ``jiggle_freq`` custom
property, so tagging can also be done by hand in Bone > Custom Properties.
"""

import math

import bpy
from mathutils import Quaternion, Vector

# Used only when this file is run directly from Blender's Text Editor.
LOOP = False

#   freq     natural frequency in Hz. Lower = heavier, floppier.
#   damping  damping ratio. 0 = rings forever, 1 = no overshoot at all.
#   max_angle  hard limit on the swing in degrees, keeps flesh out of the body.
#   amount   multiplier on the final swing. 1.0 = physical, 1.3-2.0 = anime.
PRESETS = {
    "breast":       dict(freq=2.6, damping=0.22, max_angle=35.0, amount=1.0),
    "breast_large": dict(freq=1.9, damping=0.18, max_angle=45.0, amount=1.0),
    "butt":         dict(freq=4.2, damping=0.30, max_angle=20.0, amount=1.0),
    "belly":        dict(freq=3.4, damping=0.45, max_angle=12.0, amount=1.0),
    "thigh":        dict(freq=5.5, damping=0.50, max_angle=8.0,  amount=1.0),
    "balls":        dict(freq=2.2, damping=0.25, max_angle=40.0, amount=1.0),
    "hair":         dict(freq=1.4, damping=0.35, max_angle=70.0, amount=1.0),
}

_KEYS = ("freq", "damping", "max_angle", "amount")
_RIGHT_SUFFIXES = (".R", "_R", ".r", "_r", "-R", ".Right", "_Right")


def tag(arm, bone_name, preset="breast", lr_detune=0.03, **overrides):
    """Mark a pose bone as a jiggle bone using a preset plus overrides.

    Right-side bones get their frequency nudged by ``lr_detune`` so a pair
    never swings in perfect lockstep (twinning reads as fake).
    """
    if preset not in PRESETS:
        raise KeyError(f"Unknown preset {preset!r}; pick from {sorted(PRESETS)}")
    unknown = set(overrides) - set(_KEYS)
    if unknown:
        raise KeyError(f"Unknown jiggle settings: {sorted(unknown)}")
    settings = dict(PRESETS[preset])
    settings.update(overrides)
    if lr_detune and bone_name.endswith(_RIGHT_SUFFIXES) and "freq" not in overrides:
        settings["freq"] *= 1.0 + lr_detune
    pb = arm.pose.bones[bone_name]
    for key in _KEYS:
        pb["jiggle_" + key] = float(settings[key])
    return pb


def untag(arm, bone_name):
    pb = arm.pose.bones[bone_name]
    for key in _KEYS:
        if "jiggle_" + key in pb:
            del pb["jiggle_" + key]


def jiggle_bones(arm):
    return [pb for pb in arm.pose.bones if "jiggle_freq" in pb]


def bake(arm, frame_start=None, frame_end=None, loop=False, prerolls=None):
    """Simulate and bake every tagged jiggle bone on ``arm``.

    loop:     treat the range as a cycle (frame_end + 1 == frame_start). The
              sim is pre-rolled until it settles into a steady state, so the
              baked jiggle loops with no pop at the seam.
    prerolls: number of warm-up passes for loops; None picks enough for the
              spring's ringing to die below 0.1%.
    """
    scene = bpy.context.scene
    fs = scene.frame_start if frame_start is None else frame_start
    fe = scene.frame_end if frame_end is None else frame_end
    if fe <= fs:
        raise ValueError("Frame range needs at least two frames")
    fps = scene.render.fps / scene.render.fps_base
    dt = 1.0 / fps
    frames = list(range(fs, fe + 1))

    bones = jiggle_bones(arm)
    if not bones:
        raise RuntimeError(f"No bones on {arm.name!r} have a jiggle_freq property; use tag() first")

    names = {pb.name for pb in bones}
    levels = {}
    for pb in bones:
        depth, parent = 0, pb.parent
        while parent is not None:
            depth += parent.name in names
            parent = parent.parent
        levels.setdefault(depth, []).append(pb)

    for pb in bones:
        _remove_rotation_curves(arm, pb)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()

    original_frame = scene.frame_current
    try:
        # Parents first, so a child samples its parent's already-baked jiggle.
        for depth in sorted(levels):
            group = levels[depth]
            samples = {pb.name: ([], [], []) for pb in group}
            for f in frames:
                scene.frame_set(f)
                mw = arm.matrix_world
                for pb in group:
                    heads, tails, rots = samples[pb.name]
                    heads.append(mw @ pb.head)
                    tails.append(mw @ pb.tail)
                    rots.append((mw @ pb.matrix).to_3x3().normalized().to_quaternion())
            for pb in group:
                quats = _simulate(pb, *samples[pb.name], dt, loop, prerolls)
                _write_rotation(arm, pb, frames, quats)
    finally:
        scene.frame_set(original_frame)


def _simulate(pb, heads, tails, rots, dt, loop, prerolls):
    freq = pb["jiggle_freq"]
    zeta = pb["jiggle_damping"]
    amount = pb["jiggle_amount"]
    max_angle = math.radians(pb["jiggle_max_angle"])
    # Raw sim is limited tighter when amount > 1 so the final swing never
    # exceeds max_angle after scaling.
    sim_limit = min(max_angle / max(amount, 1e-6), math.pi * 0.95)

    omega = 2.0 * math.pi * freq
    k = omega * omega
    c = 2.0 * zeta * omega
    substeps = max(4, math.ceil(omega * dt / 0.15))
    h = dt / substeps

    n = len(tails)
    length = (tails[0] - heads[0]).length
    if length < 1e-9:
        raise ValueError(f"Jiggle bone {pb.name!r} has zero length")

    if loop:
        if prerolls is None:
            decay_per_pass = max(zeta * omega * dt * n, 1e-3)
            prerolls = min(50, math.ceil(math.log(1000.0) / decay_per_pass))
        passes = prerolls + 1
        steps = n
    else:
        passes = 1
        steps = n - 1

    pos = tails[0].copy()
    vel = (tails[1] - tails[0]) / dt
    out = [None] * n

    for p in range(passes):
        record = p == passes - 1
        if record:
            out[0] = pos.copy()
        for i in range(steps):
            j = (i + 1) % n
            t0, t1 = tails[i], tails[j]
            h0, h1 = heads[i], heads[j]
            target_vel = (t1 - t0) / dt
            head_vel = (h1 - h0) / dt
            for s in range(1, substeps + 1):
                a = s / substeps
                target = t0.lerp(t1, a)
                head = h0.lerp(h1, a)

                # Damping acts on velocity relative to the body, so flesh
                # doesn't trail behind a character that is just walking.
                acc = k * (target - pos) + c * (target_vel - vel)
                vel += acc * h
                pos += vel * h

                # Keep the bone rigid: tail stays at bone length from head.
                d = pos - head
                if d.length < 1e-9:
                    d = target - head
                d.normalize()
                pos = head + d * length
                rel = vel - head_vel
                vel -= d * rel.dot(d)

                # Clamp the swing. Hitting the limit bleeds energy, like
                # flesh slapping into the body underneath it.
                rest_dir = (target - head).normalized()
                angle = rest_dir.angle(d, 0.0)
                if angle > sim_limit:
                    axis = rest_dir.cross(d)
                    if axis.length > 1e-9:
                        axis.normalize()
                        d = Quaternion(axis, sim_limit) @ rest_dir
                        pos = head + d * length
                        vel = target_vel + (vel - target_vel) * 0.5
            if record and j != 0:
                out[j] = pos.copy()

    quats = []
    prev = None
    for i in range(n):
        rest_dir = tails[i] - heads[i]
        sim_dir = out[i] - heads[i]
        swing = rest_dir.rotation_difference(sim_dir)
        axis, angle = swing.to_axis_angle()
        swing = Quaternion(axis, min(angle * amount, max_angle))
        local = rots[i].inverted() @ swing @ rots[i]
        local.normalize()
        if prev is not None and local.dot(prev) < 0.0:
            local.negate()
        quats.append(local)
        prev = local
    return quats


def _fcurves(arm):
    """The fcurve collection for the armature's action, across API versions."""
    ad = arm.animation_data
    if ad is None or ad.action is None:
        return None
    slot = getattr(ad, "action_slot", None)
    if slot is not None:
        try:
            from bpy_extras.anim_utils import action_get_channelbag_for_slot
        except ImportError:
            action_get_channelbag_for_slot = None
        if action_get_channelbag_for_slot is not None:
            bag = action_get_channelbag_for_slot(ad.action, slot)
            return bag.fcurves if bag is not None else None
    return ad.action.fcurves


def _remove_rotation_curves(arm, pb):
    fcurves = _fcurves(arm)
    if fcurves is None:
        return
    paths = {pb.path_from_id(p) for p in
             ("rotation_quaternion", "rotation_euler", "rotation_axis_angle")}
    for fc in [fc for fc in fcurves if fc.data_path in paths]:
        fcurves.remove(fc)


def _write_rotation(arm, pb, frames, quats):
    # One keyframe_insert creates the curves (and the action/slot if needed);
    # the rest are bulk-filled, which is far faster than a key per frame.
    pb.rotation_quaternion = quats[0]
    pb.keyframe_insert("rotation_quaternion", frame=frames[0], group=pb.name)
    path = pb.path_from_id("rotation_quaternion")
    curves = {fc.array_index: fc for fc in _fcurves(arm) if fc.data_path == path}
    for idx in range(4):
        fc = curves[idx]
        points = fc.keyframe_points
        points.add(len(frames) - len(points))
        co = []
        for f, q in zip(frames, quats):
            co.extend((f, q[idx]))
        points.foreach_set("co", co)
        for kp in points:
            kp.interpolation = 'LINEAR'
        fc.update()


if __name__ == "__main__":
    obj = bpy.context.active_object
    if obj is None or obj.type != 'ARMATURE':
        raise SystemExit("Select the armature, then run the script.")
    bake(obj, loop=LOOP)
