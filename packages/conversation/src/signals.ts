/**
 * 工程信号的取值域。
 *
 * NewBee 只做灵感引导，不做选型——这些信号是对话中顺带捕获的线索，随 GDD 一并
 * 手动交付给 ForgeaX 作参考，不参与任何校验或门控。原先它们由 `@cq/dsl` 的 zod
 * schema 定义并驱动 resolver 选型，该链路已移除，这里只保留类型。
 */

export type Platform = "PC" | "mobile" | "web";
export type Dimension = "2D" | "3D";
export type Engine = "pixijs" | "threejs" | "phaser" | "canvas" | "dom";
export type Networking = "singleplayer" | "multiplayer";
export type Orientation = "Landscape" | "Portrait";
export type Modality =
  | "image"
  | "audio"
  | "ui"
  | "3d"
  | "pixel"
  | "sidescroller"
  | "narrative"
  | "video";
