# Experimental fwupd declaration index

This is the first research step from [issue 19](https://github.com/opendevicedb/opendevicedb/issues/19), following [the upstream source suggestion](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19397020).

The [sample](../data/research/fwupd-index.json) contains 104 quirk-section declarations from fwupd revision `17b23256a336478d6b5d71b714e7b4be7570a50f`: 28 Logitech HID++, 24 SteelSeries and 52 UF2 declarations. It is separate from the physical-device catalogue and is not loaded by normal imports, the website, MCP lookup or browser detection.

Each declaration retains its original instance string and namespace, source file and line permalink, plugin documentation permalink, and ordered key/value declarations with their source lines. Duplicate sections and keys remain separate. The index records the immutable revision and links to upstream `COPYING`. Unknown syntax stops generation rather than silently dropping data.

## Generate and inspect

From the repository root:

```sh
npm run fwupd:index -- 17b23256a336478d6b5d71b714e7b4be7570a50f data/research/fwupd-index.json
```

The three reviewed plugin files are read at that exact commit. Output paths are relative to the repository root unless absolute. Failed source fetching or parsing leaves an existing output untouched. No local device enumeration, firmware download or flashing is involved.

An exact source-instance lookup:

```js
import { readFileSync } from "node:fs";
import { findFwupdDeclarations } from "./packages/importers/src/fwupd-index.ts";

const index = JSON.parse(readFileSync("data/research/fwupd-index.json", "utf8"));
const matches = findFwupdDeclarations(index, String.raw`USB\VID_046D&PID_AAAA`);
console.log(matches);
```

The returned Logitech declaration retains `CounterpartGuid = HIDRAW\VEN_046D&DEV_C52B` and its bootloader GType. It does not merge that section with the runtime instance. A bare `046d:c52b` or an invented `USB\VID_046D&PID_C52B` does not match the HIDRAW declaration.

## Meaning and limits

| Example | Preserved evidence | Interpretation left to a later device mapping |
| --- | --- | --- |
| Logitech Unifying | HIDRAW runtime, USB bootloader, `CounterpartGuid`, GType | These are related modes, not two independently identified retail products. |
| Aerox 3 Wireless | Separate receiver, mouse, bootloader, Bluetooth and receiver-tunnel instance strings, names and flags | Receiver identity or a tunneled identifier must not become an unconditional USB mouse match. |
| Rival 100 | `USB\VID_1038&PID_1702`, GType and pinned SteelSeries README | The README limits this case to version reading and says vendor updates are unavailable. No update capability or firmware availability is inferred. |
| RP2040 UF2 | Shared USB bootloader, `Guid` relationship and UF2 family section | A family name is not a list of supported retail boards. |

Names are kept only when explicitly declared by upstream `Name` properties, not inferred from comments. `Flags`, `Guid`, `ParentGuid` and `CounterpartGuid` values remain source text. The tool does not evaluate fwupd's inheritance, GUID hashing, matching precedence, flag merging or runtime behavior; it does not claim to reproduce fwupd discovery.

This is not an LVFS integration or an updater. It produces no device support status, firmware license claim, install route or hardware-verification badge. Hardware/model mapping and user-facing lookup remain further work under issue 19.

## Sources and validation

- [Logitech HID++ quirks](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/logitech-hidpp/logitech-hidpp.quirk) and [plugin documentation](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/logitech-hidpp/README.md).
- [SteelSeries quirks](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/steelseries/steelseries.quirk) and [plugin documentation](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/steelseries/README.md).
- [UF2 quirks](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/uf2/uf2.quirk) and [plugin documentation](https://github.com/fwupd/fwupd/blob/17b23256a336478d6b5d71b714e7b4be7570a50f/plugins/uf2/README.md).

Seven regression tests cover the examples above, duplicate declarations, source-line fidelity, exact namespace lookup, unsupported syntax, immutable revisions and incomplete fetches. The generated sample was also compared with separately downloaded source files: all 104 section names and ordered properties matched. No hardware test was performed.
