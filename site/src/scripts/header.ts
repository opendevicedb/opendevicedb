// Sticky header (see .site-header in global.css): .scrolled adds the glass background once the
// page has moved; .away slides it up while scrolling down, and any scroll up brings it back.
// It stays put while one of its menus is open.
const header = document.querySelector<HTMLElement>(".site-header")!;
const MOVE = 6; // px of scroll ignored as jitter (trackpads, mobile bounce)
let lastY = window.scrollY;
let frame = 0;

const menuOpen = () => !!header.querySelector("details[open]");

function update() {
  frame = 0;
  const y = Math.max(0, window.scrollY);
  header.classList.toggle("scrolled", y > 8);
  if (Math.abs(y - lastY) < MOVE) return;
  const down = y > lastY;
  header.classList.toggle("away", down && y > header.offsetHeight && !menuOpen());
  lastY = y;
}

window.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
// Tabbing into the header while it is away brings it back.
header.addEventListener("focusin", () => header.classList.remove("away"));
update();

// Header menus are <details> (they open without JS). With JS: Escape closes the open one and
// returns focus to its button; a click outside it closes it; opening one closes the other.
const menus = [...header.querySelectorAll<HTMLDetailsElement>("details")];
for (const menu of menus) {
  menu.addEventListener("toggle", () => { if (menu.open) for (const m of menus) if (m !== menu) m.open = false; });
}
document.addEventListener("keydown", (ev) => {
  const open = menus.find((m) => m.open);
  if (ev.key !== "Escape" || !open) return;
  open.open = false;
  open.querySelector("summary")!.focus();
});
document.addEventListener("click", (ev) => {
  for (const m of menus) if (m.open && !m.contains(ev.target as Node)) m.open = false;
});

export {}; // a module: its top-level names stay its own
