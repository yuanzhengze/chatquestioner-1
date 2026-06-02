export const MECHANICS = [
  "drag-connect", "swap-match", "tap", "swipe", "merge", "score-combo",
  "dodge", "shoot", "build-and-upgrade", "wave-survival", "stack",
  "physics-launch", "path-find",
] as const;
export type Mechanic = (typeof MECHANICS)[number];
