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
