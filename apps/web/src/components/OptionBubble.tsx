import { useTypewriter } from "../hooks/useTypewriter.js";
import { Markdown } from "./Markdown.js";
import type { TurnOption } from "../types.js";

interface Props {
  option: TurnOption;
  side: "left" | "right";
  /** 选中态："chosen" 高亮放大，"dismissed" 淡出，undefined 正常。 */
  phase?: "chosen" | "dismissed";
  disabled?: boolean;
  onChoose: (opt: TurnOption) => void;
}

const LABEL_TAG: Record<string, string> = { A: "方向 A", B: "方向 B" };

/** 形象一侧的可点选项气泡：冒泡浮现，detail 打字机 + markdown。块级内容用 div role=button 承载。 */
export function OptionBubble({ option, side, phase, disabled, onChoose }: Props) {
  const tw = useTypewriter(option.detail, 30);
  const cls = `option-bubble option-bubble-${side}` +
    (phase === "chosen" ? " option-chosen" : "") +
    (phase === "dismissed" ? " option-dismissed" : "");
  const activate = () => {
    if (disabled) return;
    if (!tw.done) { tw.skip(); return; } // 打字进行中：先补全文，不立即选中
    onChoose(option);
  };
  return (
    <div
      className={cls}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`选择${LABEL_TAG[option.id] ?? option.id}：${option.label}`}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
    >
      <span className={`option-tag option-tag-${side}`}>{LABEL_TAG[option.id] ?? option.id} · {option.label}</span>
      <Markdown content={tw.shown} final={tw.done} />
    </div>
  );
}
