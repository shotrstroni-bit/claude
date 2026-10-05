---
name: hentai-motion
description: Motion rules for animating explicit adult sex scenes in Blender (3D) or planning 2D hentai-style animation. Covers thrust mechanics, partner reaction, overlap, jiggle and secondary motion, penetration and contact deformation, face and breath, climax timing, loops, camera, and a jiggle-bake script. Use it whenever keying, scripting, or critiquing sexual animation.
---

# Hentai Motion Rules

**Hard line:** every character is an adult with an adult body. No child-coded proportions, faces, or framing, whatever age the character is given. If a rig or a request reads as a kid, stop and say so plainly.

Everything below assumes human scale in Blender meters and 24 fps unless stated otherwise. To convert frame counts, multiply by 1.25 for 30 fps and by 2.5 for 60 fps.

---

## 0. Order of work

Work in passes. Lock each pass before starting the next. Animating everything at once gives mush.

1. **Beat map**: phase, stroke count, tempo per phase, where the cuts land.
2. **Key poses** for both bodies: contact (extreme in), extreme out, and one breakdown.
3. **Pelvis/root pass**, which is the engine (§1).
4. **Receiver reaction pass** (§2).
5. **Spine, neck and head overlap.**
6. **Limbs**: IK contacts, grips, fingers, toes (§6).
7. **Face and breath** (§5).
8. **Jiggle bake** with `scripts/jiggle_bake.py`. This always comes after the body is final (§3).
9. **Deformation**: contact flattening and penetration stretch (§4).
10. **Polish**: arcs, breaking up repetition, moving holds (§9).
11. **Camera and cuts** (§10).

---

## 1. Thrust mechanics: the engine

**The pelvis moves on an arc. It is never a piston on a rail.** Translation and rotation happen together:

- **In-stroke:** forward, slightly up, posterior tilt (tailbone tucks under).
- **Out-stroke:** back, slightly down, anterior tilt (lower back arches).
- From the side, the path is a flattened ellipse. Check it with Motion Paths.

**Ranges:**

| | slow/tease | steady | fast/frantic |
|---|---|---|---|
| Pelvis travel | 0.12–0.18 m (full pull-out now and then) | 0.08–0.12 m | 0.04–0.07 m |
| Pelvic tilt | 12–18° | 10–14° | 6–10° |
| Vertical arc | 0.02–0.03 m | 0.015 m | 0.01 m |

**Tempo:**

| Phase | strokes/sec | frames per cycle @24 | @30 | @60 |
|---|---|---|---|---|
| Tease | 0.5–0.8 | 30–48 | 38–60 | 75–120 |
| Steady | 1.0–1.5 | 16–24 | 20–30 | 40–60 |
| Fast | 2.0–2.5 | 10–12 | 12–15 | 24–30 |
| Frantic | 3.0–3.5 | 7–8 | 9–10 | 17–20 |

**Spacing is asymmetric.** Never use a symmetric sine.

- The in-stroke takes about 35–45% of the cycle and accelerates into contact.
- The out-stroke takes about 55–65%. It eases out of contact and eases into the back extreme.

**Impact is a hard stop.**

- In the Graph Editor, give the contact key a steep in-tangent (Free/Vector handle aimed into the key) and a flat out-tangent.
- After contact, add 1–2 frames of compression: the bodies squash 0.005–0.01 m past the contact point, then settle over 1–2 frames.
- That sharp deceleration is what drives the jiggle. A soft stop gives dead flesh.

**Weight comes from the legs.**

- Show the push: ankle and knee extension leads the pelvis by 1–2 frames.
- Standing giver: knees flex on the out-stroke and extend to drive the in-stroke.
- Kneeling giver: the thighs swing around pinned knees.
- A thrust with no push from the legs looks like a pelvis on a stick.

**Momentum:**

- When the pelvis drives forward, the upper torso counter-moves back slightly (2–4° through the spine).
- The head moves less than the chest because the neck absorbs it.
- The giver's arms follow 1–2 frames behind the chest.

