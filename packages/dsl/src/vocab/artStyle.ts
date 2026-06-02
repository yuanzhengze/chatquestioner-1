export const ART_STYLES = [
  "pixel", "watercolor-cozy", "cyberpunk", "fantasy", "minimalist",
  "sci-fi", "cartoon", "neon", "retro", "realistic",
] as const;
export type ArtStyle = (typeof ART_STYLES)[number];
