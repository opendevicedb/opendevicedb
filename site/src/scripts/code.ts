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
    await navigator.clipboard.writeText(pre.innerText.trim());
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });
  box.append(copy);

  const update = () => {
    const max = pre.scrollWidth - pre.clientWidth;
    pre.toggleAttribute("data-fade-start", pre.scrollLeft > 1);
    pre.toggleAttribute("data-fade-end", pre.scrollLeft < max - 1);
  };
  update();
  pre.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(pre);
}
