import { useState } from "react";
import { createRoot } from "react-dom/client";
import PromptEditor from "../src/PromptEditor";
import "../src/styles.css";
import "../src/experience.css";
import "../src/refinements.css";

function Harness() {
  const [values, setValues] = useState({ positive: "", negative: "" });
  const [open, setOpen] = useState(true);
  return open ? (
    <PromptEditor
      initialTab="positive"
      values={values}
      onChange={setValues}
      onClose={() => setOpen(false)}
    />
  ) : (
    <p role="status">Appliqué : {values.positive}</p>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
