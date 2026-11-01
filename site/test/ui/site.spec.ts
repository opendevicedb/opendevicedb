import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  "/", "/devices/", "/detect/", "/wanted/", "/news/", "/agents/",
  "/contribute/", "/sources/", "/about/", "/policy/",
  "/devices/01space/esp32-c3-0-42lcd/", "/news/2026-10-17-get-started/",
];
for (const route of routes) {
  test(`renders and remains accessible: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("main h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.fonts.check("16px Geist") && document.fonts.check("32px Technor"))).toBe(true);
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    const broken = await page.locator("img").evaluateAll(async images => {
      const visible = (images as HTMLImageElement[]).filter(image => {
        const box = image.getBoundingClientRect();
        return box.width && box.height && box.top < innerHeight && box.bottom > 0;
      });
      const results = await Promise.all(visible.map(async image => {
        try { await image.decode(); return image.naturalWidth ? null : image.src; }
        catch { return image.src; }
      }));
      return results.filter(Boolean);
    });
    expect(broken).toEqual([]);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("navigation works with touch and keyboard", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".menu-toggle");
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
  }
  await page.locator(".nav-more summary").click();
  await expect(page.locator(".more-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".more-menu")).toBeHidden();
  await page.locator(".nav-more summary").click();
  await page.locator(".more-menu").getByRole("link", { name: "Sources", exact: true }).click();
  await expect(page).toHaveURL(/\/sources\/?$/);
  await expect(page.locator("main h1")).toHaveText("Sources");
});
test("home search, filters, URL restoration and empty results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("tello");
  await page.getByRole("button", { name: /^Search(?: Device)?$/ }).click();
  await expect(page).toHaveURL(/\/devices\/\?q=tello/);
  await expect(page.locator("#results .name")).toContainText(["Tello"]);
  await page.locator("#category").selectOption("drone");
  await expect(page).toHaveURL(/category=drone/);
  await page.locator("#source").selectOption("curated");
  await expect(page).toHaveURL(/source=curated/);
  await page.reload();
  await expect(page.locator("#q")).toHaveValue("tello");
  await expect(page.locator("#category")).toHaveValue("drone");
  await expect(page.locator("#source")).toHaveValue("curated");
  await expect(page.locator("#results .name")).toContainText(["Tello"]);
  await page.locator("#q").fill("odb-nonexistent-device-987654");
  await expect(page.locator("#results")).toContainText("Nothing matches");
  const request = page.locator("#results").getByRole("link", { name: "Request this device" });
  await expect(request).toHaveAttribute("href", /github.com.*issues\/new/);
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
});
test("pagination changes the results and preserves the page in the URL", async ({ page }) => {
  await page.goto("/devices/");
  const first = await page.locator("#results .name").first().textContent();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("#pager")).toContainText("Page 2 of");
  expect(await page.locator("#results .name").first().textContent()).not.toBe(first);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.locator("#pager")).toContainText("Page 1 of");
});
test("a failed index download can be retried", async ({ page }) => {
  await page.route("**/api/index.json", route => route.abort());
  await page.goto("/devices/");
  await page.locator("#q").fill("tello");
  await expect(page.locator("#count")).toContainText("Could not load the index");
  await page.unroute("**/api/index.json");
  await page.locator("#q").fill("ryze tello");
  await expect(page.locator("#results .name")).toContainText(["Tello"]);
});
test("MCP command can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/agents/");
  const first = page.getByRole("button", { name: "Copy code to clipboard" }).first();
  await first.click();
  await expect(first).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("claude mcp add opendevicedb -- npx -y @opendevicedb/mcp");
});
test("device detection renders results and cancellation from browser APIs", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "usb", { value: { requestDevice: async () => ({ vendorId: 0x10c4, productId: 0xea60, productName: "CP210x" }) } });
    Object.defineProperty(navigator, "serial", { value: { requestPort: async () => ({ getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }) }) } });
    Object.defineProperty(navigator, "bluetooth", { value: { requestDevice: async () => { throw new DOMException("Chooser closed", "NotFoundError"); } } });
  });
  await page.goto("/detect/");
  await page.getByRole("button", { name: "Connect a USB device" }).click();
  await expect(page.locator("#out-title")).toHaveText("Adapter detected, not the device");
  await expect(page.locator("#out-read")).toContainText("10c4:ea60");
  await page.getByRole("button", { name: "Pick a serial port" }).click();
  await expect(page.locator("#out-read")).toContainText("Serial adapter id");
  await page.getByRole("button", { name: "Find a Bluetooth device" }).click();
  await expect(page.locator("#out-title")).toHaveText("No device chosen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("unsupported detection offers the label search", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "usb", { value: undefined });
    Object.defineProperty(navigator, "bluetooth", { value: undefined });
    Object.defineProperty(navigator, "serial", { value: undefined });
  });
  await page.goto("/detect/");
  await expect(page.locator("#unsupported")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect a USB device" })).toBeDisabled();
  await expect(page.locator("#label-q")).toBeVisible();
});
test("device links remain usable without JavaScript", async ({ browser, baseURL, viewport }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport });
  const page = await context.newPage();
  await page.goto("/devices/");
  await expect(page.locator("#results .name")).toHaveCount(50);
  await page.locator("#results .name").first().click();
  await expect(page.locator("main h1")).toContainText("01space");
  await context.close();
});
test("404 offers the same device search", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(page.locator("main h1")).toHaveText("Not found");
  await expect(page.getByRole("searchbox")).toBeVisible();
});
