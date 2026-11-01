const menu = document.querySelector<HTMLButtonElement>(".menu-toggle");
const navigation = document.getElementById("main-navigation");
const more = document.querySelector<HTMLDetailsElement>(".nav-more");
function closeNavigation() {
  menu?.setAttribute("aria-expanded", "false");
  menu?.setAttribute("aria-label", "Open navigation");
  navigation?.classList.remove("is-open");
}
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  navigation?.classList.toggle("is-open", open);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (more?.open) { more.open = false; more.querySelector("summary")?.focus(); }
  else if (menu?.getAttribute("aria-expanded") === "true") { closeNavigation(); menu.focus(); }
});
document.addEventListener("click", (event) => {
  const target = event.target as Node;
  if (more?.open && !more.contains(target)) more.open = false;
  if (navigation?.classList.contains("is-open") && !navigation.contains(target) && !menu?.contains(target)) closeNavigation();
});
window.matchMedia("(min-width: 1101px)").addEventListener("change", closeNavigation);
for (const pre of document.querySelectorAll<HTMLPreElement>("pre")) {
  const text = pre.textContent ?? "";
  pre.tabIndex = 0;
  pre.setAttribute("role", "region");
  pre.setAttribute("aria-label", "Code example");
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";
  pre.before(wrapper);
  wrapper.append(pre);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code to clipboard");
  const status = document.createElement("span");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  wrapper.append(button, status);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text.trim());
      button.textContent = "Copied";
      status.textContent = "Code copied to clipboard.";
    } catch {
      status.textContent = "Could not copy. Select the code and copy it manually.";
      button.textContent = "Try again";
    }
    window.setTimeout(() => { button.textContent = "Copy"; }, 2500);
  });
}
