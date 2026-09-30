import { asGddText, type GddModel } from "./model.js";

const PLAYERS: Record<string, string> = { "自己玩": "单人", "要和别人一起": "多人" };
const PLATFORMS: Record<string, string> = { "电脑": "PC", "手机": "手机", "网页": "网页" };
const DIMENSIONS: Record<string, string> = { "平面": "2D", "能转视角的立体": "3D" };
const ORIENTATIONS: Record<string, string> = { "横屏": "横屏", "竖屏": "竖屏" };

export interface GameProfileFormat {
  players?: string;
  platform?: string;
  dimension?: string;
  orientation?: string;
}

export interface GameProfile {
  genres: string[];
  gameplayTags: string[];
  experienceTags: string[];
  tags: string[];
  format: GameProfileFormat;
  formatLine: string;
}

function text(v: unknown): string {
  return asGddText(v);
}

function mapped(table: Record<string, string>, value: unknown): string {
  return table[text(value)] || "";
}

/** 基本形态只做确定性映射。类型和标签由服务端模型分类缓存填入。 */
export function gameProfileFromModel(m: GddModel): GameProfile {
  const model = m || ({} as GddModel);
  const format: GameProfileFormat = {};
  const players = mapped(PLAYERS, model.presentation?.players);
  const platform = mapped(PLATFORMS, model.presentation?.where);
  const dimension = mapped(DIMENSIONS, model.presentation?.dimension);
  const orientation = mapped(ORIENTATIONS, model.presentation?.orientation);
  if (players) format.players = players;
  if (platform) format.platform = platform;
  if (dimension) format.dimension = dimension;
  if (orientation) format.orientation = orientation;
  const formatLine = [format.players, format.platform, format.dimension, format.orientation].filter(Boolean).join(" · ");
  return {
    genres: [],
    gameplayTags: [],
    experienceTags: [],
    tags: [],
    format,
    formatLine,
  };
}