---

## 2. Receiver reaction: every impact gets answered

**Displacement.** The receiver's pelvis travels 15–40% of the giver's stroke in the push direction, then returns 1–2 frames behind the out-stroke. How far depends on the brace:

- Braced against a headboard or wall: about 10%.
- Loose on all fours: 35% or more.

**The wave.** The impact travels up the body. Each part moves this many frames after the contact frame:

| pelvis | lumbar | chest | neck | head | hair, hand tips |
|---|---|---|---|---|---|
| 0 | +1 | +2 | +3 | +3–4 | +4–6 |

Amplitude grows toward the end of the chain like a whip, then decays.

**Braced limbs are springs.**

- Elbows and knees bend 3–8° on impact and recover.
- Planted hands and knees use IK and stay pinned, with zero sliding.
- Missionary exception: the body creeps up the bed over many strokes while the sheets bunch. It's a great realism detail.

**The receiver is not a sandbag.** Give them their own drive: pushing back into strokes, rolling the hips up to meet them, grinding, gripping.

### Position notes

- **Doggy:**
  - The thrust is horizontal. The back dips (lordosis) on the in-stroke and rounds slightly on the out-stroke.
  - The ass is the impact surface, so it gets the biggest ripple. The head bobs forward, then back.
  - Tits hang as pendulums. They swing forward on impact and back on the out-stroke, with a much bigger swing than when upright.
- **Missionary:**
  - The push runs partly up the bed. The receiver slides 0.5–2 cm per stroke and gets pulled back.
  - Legs wrapped: calves squeeze on the in-stroke. Legs up: feet bounce 3–5 frames late and the toes flex.
  - Tits flatten, sway sideways, ride up toward the chin on impact, and fall back.
- **Cowgirl / riding:**
  - The rider is the engine: a vertical bounce with knees and thighs as springs, plus a forward/back hip rock that makes a figure-8 from the side.
  - The rise is slower than the drop, because gravity pulls the drop. The landing is the impact frame for belly, ass, tits and thighs.
  - Leaning forward: hands on the partner's chest, tits hanging. Leaning back: hands on the thighs, back arched.
- **Standing / against a wall:**
  - The planted leg carries everything, and its knee buckles slightly on impacts.
  - The chest and cheek flatten against the wall on contact.
- **Oral:**
  - The head moves on an arc around the neck pivot, not a straight bob. The shoulders follow 1–2 frames late.
  - A hand on the shaft runs in phase with the head, leading it by 1–2 frames, or in counter-phase.
  - The cheeks hollow on the pull-back (suction shape key). Add a throat bulge on deep strokes.

---

## 3. Flesh: jiggle and secondary motion

**Jiggle is a damped spring driven by acceleration.** It reacts to changes in speed, not to speed itself.

- Constant motion makes almost no jiggle. Hard stops and direction changes make all of it.
- If the jiggle looks weak, fix the primary motion's spacing before touching the spring settings.

**Settings** (presets in `scripts/jiggle_bake.py`):

| Part | Preset | freq (Hz) | damping ratio | max ° | Notes |
|---|---|---|---|---|---|
| Tits, average | `breast` | 2.4–2.8 | 0.18–0.25 | 35 | Bigger means lower freq and lower damping |
| Tits, large | `breast_large` | 1.7–2.1 | 0.15–0.20 | 45 | |
| Ass cheek | `butt` | 3.8–4.8 | 0.25–0.35 | 20 | Also needs an impact shape key (below) |
| Belly | `belly` | 3.0–4.0 | 0.40–0.50 | 12 | Softer belly means lower freq |
| Thighs | `thigh` | 5.0–6.0 | 0.45–0.55 | 8 | Inner and back of thigh only |
| Balls | `balls` | 2.0–2.4 | 0.20–0.30 | 40 | Swing forward on the in-stroke and slap |
| Hair | `hair` | 1.2–1.6 | 0.30–0.40 | 70 | Chains of 3–5 bones |

**Rules:**

