import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload | null;
  canExport: boolean;
  onExport: () => void;
}

export function GddDraftPreview({ synthesis, canExport, onExport }: Props) {
  return (
    <div className="resolution">
      <div className="resolution-head">
        <h3>GDD 草稿</h3>
        <button disabled={!canExport} onClick={onExport}>导出 GDD</button>
      </div>
      {!synthesis && <p className="muted">聊出一点内容后，这里会实时显示正在成形的游戏设计文档。</p>}
      {synthesis && (
        <div className="resolution-body">
          <pre className="gdd-draft-text">{synthesis.gddMarkdown}</pre>
        </div>
      )}
    </div>
  );
}
