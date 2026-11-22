import {test, expect} from "@playwright/test";

for (const entry of ["record", "USB detection"]) {
  test(`UC5-2S standalone capture from ${entry}`, async ({page}) => {
    await page.addInitScript(() => {
      const usb = new EventTarget();
      Object.assign(usb, {requestDevice: async () => ({vendorId: 0x04b4, productId: 0x4611})});
      Object.defineProperty(navigator, "usb", {value: usb});
    });
    if (entry === "record") {
      await page.goto("/devices/unknown/puis-fx2-convex-usb-probe-04b4-4611/");
    } else {
      await page.goto("/detect/");
      await page.getByRole("button", {name: "Connect a USB device"}).click();
    }
    await page.getByRole("link", {name: "Open standalone ultrasound capture"}).click();
    await expect(page.getByRole("combobox").locator("option")).toHaveCount(8);
    await page.getByRole("combobox").selectOption("2");
    const start = page.getByRole("button", {name: "Connecter et afficher"});
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox", {name: "Nous déclinons toute responsabilité en cas d’utilisation sur un être vivant."}).check();
    await expect(start).toBeEnabled();
  });
}