- **Pendulum, not a glued-on ball.** The jiggle bone's head sits at the root of the mass (chest wall, top of the cheek). Its tail sits at the centre of the mass.
- **Figure-8 tits.** When the drive has both vertical and sideways components, tits trace a figure-8.
  - Vertical motion dominates.
  - Sideways motion is about 40–60% of the vertical.
  - In/out motion is the smallest.
- **Lag.**
  - Tits peak 2–4 frames after the chest stops.
  - An ass cheek peaks 1–2 frames after impact, because it is stiffer and faster.
  - If the jiggle peaks on the same frame as the body, it reads as glued on.
- **Damping.**
  - Slow phases: 2–4 visible rebounds at most.
  - Fast phases: 1–2 rebounds, because the next impact interrupts the swing.
  - Flesh that keeps ringing after the body stops is jello. Raise the damping.
- **No twinning.** Pairs should never move in perfect lockstep.
  - `tag()` detunes `.R` bones by 3% automatically.
  - A 1-frame offset on top of that helps.
- **Resonance.** If the stroke frequency is close to the jiggle frequency, the amplitude blows up.
  - Fix it by moving the jiggle frequency at least 30% away from the stroke frequency, or by raising the damping.
  - `max_angle` is a safety net, not a style choice.
- **Style dial (`amount`).**
  - 0.7–1.0 looks realistic. 1.3–2.0 gives anime/hentai exaggeration.
  - Exaggerate tits and ass. Leave thighs and belly near 1.
- **Ass impact needs two layers:**
  - Bone jiggle for the whole-cheek bounce.
  - An "impact" corrective shape key: the cheek flattens where the pelvis hits and bulges out around the contact. Key it 0 → 1 on the contact frame → 0.3 → 0 over 3–4 frames, or drive it from contact distance.
  - To fake a ripple traveling outward, use two ring shape keys keyed one frame apart.
- **Bake last, rebake after any change.** Jiggle is the last motion pass. For loops, bake with `loop=True`.
- **Specular sells jiggle.** Oiled or sweaty skin with a tight specular highlight shows every ripple. Matte skin hides it.

---

## 4. Contact, penetration, no clipping

**Zero visible interpenetration.** Check every frame of each contact window from three angles: camera, side and top.

**Shaft path.**

- Rig the shaft as a chain of 3–6 bones with Spline IK onto a curve that runs through the receiving canal. Parent the curve to the receiver's pelvis.
- Drive depth from one control, for example a 0–1 custom property driving the Spline IK chain's position along the curve.
- The shaft bends with the canal. It never stays ruler-straight while the receiver's pelvis tilts.

**Entrance stretch.**

- Add shape keys on the receiver: labia spread or anal-ring stretch.
  - On the in-stroke the tissue pulls slightly inward.
  - On the out-stroke it drags outward, lagging 1–3 frames.
- Drive the shape keys from depth and girth.
- **The out-stroke drag is the single biggest realism tell.**

**Bulge (optional hentai trope).** Add a belly bulge shape key driven by depth above about 0.8. It pairs with an x-ray cut-in (§10).

**Body-to-body contact.**

- Where hips meet ass or thighs, flesh flattens. It never overlaps.
- Options, from cheapest to most work:
  1. Corrective shape keys driven by distance.
  2. A Vertex Weight Proximity modifier feeding a Displace modifier, which pushes skin along its normal based on nearness to the other body.
  3. Shrinkwrap in Project/Outside mode, limited to a vertex group.
- Contact flattening must land on the impact frames.

**Grip.**

- Fingers sink into flesh, and skin bunches around the fingertips. Use a proximity displace or a shape key under the hand.
- The grip tightens on each in-stroke.

**Vary depth.** Not every stroke bottoms out. A good pattern:

- 3–5 shallow-to-medium strokes.
- Then one full deep stroke with a 2–4 frame hold at contact and a bigger reaction.

**Erect shaft.** Mostly rigid.

- Outside the body, give the tip a tiny damped secondary motion (freq 6+ Hz, damping around 0.6).
- Inside the body, no jiggle.
- The balls get full jiggle.

