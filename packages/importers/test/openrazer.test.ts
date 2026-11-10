import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize } from "../src/lib.ts";
import { fromDevices, parseReadme, splitName } from "../src/sources/openrazer.ts";

const readme = `# OpenRazer
## Device Support
### Keyboards
| Device | USB VID:PID |
| ------ | ----------- |
| Razer BlackWidow Classic | 1532:011B |
| Razer BlackWidow Classic (Alternate) | 1532:010E |
| Razer Blade 15 (2018) | 1532:0233 |
### Mice
| Razer DeathAdder V2 Pro (Wired) | 1532:007C |
| Razer DeathAdder V2 Pro (Wireless) | 1532:007D |
### Misc
| Lian Li O11 Dynamic - Razer Edition | 1532:0F13 |
## Contributing
| Razer Not A Device | 1532:FFFF |
`;

test("openrazer reads the device tables under their sections and stops at the next chapter", () => {
  const rows = parseReadme(readme);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { section: "Keyboards", name: "Razer BlackWidow Classic", usb: "1532:011b" });
  assert.equal(rows.at(-1)!.section, "Misc");
  assert.throws(() => parseReadme("# no tables"), /Device Support/);
});

test("openrazer merges connection variants, keeps years and editions, and names other brands", () => {
  assert.deepEqual(splitName("Razer DeathAdder V2 Pro (Wireless)"), { vendor: "Razer", model: "DeathAdder V2 Pro" });
  assert.deepEqual(splitName("Razer Blade 15 (2018)"), { vendor: "Razer", model: "Blade 15 (2018)" });
  assert.deepEqual(splitName("Lian Li O11 Dynamic - Razer Edition"), { vendor: "Lian Li", model: "O11 Dynamic - Razer Edition" });
  const f = finalize(fromDevices(parseReadme(readme), "v3.12.4", "2026-11-10"));
  assert.equal(f.invalid, 0);
  const byId = Object.fromEntries(f.records.map((r) => [r.id, r]));
  assert.deepEqual(byId["razer/deathadder-v2-pro"].identifiers?.usb, ["1532:007c", "1532:007d"]);
  assert.deepEqual(byId["razer/blackwidow-classic"].identifiers?.usb, ["1532:011b", "1532:010e"]);
  assert.equal(byId["razer/blade-15-2018"].category, "laptop");
  assert.equal(byId["razer/deathadder-v2-pro"].category, "peripheral");
});
