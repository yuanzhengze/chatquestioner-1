// 种子枚举：UI_game_ui_matrix 的 7 genre + 常见玩法类目。可扩展。
export const GENRES = [
  "match-3", "merge-puzzle", "puzzle", "tower-defense", "shooter",
  "platformer", "runner", "rpg", "roguelike", "card-battler",
  "board", "idle", "action", "strategy", "casual",
] as const;
export type Genre = (typeof GENRES)[number];
