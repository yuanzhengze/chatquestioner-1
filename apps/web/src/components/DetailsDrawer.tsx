import { StatePanel } from "./StatePanel.js";
import { ResolutionPreview } from "./ResolutionPreview.js";
import type { RecognizedState, StageInfo, SynthesisPayload } from "../types.js";

interface Props {
  open: boolean;
  onClose: () => void;
  state: RecognizedState | null;
  stage: StageInfo | null;
  synthesis: SynthesisPayload | null;
  canExport: boolean;
  onExport: () => void;
}

/** 收纳「已识别状态 / GDD / resolution / 导出」的侧抽屉（主形象 emote 已情绪化表达，细节按需翻）。 */
export function DetailsDrawer({ open, onClose, state, stage, synthesis, canExport, onExport }: Props) {
  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <aside className={`drawer ${open ? "drawer-open" : ""}`} aria-hidden={!open}>
        <div className="drawer-head">
          <span>详情</span>
          <button className="drawer-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="drawer-body">
          <StatePanel state={state} stage={stage} />
          <ResolutionPreview synthesis={synthesis} canExport={canExport} onExport={onExport} />
        </div>
      </aside>
    </>
  );
}
