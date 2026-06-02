import type { RecognizedState, StageInfo } from "../types.js";

interface Props {
  state: RecognizedState | null;
  stage: StageInfo | null;
}

function Row({ label, value }: { label: string; value?: string | string[] }) {
  const text = Array.isArray(value) ? value.join(" / ") : value;
  if (!text) return null;
  return (
    <div className="state-row">
      <span className="state-label">{label}</span>
      <span className="state-value">{text}</span>
    </div>
  );
}

export function StatePanel({ state, stage }: Props) {
  const eng = state?.engineering;
  return (
    <div className="state-panel">
      <h3>实时识别状态{stage ? ` · 阶段 ${stage.stage}（${stage.label}）` : ""}</h3>
      {!state && <p className="muted">开始对话后，这里会实时显示游戏正在成形的样子。</p>}
      {state && (
        <>
          <Row label="一句话" value={state.pitch} />
          <Row label="火花" value={state.spark} />
          <Row label="核心情绪" value={state.coreEmotion} />
          <Row label="核心动作" value={state.coreAction} />
          <Row label="核心幻想" value={state.coreFantasy} />
          <Row label="主题/世界" value={state.theme ?? state.world} />
          <Row label="视听" value={state.aesthetic} />
          <Row label="30s 循环" value={state.loop?.thirtySec} />
          <Row label="维度/引擎" value={eng ? [eng.dimension, eng.engine].filter(Boolean).join(" · ") : undefined} />
          <Row label="平台" value={eng?.platform} />
          <Row label="题材" value={eng?.genre} />
          <Row label="机制" value={eng?.mechanics} />
          <Row label="模态" value={eng?.modalities} />
          <Row label="MVP 必做" value={state.mvpScope?.must} />
          <Row label="宪法" value={state.constitution} />
        </>
      )}
    </div>
  );
}
