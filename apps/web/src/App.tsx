import { useSession } from "./hooks/useSession.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { StatePanel } from "./components/StatePanel.js";
import { ResolutionPreview } from "./components/ResolutionPreview.js";
import "./styles.css";

export function App() {
  const s = useSession();
  return (
    <div className="app">
      <header className="app-header">
        <h1>NewBee · 游戏共创</h1>
        {s.error && <span className="err">出错：{s.error}</span>}
      </header>
      <main className="app-main">
        <section className="col col-left">
          <ChatPanel messages={s.messages} busy={s.busy} onSend={s.send} />
        </section>
        <section className="col col-right">
          <StatePanel state={s.state} stage={s.stage} />
          <ResolutionPreview
            synthesis={s.synthesis}
            canExport={Boolean(s.stage?.readyForSynthesis)}
            onExport={s.doExport}
          />
        </section>
      </main>
    </div>
  );
}
