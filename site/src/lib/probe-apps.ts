const probeApps = new Map([
  ["unknown/puis-fx2-convex-usb-probe-04b4-4611", "/apps/uc5-2s/index.html"],
  ["bmv/ul10-5e", "/apps/ul10-5e/index.html"],
]);

export const probeAppTitle = "Open standalone ultrasound capture";
export function probeAppUrl(deviceId?: string) {
  return deviceId ? probeApps.get(deviceId) : undefined;
}
