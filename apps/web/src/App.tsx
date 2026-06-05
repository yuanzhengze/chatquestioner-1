import { useSession } from "./hooks/useSession.js";
import { Stage } from "./components/Stage.js";
import "./styles/tokens.css";
import "./styles.css";

export function App() {
  const session = useSession();
  return <Stage session={session} />;
}
