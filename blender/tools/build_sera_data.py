"""Build blender/data/sera_base.npz from MakeHuman's CC0 assets.

You don't need to run this - the .npz is committed. It's here so the data
can be regenerated or extended (e.g. to add more shape sliders).

Sources (both from public package registries):
  - Base mesh, skin weights, joint helpers: npm package `makehuman-data`
    (public/data/models/human_full_size.json, the MakeHuman hm08 mesh)
  - Shape targets: PyPI package `makehuman` (makehuman/data/targets.npz)

Usage:
  python build_sera_data.py <human_full_size.json> <targets.npz> <out.npz>
"""
import json
import re
import sys

import numpy as np

# Simplified game skeleton: name -> (head joint, tail joint, parent).
# Joint names refer to MakeHuman "joint-*" helper groups; their centroids
# are recomputed from the morphed mesh at build time in Blender.
SKELETON = [
    ("hips", "pelvis", "spine-4", None),
    ("spine", "spine-4", "spine-3", "hips"),
    ("spine1", "spine-3", "spine-2", "spine"),
    ("chest", "spine-2", "spine-1", "spine1"),
    ("upper_chest", "spine-1", "neck", "chest"),
    ("neck", "neck", "head", "upper_chest"),
    ("head", "head", "head-2", "neck"),
]
for s in "lr":
    S = s.upper()
    SKELETON += [
        (f"shoulder.{S}", f"{s}-clavicle", f"{s}-shoulder", "upper_chest"),
        (f"upper_arm.{S}", f"{s}-shoulder", f"{s}-elbow", f"shoulder.{S}"),
        (f"forearm.{S}", f"{s}-elbow", f"{s}-hand", f"upper_arm.{S}"),
        (f"hand.{S}", f"{s}-hand", f"{s}-finger-3-1", f"forearm.{S}"),
        (f"thigh.{S}", f"{s}-upper-leg", f"{s}-knee", "hips"),
        (f"shin.{S}", f"{s}-knee", f"{s}-ankle", f"thigh.{S}"),
        (f"foot.{S}", f"{s}-ankle", f"{s}-foot-1", f"shin.{S}"),
        (f"toe.{S}", f"{s}-foot-1", f"{s}-foot-2", f"foot.{S}"),
        # breast bones have no joint helper; Blender script places them
        (f"breast.{S}", None, None, "chest"),
    ]
    for f in range(1, 6):
        for k in range(1, 4):
            parent = f"hand.{S}" if k == 1 else f"finger{f}_{k - 1}.{S}"
            SKELETON.append((f"finger{f}_{k}.{S}", f"{s}-finger-{f}-{k}",
                             f"{s}-finger-{f}-{k + 1}", parent))

BONE_NAMES = [b[0] for b in SKELETON]


def map_mh_bone(name):
    """Map a MakeHuman default-skeleton bone to a simplified bone."""
    name = name.replace("____head", "")
    side = name[-1] if name.endswith((".L", ".R")) else None
    base = name[:-2] if side else name
    table = {
        "root": "hips", "spine05": "hips", "pelvis": "hips",
        "spine04": "spine", "spine03": "spine1", "spine02": "chest",
        "spine01": "upper_chest", "neck01": "neck", "neck02": "neck",
        "neck03": "neck", "clavicle": "shoulder", "shoulder01": "shoulder",
        "upperarm01": "upper_arm", "upperarm02": "upper_arm",
        "lowerarm01": "forearm", "lowerarm02": "forearm", "wrist": "hand",
        "upperleg01": "thigh", "upperleg02": "thigh",
        "lowerleg01": "shin", "lowerleg02": "shin", "foot": "foot",
        "breast": "breast",
    }
    if base in table:
        tgt = table[base]
    elif base.startswith("metacarpal"):
        tgt = "hand"
    elif m := re.match(r"finger(\d)-(\d)", base):
        tgt = f"finger{m[1]}_{m[2]}"
    elif base.startswith("toe"):
        tgt = "toe"
    else:
        tgt = "head"  # face, eyes, jaw, tongue...
    return f"{tgt}.{side}" if side and tgt not in ("hips", "head") else tgt