---

## 5. Face, breath, voice

**Breathing never stops.** It moves the chest, belly and shoulders.

| State | Cycle length |
|---|---|
| Rest | 3–4 s |
| Aroused | 1.2–2 s |
| Panting, mouth open | 0.4–0.6 s |

- Exhale or moan on the impact. Inhale on the out-stroke.

**Reaction lag.** The face reacts 1–3 frames after contact, never on the contact frame. On big impacts:

- The eyes squeeze.
- The inner brows lift and knit (the pleasure-pain brow).
- The mouth opens on the vowel.

**Mouth matches sound.**

| Sound | Mouth shape |
|---|---|
| "ah" | Jaw open |
| "oh" / "oo" | Lips rounded |
| "nn" / "mm" | Lips pressed, cheeks tight |
| "hah" | Breathy, half open |

- Moan audio peaks land on the impact frame +1.
- If there is audio, animate to the audio. Don't make the audio fit the animation.

**Eyes.**

- Blink rate drops under concentration and spikes after climax.
- Add darts and unfocused stares.
- The lids rest half-closed when aroused, and the eyes roll up at peaks.

**Hentai face tropes.** Escalate these deliberately across the scene:

- A blush mask that ramps up with intensity.
- Sweat sheen that builds over time.
- Drool, and tears at the eye corners.
- Heart-shaped pupils or highlights, done with a shader or texture swap.
- **Ahegao** (eyes rolled up, tongue out, jaw slack): save it for climax. It's the payoff, not a resting face.

**The giver acts too.** Jaw clench on deep strokes, exhale through the teeth, head drop at climax.

---

## 6. Hands and feet

- **Hands are never dead.**
  - They grip sheets (fingers curl further as the scene builds), clutch hips, slide along the back, pull hair, or brace on the wall.
  - The grip pulses with each impact.
- **Toes curl** at intensity peaks and through the climax. Feet flex and point. In missionary, the calves squeeze.
- **Hands on another body are locked to it** with IK plus Child Of (or Copy Transforms) to the partner's bone. Hands must never swim across skin by accident.

---

## 7. Scene arc and rhythm

A sex scene is a performance with a shape. Map it before animating.

1. **Tease and entry.**
   - Slow, long strokes, with pauses and big facial reactions.
   - First penetration is slow: hold the entrance stretch for 6–12 frames, with a big breath reaction.
2. **Build.**
   - Tempo ramps over 4–8 cycles, each cycle 5–10% shorter than the last.
   - Never jump tempo unless the jump is the beat.
3. **Fast / frantic.**
   - Short strokes and high tempo.
   - The jiggle is constantly interrupted, and the faces get messy.
4. **Climax.**
   - **Tension:** a 6–12 frame hold. The back arches, legs lock, toes curl, hands clench, and the breath stops.
   - **Release:** 3–6 irregular spasms, 8–16 frames apart, each weaker than the last.
   - **Tremor:** whole-body noise at 8–12 Hz and 0.5–2°, fading over 1–2 s. At 24 fps, 12 Hz is the limit: alternate the jitter every frame.
   - **Giver's orgasm:** a deep push and hold, then 3–6 hip pulses 0.6–0.9 s apart, getting weaker.
5. **Afterglow.**
   - Heavy breathing that slows over 2–4 s.
   - Random aftershock twitches 1–2 s apart, decaying.
   - Muscles let go and the bodies settle into each other with real weight.

---

## 8. Loops

Hentai loops are standard. They must be seamless and must not look robotic.

- **Last key = first key.** The render range excludes the duplicate: keys at 1 and 25, range 1–24.
  - Add a Cycles F-curve modifier when extending.
  - This is also the frame convention `jiggle_bake.bake(loop=True)` expects.
- **Every channel's cycle must divide the loop length.** Example for a 64-frame loop of 4 strokes:
  - Pelvis on a 16-frame cycle.
  - Breath on 32 or 64.
  - Blinks off the impact frames.
