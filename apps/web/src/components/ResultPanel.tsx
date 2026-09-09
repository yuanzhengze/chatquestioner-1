import { useTypewriter } from "../hooks/useTypewriter.js";
import { Markdown } from "./Markdown.js";
import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload;
  canExport: boolean;
  onExport: () => void;
}

/** 左侧成果：GDD（打字机加速显现，可点击跳过）。 */
export function GddPanel({ synthesis }: { synthesis: SynthesisPayload }) {
  const tw = useTypewriter(synthesis.gddMarkdown, 6); // 长文：加速
  return (
    <div className="result-panel" onClick={() => !tw.done && tw.skip()}>
      <div className="result-head gdd">📄 GDD · 游戏设计文档</div>
      <div className="result-body"><Markdown content={tw.shown} final={tw.done} /></div>
    </div>
  );
}

/** 右侧成果：导出 GDD。 */
export function FinalPanel({ canExport, onExport }: Props) {
  return (
    <div className="result-panel">
      <div className="result-head final">📦 最终内容输出</div>
      <div className="result-body">
        <div className="res-block">
          <div>这份 GDD 已可交付给 ForgeaX 继续开发。</div>
        </div>
      </div>
      <button className="result-export" disabled={!canExport} onClick={onExport}>⬇ 导出 GDD</button>
    </div>
  );
}