# Shape targets copied into the data file (MakeHuman target paths).
TARGETS = [
    "macrodetails/universal-female-young-averagemuscle-averageweight",
    "macrodetails/universal-female-young-averagemuscle-maxweight",
    "macrodetails/universal-female-young-maxmuscle-averageweight",
    "macrodetails/height/female-young-averagemuscle-averageweight-maxheight",
    "macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions",
    "breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness",
    "breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness",
    "breast/breast-trans-up", "breast/breast-dist-decr", "breast/breast-point-incr",
    "measure/measure-hips-circ-incr", "hip/hip-scale-horiz-incr", "hip/hip-scale-depth-incr",
    "buttocks/buttocks-volume-incr", "measure/measure-waist-circ-decr",
    "measure/measure-thigh-circ-incr", "measure/measure-calf-circ-incr",
    "measure/measure-bust-circ-incr", "measure/measure-underbust-circ-decr",
    "measure/measure-upperleg-height-incr", "measure/measure-lowerleg-height-incr",
    "measure/measure-napetowaist-dist-decr", "measure/measure-shoulder-dist-decr",
    "measure/measure-neck-circ-decr", "measure/measure-upperarm-circ-decr",
    "measure/measure-ankle-circ-decr", "measure/measure-wrist-circ-decr",
    "stomach/stomach-pregnant-decr", "torso/torso-scale-horiz-decr",
    "pelvis/pelvis-tone-incr",
    "head/head-oval", "head/head-scale-vert-decr", "chin/chin-width-decr",
    "mouth/mouth-lowerlip-volume-incr", "mouth/mouth-upperlip-volume-incr",
    "nose/nose-scale-horiz-decr", "neck/neck-scale-vert-incr",
]
for s in "lr":
    TARGETS += [f"armslegs/{s}-upperleg-fat-incr", f"armslegs/{s}-lowerleg-fat-incr",
                f"armslegs/{s}-hand-scale-decr", f"armslegs/{s}-foot-scale-decr",
                f"ears/{s}-ear-shape-pointed", f"ears/{s}-ear-scale-vert-incr",
                f"ears/{s}-ear-scale-incr", f"ears/{s}-ear-rot-backward",
                f"ears/{s}-ear-trans-up", f"eyes/{s}-eye-scale-incr",
                f"eyes/{s}-eye-corner1-up", f"eyes/{s}-eye-corner2-up",
                f"cheek/{s}-cheek-bones-incr"]


def parse_threejs_faces(F, mats):
    i, out = 0, []
    while i < len(F):
        t = F[i]; i += 1
        n = 4 if t & 1 else 3
        vs = F[i:i + n]; i += n
        m = 0
        if t & 2: m = F[i]; i += 1
        if t & 4: i += 1
        uvs = None
        if t & 8: uvs = F[i:i + n]; i += n
        if t & 16: i += 1
        if t & 32: i += n
        if t & 64: i += 1
        if t & 128: i += n
        out.append((vs, mats[m], uvs))
    return out


def main(json_path, targets_path, out_path):
    d = json.load(open(json_path))
    V = np.array(d["vertices"], dtype=np.float32).reshape(-1, 3)
    UV = np.array(d["uvs"][0], dtype=np.float32).reshape(-1, 2)
    faces = parse_threejs_faces(d["faces"], [m["DbgName"] for m in d["materials"]])

    out = {"base_verts": V, "bone_names": np.array(BONE_NAMES),
           "bone_parents": np.array([b[3] or "" for b in SKELETON]),
           "bone_heads": np.array([b[1] or "" for b in SKELETON]),
           "bone_tails": np.array([b[2] or "" for b in SKELETON])}

    for part in ("body", "helper-hair", "helper-l-eye", "helper-r-eye"):
        fs = [f for f in faces if f[1] == part]
        key = part.replace("helper-", "")
        out[f"faces_{key}"] = np.array([f[0] for f in fs], dtype=np.int32)
        out[f"uvs_{key}"] = UV[np.array([f[2] for f in fs])].astype(np.float32)

    joints = {}
    for vs, m, _ in faces:
        if m.startswith("joint-"):
            joints.setdefault(m[6:], set()).update(vs)
    for name, vs in joints.items():
        out[f"joint:{name}"] = np.array(sorted(vs), dtype=np.int32)

    # skin weights -> simplified skeleton, top 4 per vertex, normalized
    si = np.array(d["skinIndices"]).reshape(-1, 4)
    sw = np.array(d["skinWeights"], dtype=np.float32).reshape(-1, 4)
    mh_to_ours = np.array([BONE_NAMES.index(map_mh_bone(b["name"])) for b in d["bones"]])
    W = np.zeros((len(V), len(BONE_NAMES)), dtype=np.float32)
    for k in range(4):
        np.add.at(W, (np.arange(len(V)), mh_to_ours[si[:, k]]), sw[:, k])
    top = np.argsort(-W, axis=1)[:, :4]
    topw = np.take_along_axis(W, top, axis=1)
    topw /= np.maximum(topw.sum(1, keepdims=True), 1e-8)
    out["weight_bones"] = top.astype(np.uint8)
    out["weight_values"] = topw.astype(np.float16)

    z = np.load(targets_path, allow_pickle=True)  # license entry is a pickled string
    for t in TARGETS:
        out[f"target:{t}:index"] = z[f"targets/{t}.index"].astype(np.int32)
        out[f"target:{t}:vector"] = z[f"targets/{t}.vector"]  # int16, x1e-3 decimeters

    np.savez_compressed(out_path, **out)
    print("wrote", out_path, len(out), "arrays")


if __name__ == "__main__":
    main(*sys.argv[1:4])