- **Vary strokes inside the loop:** one deeper, one quicker, one with a grind.
  - A 2–4 stroke loop with variation reads as alive.
  - One stroke repeated reads as a GIF.
- **Noise modifiers break loops.** In a loop, hand-key the variation instead. Use Noise only on non-looping shots.
- **Bake jiggle with `loop=True`.** It pre-rolls to a steady state, so nothing pops at the seam.

---

## 9. Graph Editor and polish

- **Motion Paths on the pelvis, chest, head, tit tails and hands.** Every path must be a clean arc or ellipse. Fix zigzags, kinks and straight lines.
- **Ease asymmetry everywhere.** Breathing is the only channel allowed to be a near-perfect sine.
- **No twinning.**
  - Left and right never hit keys on the same frame with mirrored values.
  - Offset them 1–2 frames and vary the amplitude 10–20%.
- **Moving holds.** Nothing is ever 100% still. A hold drifts 1–2% through breath and weight shifts.
- **Overshoot and settle.** Heads and hands go 1–2 frames past a stop, then come back.
- **Heads rotate around the neck.** They never just translate.
- **Silhouette test.** Play it as flat black shapes. The motion still has to read.
- **Final check.** Before calling it done, watch it at speed, looping, full screen, with the rig hidden.
- **Anime look in 3D:**
  - Stepped Interpolation F-modifier (step 2) on the body channels, so it animates on twos.
  - Toon shading: Shader to RGB into a Color Ramp.
  - Line Art modifier for outlines.

**Follow-through offset.** Delay a chain by shifting its keys. Run this after the main pass, with Cycles modifiers on looped curves so the shifted keys wrap:

```python
import jiggle_bake as jb  # for its version-proof fcurve lookup

def offset_bone_keys(arm, bone_name, frames):
    prefix = arm.pose.bones[bone_name].path_from_id() + "."
    for fc in jb._fcurves(arm):
        if fc.data_path.startswith(prefix):
            for kp in fc.keyframe_points:
                kp.co.x += frames
                kp.handle_left.x += frames
                kp.handle_right.x += frames
            fc.update()

# Receiver wave up the spine
for bone, delay in (("spine.001", 1), ("spine.002", 2), ("neck", 3), ("head", 4)):
    offset_bone_keys(arm, bone, delay)
```

---

## 10. Camera and editing

- **Shot grammar** (the hentai standard):
  1. Wide/establishing: whole bodies, so the rhythm reads.
  2. Medium: torso, tits and faces.
  3. Insert: penetration close-up.
  4. Face reaction close-up.
  5. Optional x-ray or cross-section cut-in.
  6. Back out to the wide.
- Hold shots for 2–6 s. **Cut on impacts**, never mid-stroke.
- **Moves have intent.**
  - A slow push-in during the build.
  - Faint handheld noise (Noise modifier at 0.5–1 Hz, very low strength).
  - A 2–4 frame shake on big impacts: 0.5–1°, decaying.
- **Follow cam with lag.**
  - Parent the camera to an empty that follows the pelvis area through Copy Location at 0.3–0.6 influence, or key the empty by hand.
  - Never parent the camera rigidly to a bone. That glues the frame to the motion and kills the sense of motion.
- **Lenses.**
  - 35–50 mm for wides.
  - 50–85 mm for mediums and faces.
  - 85–135 mm for inserts.
  - Shallow DoF on face close-ups.
- **Frame rate and blur.**
  - 3D loops look smoothest at 60 fps. Use 24 or 30 for a cinematic feel.
  - At fast tempos, set the motion blur shutter to 0.3–0.5.

---

## 11. 2D hentai (frame-by-frame, Grease Pencil, Live2D, Spine)

**Limited animation is the look.**

- Thrust cycles are 3–6 drawings on twos (12 fps). Climaxes go on ones.
- Drawing order: contact (extreme in), a breakdown favoring the out side, extreme out, then 1–2 in-betweens on the out side only.
- The fast in-stroke gets fewer drawings than the slow out-stroke.

