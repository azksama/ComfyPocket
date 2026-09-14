// A layout mirror gives the real wrapped line position without changing the input.
export function caretPosition(input: HTMLTextAreaElement, caret: number) {
  const style = getComputedStyle(input), mirror = document.createElement("div");
  for (const property of ["font", "fontSize", "fontFamily", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "padding", "border", "boxSizing", "textIndent", "tabSize"] as const) mirror.style[property] = style[property];
  Object.assign(mirror.style, { position: "fixed", left: "-10000px", top: "0", visibility: "hidden", width: `${input.clientWidth}px`, whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  mirror.textContent = input.value.slice(0, caret); const marker = document.createElement("span"); marker.textContent = input.value.slice(caret) || "."; mirror.appendChild(marker); document.body.appendChild(mirror);
  const y = marker.offsetTop + (parseFloat(style.lineHeight) || 28) - input.scrollTop;
  mirror.remove(); return y;
}
