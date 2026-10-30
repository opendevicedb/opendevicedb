// Clickable cards (.card.link) tilt toward the mouse, and their sheen follows it (see
// .card.link in global.css). Mouse and trackpad only, and off for visitors who prefer
// reduced motion. One listener on the document, so cards added later tilt too.
const MAX_TILT = 6; // degrees at the card's edge
const canTilt = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");

let card: HTMLElement | null = null;
let pointer = { x: 0, y: 0 };
let frame = 0;

function flatten(el: HTMLElement) {
  el.classList.remove("tilt");
  for (const p of ["--rx", "--ry", "--mx", "--my"]) el.style.removeProperty(p);
}

function update() {
  frame = 0;
  if (!card) return;
  const r = card.getBoundingClientRect();
  const x = (pointer.x - r.left) / r.width; // 0 = left edge, 1 = right edge
  const y = (pointer.y - r.top) / r.height;
  card.style.setProperty("--rx", `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`);
  card.style.setProperty("--ry", `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
  card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
  card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
}

document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || !canTilt.matches) return;
  const target = (e.target as Element).closest<HTMLElement>(".card.link");
  if (target !== card) {
    if (card) flatten(card);
    card = target;
    card?.classList.add("tilt");
  }
  pointer = { x: e.clientX, y: e.clientY };
  if (card && !frame) frame = requestAnimationFrame(update);
});

// The pointer left the window: let go of the card.
document.documentElement.addEventListener("pointerleave", () => {
  if (card) flatten(card);
  card = null;
});
