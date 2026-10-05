import { FINGERTIPS, PALM, HAND_BONES } from '../landmarks.js';

// Approximate radius of the hand around each tracked joint, in metres.
export const JOINT_RADIUS = new Float32Array(21).fill(0.011);
for (const i of FINGERTIPS) JOINT_RADIUS[i] = 0.009;
for (const i of PALM) JOINT_RADIUS[i] = 0.014;

export const BONE_RADIUS = Float32Array.from(HAND_BONES, ([a, b]) => (JOINT_RADIUS[a] + JOINT_RADIUS[b]) / 2);
