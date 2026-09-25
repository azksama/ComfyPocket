import { useState } from "react";
import { createRoot } from "react-dom/client";
import PromptAssistant from "../src/PromptAssistant";
import type { PromptOptimizer, PromptProposal } from "../src/promptOptimizer";
import "../src/styles.css";
import "../src/experience.css";
import "../src/mochi.css";
import "../src/mobile.css";
import "../src/prompt-blocks.css";

declare global {
  interface Window {
    optimizerTest: {
      signal?: AbortSignal;
      resolve?: (value: { blocks: PromptProposal[] }) => void;
      reject?: (error: Error) => void;
    };
  }
}
window.optimizerTest = {};
const adapter: PromptOptimizer = {
  name: "Adaptateur de test",
  optimize: (_input, signal) =>
    new Promise((resolve, reject) => {
      window.optimizerTest = { signal, resolve, reject };
    }),
};
function Harness() {
  const [values, setValues] = useState({
    positive: "existing,",
    negative: "low_quality,",
  });
  const [open, setOpen] = useState(true);
  return (
    <>
      {open && (
        <PromptAssistant
          side="positive"
          values={values}
          onChange={setValues}
          onClose={() => setOpen(false)}
          adapter={adapter}
        />
      )}
      {!open && <p role="status">{JSON.stringify(values)}</p>}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
