const mirroredProperties = [
  "font",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "padding",
  "border",
  "boxSizing",
  "textIndent",
  "tabSize",
] as const;

// Keep one layout mirror for the editor lifetime instead of allocating it on every key.
export function createCaretMeasurer(input: HTMLTextAreaElement) {
  const mirror = document.createElement("div");
  const before = document.createTextNode("");
  const marker = document.createElement("span");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    pointerEvents: "none",
  });
  mirror.append(before, marker);
  document.body.appendChild(mirror);
  let lineHeight = 28;
  const resize = () => {
    const style = getComputedStyle(input);
    for (const property of mirroredProperties)
      mirror.style[property] = style[property];
    mirror.style.width = `${input.clientWidth}px`;
    lineHeight = parseFloat(style.lineHeight) || 28;
  };
  resize();
  return {
    resize,
    measure(caret: number) {
      before.textContent = input.value.slice(0, caret);
      marker.textContent = input.value.slice(caret) || ".";
      return marker.offsetTop + lineHeight - input.scrollTop;
    },
    dispose: () => mirror.remove(),
  };
}

export function caretPosition(input: HTMLTextAreaElement, caret: number) {
  const measurer = createCaretMeasurer(input);
  try {
    return measurer.measure(caret);
  } finally {
    measurer.dispose();
  }
}
