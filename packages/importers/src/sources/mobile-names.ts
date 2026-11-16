// Shared, source-backed model expansion for the two mobile-Linux indices. Do not
// put short port codenames in SKU identifiers or infer support from a chipset.
import { clean } from "../lib.ts";
import { normVendor, normModel } from "./lineageos.ts";

const GROUPS: Record<string, { vendor: string; models: string[] }> = {
  miatoll: { vendor: "Xiaomi", models: ["Poco M2 Pro", "Redmi Note 9 Pro", "Redmi Note 9 Pro Max", "Redmi Note 9S"] },
  curtana: { vendor: "Xiaomi", models: ["Redmi Note 9S", "Redmi Note 9 Pro"] },
  surya: { vendor: "Xiaomi", models: ["Poco X3 NFC", "Poco X3"] },
  lancelot: { vendor: "Xiaomi", models: ["Redmi 9", "Redmi 9 Prime"] },
  land: { vendor: "Xiaomi", models: ["Redmi 3X", "Redmi 3S", "Redmi 3SP"] },
  oneplus3: { vendor: "OnePlus", models: ["3", "3T"] },
};
const PREFIXES = ["Planet Computers", "F(x)tec", "Raspberry Pi", "OnePlus", "Fairphone", "Google", "Samsung", "Xiaomi", "Motorola", "Lenovo", "JingLing", "Meizu", "Sony", "ASUS", "Volla", "BQ", "LG", "YU", "ZUK", "HTC", "Nokia", "Nothing"];

export function mobileNames(name: string, code: string): { vendor: string; model: string }[] {
  const full = clean(name);
  if (/generic|desktop pc|^x86$|^qemu$/i.test(full)) return [];
  // Only expand the groups when the source actually names multiple products.
  const group = GROUPS[code.toLowerCase()];
  if (group && /\/(?![^()]*\))|\band\b|,/.test(full)) return group.models.map((model) => ({ vendor: group.vendor, model }));
  if (/^Fairphone 3 and 3\+$/i.test(full)) return ["3", "3+"].map((model) => ({ vendor: "Fairphone", model }));
  if (/^Google Pixel 3a\/3a XL/i.test(full)) return ["Pixel 3a", "Pixel 3a XL"].map((model) => ({ vendor: "Google", model }));
  let raw = PREFIXES.find((v) => full.toLowerCase().startsWith(v.toLowerCase() + " "));
  let rest = full;
  if (/^Pine(?:Phone|Tab|Book)/i.test(full)) raw = "PINE64";
  if (/^Nexus 7/i.test(full)) raw = "ASUS";
  if (/^SHIFT6mq/i.test(full)) { raw = "SHIFT"; rest = full.replace(/^SHIFT/i, ""); }
  if (/^Moto G /i.test(full)) { raw = "Motorola"; rest = full.replace(/^Moto /, "Moto "); }
  if (/^rabbit r1$/i.test(full)) raw = "Rabbit";
  if (/^Pocophone F1\b/i.test(full)) raw = "Xiaomi";
  if (!raw) throw new Error(`mobile source: unreviewed product name ${JSON.stringify(full)} (${code})`);
  const vendor = normVendor(raw);
  // Parentheses at the end can name a port codename rather than a product.
  const tail = rest.match(/\s*\(([^()]*)\)\s*$/);
  if (tail && (tail[1].toLowerCase() === code.toLowerCase() || /^(?:qx\d+|F\d+\s*(?:&\s*F\d+)?|GT-[\w-]+|C\d+X)$/i.test(tail[1]))) rest = rest.slice(0, tail.index);
  let model = normModel(vendor, rest);
  if (vendor === "Volla") model = model.replace(/^Volla /i, "");
  if (vendor === "F(x)tec") model = model.replace(/^Pro ?1[- ]?X$/i, "Pro1 X");
  // The Droidian pro1x JSON title currently says Pro1, but its codename,
  // adaptation and canonical image configuration identify the distinct Pro1-X.
  if (vendor === "F(x)tec" && code.toLowerCase() === "pro1x") model = "Pro1 X";
  if (vendor === "Xiaomi") model = model.replace(/^Pocophone F1$/i, "Poco F1");
  if (vendor === "Samsung") model = model.replace(/^S3 Neo\+/i, "Galaxy S III Neo");
  return [{ vendor, model }];
}
