import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("ultrasound preview decodes synthetic frames, labels replay and disconnects", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/components/");
  const dataUrl = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 8; const ctx = c.getContext("2d")!; ctx.fillStyle = "#eee"; ctx.fillRect(0,0,8,8); return c.toDataURL("image/png"); });
  const png = Buffer.from(dataUrl.split(",")[1], "base64"); let images = 0, statuses = 0;
  await page.route("http://127.0.0.1:4337/**", route => {
    const headers = { "Access-Control-Allow-Origin": new URL(page.url()).origin };
    if (route.request().url().endsWith("/status")) { statuses++; return route.fulfill({ headers, json: { format: "odb.ultrasound-preview/1", profile: "unknown", phase: "finished", session: 1, frame: 1, replay: true } }); }
    images++; return route.fulfill({ headers, contentType: "image/png", body: png });
  });
  await page.getByText("Technical examples — learn how components connect", { exact: true }).click();
  await page.locator('[data-open-application="ultrasound/convex-preview"]').click(); const d = page.getByRole("dialog");
  await expect(d.getByRole("button", { name: "Download composition" })).toBeHidden();
  await expect(d.getByLabel("Recorded values (JSON array)")).toBeHidden();
  await d.getByRole("button", { name: "Connect preview", exact: true }).click();
  await expect(d.locator(".app-status")).toContainText("Recorded replay · Probe not identified");
  await expect(d.frameLocator("iframe").getByRole("status")).toContainText("Recorded replay · frame 1");
  const pixel = await d.frameLocator("iframe").locator("canvas").evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(0,0,1,1).data]);
  expect(pixel).toEqual([238,238,238,255]);
  await expect.poll(() => statuses).toBeGreaterThan(1); expect(images).toBe(1);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(audit.violations.map(v => v.id)).toEqual([]);
  const fits = await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1); expect(fits).toBe(true);
  await d.getByRole("button", { name: "Disconnect preview", exact: true }).click(); await expect(d.locator("iframe")).toHaveCount(0);
  const count = statuses; await page.waitForTimeout(400); expect(statuses).toBe(count); expect(errors).toEqual([]);
});

test("probe detection shows preview separately from technical USB examples", async ({ page }) => {
  await page.addInitScript(() => { const usb = new EventTarget() as any; usb.requestDevice = async () => ({ vendorId: 0x04b4, productId: 0x4611, productName: "Synthetic probe descriptor", deviceVersionMajor: 1 }); Object.defineProperty(navigator,"usb",{ value: usb }); });
  await page.goto("/detect/"); await page.locator('[data-detect="usb"]').click();
  const section = page.locator(".detect-applications"); await expect(section.getByRole("button", { name: "Ultrasound live capture", exact: true })).toBeVisible();
  await expect(section.getByRole("button", { name: "USB revision — technical example", exact: true })).toBeHidden();
  const geometry = await section.evaluate(el => { const button = el.querySelector(".device-app-actions button")!.getBoundingClientRect(), browse = el.querySelector('a[href="/components/"]')!.getBoundingClientRect(); return { buttonBottom: button.bottom, browseTop: browse.top, fits: el.scrollWidth <= el.clientWidth + 1 }; });
  expect(geometry.browseTop).toBeGreaterThan(geometry.buttonBottom); expect(geometry.fits).toBe(true);
});

test("empty acquisition waits without inventing images and a mismatched probe stops", async ({ page }) => {
  await page.goto("/components/"); let requests = 0, wrong = false;
  await page.route("http://127.0.0.1:4337/**", route => { requests++; return route.fulfill({ headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin }, json: { format: "odb.ultrasound-preview/1", profile: wrong ? "linear-01" : "convex-01", phase: "acquiring", session: 1, frame: null, replay: false } }); });
  await page.getByText("Technical examples — learn how components connect", { exact: true }).click();
  await page.locator('[data-open-application="ultrasound/convex-preview"]').click(); const d = page.getByRole("dialog");
  expect(requests).toBe(0); await d.getByRole("button", { name: "Connect preview", exact: true }).click();
  await expect(d.locator(".app-status")).toContainText("Waiting for an image");
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(d.frameLocator("iframe").getByRole("status")).toHaveText("Waiting for an image");
  wrong = true; await expect(d.locator(".app-status")).toContainText("expects convex-01");
  await expect(d.locator("iframe")).toHaveCount(0); await expect(d.getByRole("button", { name: "Disconnect preview" })).toBeDisabled();
});
