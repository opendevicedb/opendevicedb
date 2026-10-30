// Code blocks: a Copy button, and a fade on whichever edge hides code (see `pre` in
// global.css). Progressive enhancement: without JS, <pre> still scrolls.
for (const pre of document.querySelectorAll<HTMLPreElement>("main pre")) {
  const box = document.createElement("div");
  box.className = "code-block";
  pre.replaceWith(box);
  box.append(pre);
  pre.tabIndex = 0; // keyboard users can scroll it with the arrow keys

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.innerText.trim());
      copy.textContent = "Copied";
    } catch {
      // No clipboard access (plain http, denied permission): select the code so it can be copied by hand.
      getSelection()?.selectAllChildren(pre);
      copy.textContent = "Press ⌘/Ctrl+C";
    }
    setTimeout(() => (copy.textContent = "Copy"), 2000);
  });
  box.append(copy);

  const update = () => {
    const max = pre.scrollWidth - pre.clientWidth;
    pre.toggleAttribute("data-fade-start", pre.scrollLeft > 1);
    pre.toggleAttribute("data-fade-end", pre.scrollLeft < max - 1);
  };
  pre.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(pre); // also runs once after layout, so no forced reflow here
}
