const VAGUE_PLAY = /^(探索世界|经营农场|策略战斗|模拟经营|开放世界|塔防)$/;

/** 合格交互链路：具体操作，带箭头或先后，不是玩法类型词。 */
export function isConcreteInteractionChain(chain?: string): boolean {
  const t = (chain || "").replace(/\s+/g, " ").trim();
  if (t.length < 8) return false;
  if (VAGUE_PLAY.test(t)) return false;
  if (/^(探索世界|经营农场|策略战斗|模拟经营)[。.!！]?$/.test(t)) return false;
  return /→|->|➔|然后|之后/.test(t);
}

export function composeInteractionChain(verb?: string, target?: string, feedback?: string): string {
  const v = (verb || "").trim();
  const t = (target || "").trim();
  const f = (feedback || "").trim();
  if (!v || !t || !f) return "";
  const composed = `${v} → ${t} → ${f}`;
  return isConcreteInteractionChain(composed) ? composed : "";
}
