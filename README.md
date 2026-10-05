# claude

## Skills

- [`hentai-motion`](.claude/skills/hentai-motion/SKILL.md): motion rules for adult sex-scene animation in Blender (3D) and 2D hentai style. Covers thrust mechanics, partner reaction, jiggle, penetration and contact deformation, face and breath, climax timing, loops and camera. Includes [`jiggle_bake.py`](.claude/skills/hentai-motion/scripts/jiggle_bake.py), a spring-jiggle baker for Blender 4.2+ and 5.x.

## Examples

- [`examples/doggy_motion_test.py`](examples/doggy_motion_test.py): a full motion test built with the skill. It creates two adult mannequins from metaballs and rigs them in one armature, with IK arms locked to the partner and knee-pivot thighs. It then keys a 4-stroke, 64-frame loop and bakes the jiggle. It checks for clipping, IK reach and thigh stretch, then renders side and POV cameras with Cycles to PNG, MP4 and GIF. Run it with Blender's Python: `python examples/doggy_motion_test.py --out renders --render side,pov`.
