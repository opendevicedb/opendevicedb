import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("recording replay runs actual original WASM without resources, USB selection or a bridge", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { const usb = new EventTarget() as any; usb.requestDevice = () => { throw Error("Replay tried to open USB"); }; Object.defineProperty(navigator, "usb", { value: usb }); });
  await page.goto("/components/"); await page.locator('[data-open-application="ultrasound/convex-replay"]').click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("button", { name: "Replay recording", exact: true })).toBeDisabled();
  await expect(d.getByLabel("Local preview bridge URL")).toBeHidden();
  await expect(d.getByLabel("Probe resources (.odb-probe)")).toBeHidden();
  await d.getByLabel("Probe recording", { exact: true }).setInputFiles({ name: "empty.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(0) });
  await d.getByRole("button", { name: "Replay recording", exact: true }).click();
  await expect(d.locator(".app-status")).toHaveText("Replay complete: 0 images. Original profile; uncalibrated.");
  await expect(d.locator("iframe")).toHaveCount(1);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.map(v => v.id)).toEqual([]); expect(await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await d.getByRole("button", { name: "Stop replay", exact: true }).click(); await expect(d.locator("iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("malformed recordings report failure with no complete result", async ({ page }) => {
  await page.goto("/components/"); await page.locator('[data-open-application="ultrasound/convex-replay"]').click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Probe recording", { exact: true }).setInputFiles({ name: "broken.odb-stream", mimeType: "application/x-ndjson", buffer: Buffer.from('{"format":"odb-probe-stream/1","snapshot_last_ordinal":1,"stored_bytes":0,"omitted_bytes":0,"storage_error":null}\n') });
  await d.getByRole("button", { name: "Replay recording", exact: true }).click();
  await expect(d.locator(".app-status")).toContainText("Replay failed: Truncated stream"); await expect(d.locator("iframe")).toHaveCount(0);
});
