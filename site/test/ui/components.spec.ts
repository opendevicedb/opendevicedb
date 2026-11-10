import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import wabtFactory from "wabt";
import { createHash } from "node:crypto";

async function openMonitor(page: any) {
  await page.goto("/components/");
  await page.getByText("Technical examples — learn how components connect", { exact: true }).click();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Simulated numbers — technical example", exact: true }) }).getByRole("button", { name: "Open example" }).click();
  return page.getByRole("dialog");
}

test("ready application runs real WASM and customization preserves the published composition", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let artifacts = 0; page.on("request", req => { if (req.url().includes("/_components/")) artifacts++; });
  const dialog = await openMonitor(page);
  await expect(dialog.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await expect(dialog.locator(".app-editor")).toBeHidden(); expect(artifacts).toBe(0);
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.locator(".app-status")).toHaveText("Running locally");
  await expect(dialog.frameLocator("iframe").locator("output")).toHaveText(/(?:20|40|60) count/);
  await dialog.getByRole("button", { name: "Customize", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "scale factor", exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Apply and start", exact: true }).click();
  await expect(dialog.frameLocator("iframe").locator("output")).toHaveText(/(?:30|60|90) count/);
  await dialog.getByText("Files and tests (advanced)", { exact: true }).click();
  const downloaded = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Download composition", exact: true }).click();
  const stream = await (await downloaded).createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const composition = JSON.parse(Buffer.concat(chunks).toString());
  expect(composition.nodes.find((n: any) => n.id === "scale").parameters.factor).toBe(3); expect(composition.lock).toHaveLength(3);
  const published = await page.request.get("/api/components.json"); const registry = await published.json();
  expect(registry.compositions.find((c: any) => c.id === "examples/measurements").nodes.find((n: any) => n.id === "scale").parameters.factor).toBe(2);
  await dialog.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(dialog.locator("iframe")).toHaveCount(0); await expect(dialog.locator(".app-status")).toContainText("Stopped");
  expect(errors).toEqual([]);
});

test("imported stale locks are rejected and importing never starts execution", async ({ page }) => {
  const dialog = await openMonitor(page);
  const registry = await (await page.request.get("/api/components.json")).json();
  const composition = registry.compositions.find((c: any) => c.id === "examples/measurements");
  composition.lock[0].manifest_sha256 = "0".repeat(64);
  await dialog.getByText("Files and tests (advanced)", { exact: true }).click();
  await dialog.getByLabel("Import composition").setInputFiles({ name: "composition.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(composition)) });
  await expect(dialog.locator(".app-diagnostics")).toContainText("Locked release changed");
  await expect(dialog.getByRole("button", { name: "Apply and start", exact: true })).toBeDisabled();
  await expect(dialog.locator("iframe")).toHaveCount(0);
});

test("isolated UI cannot read the parent or make network requests", async ({ page }) => {
  let leaked = 0; await page.route("https://component-leak.invalid/**", route => { leaked++; return route.fulfill({ body: "unexpected network access" }); });
  const dialog = await openMonitor(page); await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.locator(".app-status")).toHaveText("Running locally");
  await expect(dialog.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frames().find(f => f.url().startsWith("blob:"))!;
  const access = await frame.evaluate(async () => {
    let parentReadable = false, fetched = false;
    try { parentReadable = !!parent.document.body; } catch {}
    try { await fetch("https://component-leak.invalid/measurement"); fetched = true; } catch {}
    return { parentReadable, fetched };
  });
  expect(access).toEqual({ parentReadable: false, fetched: false });
  await frame.evaluate(() => { location.href = "https://component-leak.invalid/navigation"; });
  await expect.poll(() => leaked).toBe(0);
});

test("tampered WASM is rejected before execution", async ({ page }) => {
  await page.route("**/_components/**/scale.wasm", route => route.fulfill({ body: Buffer.from("tampered"), contentType: "application/wasm" }));
  const dialog = await openMonitor(page); await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.locator(".app-status")).toContainText("integrity check failed");
  await expect(dialog.locator("iframe")).toHaveCount(0);
});

test("a looping WASM module is terminated without freezing the application", async ({ page }) => {
  const wabt = await wabtFactory();
  const wat = wabt.parseWat("loop.wat", '(module (func (export "process") (param f64 f64) (result f64) (loop $forever br $forever) f64.const 0))');
  const bytes = Buffer.from(wat.toBinary({}).buffer); wat.destroy();
  const digest = createHash("sha256").update(bytes).digest("hex");
  await page.route("**/api/components.json", async route => {
    const registry = await (await route.fetch()).json();
    registry.components.find((c: any) => c.id === "examples/scale").artifact.sha256 = digest;
    for (const app of registry.compositions) { const lock = app.lock.find((l: any) => l.component === "examples/scale"); if (lock) lock.artifact_sha256 = digest; }
    await route.fulfill({ json: registry });
  });
  await page.route("**/_components/**/scale.wasm", route => route.fulfill({ body: bytes, contentType: "application/wasm" }));
  const dialog = await openMonitor(page); await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.locator(".app-status")).toContainText("time budget", { timeout: 10000 });
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Customize", exact: true }).click();
  await expect(dialog.locator(".app-editor")).toBeVisible();
});

test("USB analysis launches with the exact selected mock device and stops on disconnect", async ({ page }) => {
  // A browser API fixture, not a hardware validation claim.
  await page.addInitScript(() => {
    const selected = { vendorId: 0xffff, productId: 0xfffe, productName: "Fixture device", manufacturerName: "Example", deviceVersionMajor: 7 };
    const usb = new EventTarget() as any; usb.calls = 0; usb.requestDevice = async () => { usb.calls++; return selected; };
    Object.defineProperty(navigator, "usb", { value: usb }); (window as any).testUsb = { usb, selected };
  });
  await page.goto("/detect/"); await page.locator('[data-detect="usb"]').click();
  await page.getByText("USB technical examples", { exact: true }).click();
  await page.getByRole("button", { name: "USB revision — technical example", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.frameLocator("iframe").locator("output")).toHaveText("7 major revision");
  expect(await page.evaluate(() => (window as any).testUsb.usb.calls)).toBe(1);
  await page.evaluate(() => { const e = new Event("disconnect"); Object.defineProperty(e, "device", { value: (window as any).testUsb.selected }); (window as any).testUsb.usb.dispatchEvent(e); });
  await expect(dialog.locator(".app-status")).toContainText("USB device disconnected"); await expect(dialog.locator("iframe")).toHaveCount(0);
});

test("catalogue and customization stay accessible and fit the viewport", async ({ page }) => {
  const dialog = await openMonitor(page); await dialog.getByRole("button", { name: "Customize", exact: true }).click();
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  const geometry = await page.evaluate(() => { const d = document.querySelector("dialog")!; return { viewport: innerWidth, width: d.getBoundingClientRect().width, scroll: d.scrollWidth, inner: d.clientWidth }; });
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport); expect(geometry.scroll).toBeLessThanOrEqual(geometry.inner + 1);
});
