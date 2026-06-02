import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 从 prompts 目录读取 NewBee 系统提示词（newbee.system.md）。 */
export function readNewbeeSystemPrompt(promptsDir: string): string {
  return readFileSync(resolve(promptsDir, "newbee.system.md"), "utf8");
}
