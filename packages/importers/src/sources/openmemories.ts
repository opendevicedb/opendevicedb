// OpenMemories: free tools for Sony cameras (Sony-PMCA-RE, OpenMemories: Tweak). Cameras that run
// PlayMemories Camera Apps accept custom Android apps (e.g. Tweak: no 30-minute video limit, telnet,
// language); older ones can be driven through the updater or service shell. From the device list
// the OpenMemories documentation is built from: github.com/ma1co/fwtool.py, devices.yml
// (model → SoC architecture, app API version). Architectures CXD90045 and CXD90057 have signed
// firmware and are not compatible: left out.
//
// Status: controllable where custom apps install; partial-protocol where only the shells work.
// Code MIT.
import YAML from "yaml";
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { deviceFirmwareFreedom, githubRaw, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

const LICENSE = "MIT";
const PMCA = "https://github.com/ma1co/Sony-PMCA-RE";
const DOCS = "https://openmemories.readthedocs.io/devices.html";
const SIGNED = new Set(["CXD90045", "CXD90057"]);

export interface SonyDevice { model: string; arch: string; apps?: string }

export function parseDevices(yml: string): SonyDevice[] {
  const doc = YAML.parse(yml) ?? {};
  return Object.entries(doc).map(([model, v]: [string, any]) => ({ model: String(model), arch: String(v?.arch ?? ""), ...(v?.apps ? { apps: String(v.apps) } : {}) }));
}

/** Sony's model prefixes → category. */
export function sonyCategory(model: string): DeviceRecord["category"] {
  if (/^(HDR-AS|HDR-AZ|FDR-X)/.test(model)) return "action-camera";
  if (/^RM-/.test(model)) return "peripheral"; // live-view remotes
  return "camera";
}

export const appsInstall = (): InstallRoute => ({
  project: "Sony-PMCA-RE",
  method: "host-software",
  guide: `${PMCA}#readme`,
  installer: `${PMCA}/releases`,
  difficulty: "easy",
  tools: ["Computer", "USB cable"],
  opens_device: false,
  brick_risk: "low",
  reversible: "yes",
  notes: "pmca-gui or pmca-console installs an app (e.g. OpenMemories: Tweak) over USB, the way Sony's own app store did; the firmware is not modified. Uninstall the app to go back.",
});

export function fromDevice(d: SonyDevice, known = knownCameras(), date = today()): DeviceRecord | null {
  if (!d.model || SIGNED.has(d.arch)) return null;
  const who = cameraIdentity("Sony", d.model, known);
  return {
    id: who.id,
    vendor: who.vendor,
    model: who.model,
    aliases: who.aliases,
    category: sonyCategory(d.model),
    identifiers: { chips: d.arch ? [d.arch] : [] },
    status: d.apps ? "controllable" : "partial-protocol",
    summary: d.apps
      ? `Runs custom PlayMemories Camera Apps (API ${d.apps}), such as OpenMemories: Tweak.`
      : "No app support; the OpenMemories tools reach it through the firmware updater or service shell.",
    projects: [{ name: "Sony-PMCA-RE", url: PMCA, kind: "tool", license: LICENSE, freedom: deviceFirmwareFreedom() }],
    install: d.apps ? [appsInstall()] : [],
    provenance: { sources: ["openmemories"] },
    updated: date,
  };
}

const source: Source = {
  source: "openmemories",
  name: "OpenMemories (Sony cameras)",
  url: DOCS,
  license: LICENSE,
  async fetch() {
    const devices = parseDevices(await githubRaw("ma1co/fwtool.py", "master", "devices.yml"));
    if (devices.length < 100) throw new Error(`openmemories: only ${devices.length} devices`);
    const out = devices.map((d) => fromDevice(d)).filter((r): r is DeviceRecord => !!r);
    console.error(`openmemories: ${devices.length} devices, ${devices.length - out.length} with signed firmware left out`);
    return out;
  },
};
export default source;
