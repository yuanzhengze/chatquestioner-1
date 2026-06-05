export type { GameDef, SystemUse, HookRef, Rule } from "./types.js";
export { hook, isHook } from "./types.js";
export type { CompileError } from "./validate.js";
export { validate } from "./validate.js";
export { createGame, toEngineConfig } from "./createGame.js";
export { bejeweled } from "./games/bejeweled.js";
export { candyCollect } from "./games/candyCollect.js";
export { FillSchema, GoalFillSchema, clampSize, dedupeTiles } from "./synthesize/fill.js";
export type { GameDefFill, SynthesizeDiagnostic } from "./synthesize/fill.js";