**Impact drawing.**

- The contact drawing can run one frame shorter than the others.
- Add a 1-frame flash, or impact and speed lines.
- Squash the ass and thighs on that drawing.

**Jiggle layer.**

- Run the jiggle as its own cycle, offset 1–2 drawings behind the body.
- Tits squash on the drop and stretch on the rise, keeping their volume.
- Use smears or multiples on fast strokes.

**Overlays sell it:**

- Sweat drops, steam, breath puffs.
- Blush hatching and speed lines.
- Cut-in panels (x-ray, face close-up).
- Sound-effect text such as パンパン (*pan pan*, slapping) and ぐちゅ (*guchu*, wet).

**Live2D / Spine physics.** Map the jiggle presets onto their pendulum settings:

| Jiggle setting | Live2D / Spine equivalent |
|---|---|
| Bone length | Pendulum length |
| freq | Reaction speed / strength |
| damping | Convergence / damping |
| amount | Output scale |

- Give the tits their own physics group, driven by the body's Y-position and angle parameters.

**Grease Pencil.**

- Turn Onion Skin on.
- Use the Time Offset modifier for holds and loops.
- Animate on twos.

---

## 12. Dead-puppet checklist

Fix every one of these before showing anything:

- [ ] The pelvis moves in a straight line (piston). It needs an arc plus tilt.
- [ ] In and out strokes have the same timing. Make them asymmetric.
- [ ] Contact has no hard stop and no compression frame.
- [ ] The thrust has no leg drive.
- [ ] The receiver doesn't react, or the whole body moves as one block. Add the wave.
- [ ] Jiggle peaks on the same frame as the body (glued on), or keeps ringing like jello.
- [ ] Left and right move in perfect lockstep.
- [ ] Any clipping, anywhere.
- [ ] Hands, knees or feet slide when they should be planted.
- [ ] There's no out-stroke drag at the entrance.
- [ ] One tempo runs for the whole scene.
- [ ] Faces are dead, or breathing stops.
- [ ] Ahegao or other payoff faces show up before the climax.
- [ ] The loop pops at the seam.
- [ ] Every stroke is an identical clone.

---

## Using the jiggle baker

`scripts/jiggle_bake.py` bakes a damped spring onto dedicated jiggle bones and writes plain keyframes. It needs no add-on and no soft-body sim. It is tested on Blender 4.2 and 5.0.

**Rig contract:**

- Each jiggle bone is a dedicated bone, parented to the body part the flesh hangs from.
- No hand keys and no constraints on jiggle bones. The script owns their rotation.
- The head sits at the root of the mass and the tail at its centre.
- The skin weights for that flesh go on the jiggle bone.
- Chains (hair) are fine. Parents bake first.

**Example:**

```python
import sys, bpy
sys.path.append("/path/to/.claude/skills/hentai-motion/scripts")
import jiggle_bake as jb

arm = bpy.data.objects["Armature"]
jb.tag(arm, "breast.L", "breast", amount=1.4)   # anime exaggeration
jb.tag(arm, "breast.R", "breast", amount=1.4)   # .R auto-detuned 3%
jb.tag(arm, "butt.L", "butt")
jb.tag(arm, "butt.R", "butt")
jb.tag(arm, "belly", "belly")
jb.bake(arm, loop=True)          # loop=False for one-shot shots
```

**Tuning:**

- Change the primary motion, then rebake. The bake is idempotent.
- Tweak per bone with keyword overrides, for example `tag(..., freq=2.2, damping=0.3)`, or edit the `jiggle_*` custom properties in the Bone panel and rebake.
- Swing too small? Sharpen the contact spacing first (§1), then raise `amount`.
- Clipping into the body? Lower `max_angle`.

**When Claude writes Blender Python for these scenes:**

- Key primary motion with a few hand-shaped keys (contact, extremes, breakdown), with handles set per §1. Don't bake curves per frame.
- Use quaternion rotation on anything that swings far.
- Verify arcs by evaluating F-curves or Motion Paths before reporting a pass as done.
