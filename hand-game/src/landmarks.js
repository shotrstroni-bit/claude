// MediaPipe hand landmark indices and topology.
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const FINGERTIPS = [4, 8, 12, 16, 20];
export const PALM = [0, 5, 9, 13, 17];
export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
