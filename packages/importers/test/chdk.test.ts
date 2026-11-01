import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, type DeviceRecord } from "@opendevicedb/core";
import { existingCameras } from "../src/camera-ids.ts";
import { parseBuilds, splitNames, fromBuilds } from "../src/sources/chdk.ts";

const D = "2026-11-01";
// As served by mighty-hoernsche.de (stable page), one row per camera and firmware.
const PAGE = `<h2>CHDK-SVN Autobuild Download</h2><table>
<tr style="background-color: rgb(232, 232, 232);"><th>Camera</th><th>Firmware</th><th>Complete</th><th>Small</th></tr>
  <tr class="row1">
<td rowspan="2">PowerShot&nbsp;A1000</td>
<td>1.00A</td>
<td>
<a href="bins/a1000-100a-1.6.1-6355-full.zip">a1000-100a-1.6.1-6355-full.zip</a>&nbsp;&nbsp;<span class="kb">(837KB)</span> <br />
<td>
<a href="bins/a1000-100a-1.6.1-6355.zip">a1000-100a-1.6.1-6355.zip</a>&nbsp;&nbsp;<span class="kb">(366KB)</span> <br />
<tr class="row1">
<td>1.00B</td>
<td>
<a href="bins/a1000-100b-1.6.1-6355-full.zip">a1000-100b-1.6.1-6355-full.zip</a>&nbsp;&nbsp;<span class="kb">(837KB)</span> <br />
<tr class="row2">
<td>PowerShot&nbsp;G7&nbsp;X</td>
<td>1.00D</td>
<td>
<a href="bins/g7x-100d-1.6.1-6355-full.zip">g7x-100d-1.6.1-6355-full.zip</a>
</table>`;
const TRUNK = `<tr class="row1"><td>IXUS&nbsp;185&nbsp;/&nbsp;ELPH&nbsp;180</td><td>1.00C</td><td><a href="bins/ixus185_elph180-100c-1.7.0-6400-full.zip">x</a></td></tr>`;

test("chdk: autobuild rows, rowspans, platform codes", () => {
  const b = parseBuilds(PAGE, false);
  assert.deepEqual(b, [
    { model: "PowerShot A1000", firmware: "1.00A", platform: "a1000", trunk: false },
    { model: "PowerShot A1000", firmware: "1.00B", platform: "a1000", trunk: false },
    { model: "PowerShot G7 X", firmware: "1.00D", platform: "g7x", trunk: false },
  ]);
  assert.deepEqual(parseBuilds(TRUNK, true), [{ model: "IXUS 185 / ELPH 180", firmware: "1.00C", platform: "ixus185_elph180", trunk: true }]);
  assert.deepEqual(splitNames("IXUS 185 / ELPH 180"), { model: "IXUS 185", aliases: ["ELPH 180"] });
});

test("chdk: one record per camera, merged with libgphoto2, development-only flagged", () => {
  const known = existingCameras([{ id: "canon/powershot-g7-x", vendor: "Canon", model: "PowerShot G7 X", category: "camera", status: "partial-protocol", provenance: { sources: ["libgphoto2"] }, updated: D } as DeviceRecord]);
  const rs = fromBuilds([...parseBuilds(PAGE, false), ...parseBuilds(TRUNK, true)], known, D);
  const by = new Map(rs.map((r) => [r.id, r]));
  assert.equal(rs.length, 3);
  const a1000 = by.get("canon/powershot-a1000")!;
  assert.equal(a1000.status, "controllable");
  assert.match(a1000.install![0].firmware_constraints!, /1\.00A, 1\.00B/);
  assert.ok(by.has("canon/powershot-g7-x"), "merges with the libgphoto2 record");
  const ixus = by.get("canon/ixus-185")!;
  assert.deepEqual(ixus.aliases, ["ELPH 180"]);
  assert.match(ixus.install![0].installer!, /trunk/);
  assert.match(ixus.install![0].notes!, /Development builds only/);
  for (const r of rs) assert.deepEqual(validate(r), [], r.id);
});
