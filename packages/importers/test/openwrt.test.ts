import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "@opendevicedb/core";
import { fromToh, tohInstall, releaseImage, imageProfiles, selectorUrl, FACTORY_GUIDE } from "../src/sources/openwrt.ts";

const D = "2026-10-17";
const REL = "https://downloads.openwrt.org/releases/25.12.1/targets/ath79/generic";
const FACTORY = `${REL}/openwrt-25.12.1-ath79-generic-tplink_archer-c7-v2-squashfs-factory.bin`;
const SYSUPGRADE = `${REL}/openwrt-25.12.1-ath79-generic-tplink_archer-c7-v2-squashfs-sysupgrade.bin`;
const profiles = new Map(
  [...imageProfiles({ profiles: { "tplink_archer-c7-v2": { images: [{ name: FACTORY.split("/").pop() }, { name: SYSUPGRADE.split("/").pop() }] } } })]
    .map(([file, id]) => [`${REL}/${file}`, id] as [string, string]),
);

test("release image urls and profiles.json", () => {
  assert.deepEqual(releaseImage(FACTORY), { dir: REL, version: "25.12.1", target: "ath79/generic", file: "openwrt-25.12.1-ath79-generic-tplink_archer-c7-v2-squashfs-factory.bin" });
  assert.equal(releaseImage("https://downloads.openwrt.org/snapshots/targets/ath79/generic/x.bin"), null);
  assert.equal(profiles.get(FACTORY), "tplink_archer-c7-v2");
  assert.equal(selectorUrl("25.12.1", "ath79/generic", "tplink_archer-c7-v2"),
    "https://firmware-selector.openwrt.org/?version=25.12.1&target=ath79%2Fgeneric&id=tplink_archer-c7-v2");
});

test("stock web UI: vendor-upload, easy, with the Firmware Selector", () => {
  const routes = tohInstall({
    devicepage: "toh:tp-link:archer_c7", installationmethods: ["GUI OEM", "U-Boot TFTP recovery", "U-Boot TFTP + serial recovery", "TFTP generic"],
    firmwareopenwrtinstallurl: [FACTORY], firmwareopenwrtupgradeurl: [SYSUPGRADE],
  }, profiles);
  const installer = "https://firmware-selector.openwrt.org/?version=25.12.1&target=ath79%2Fgeneric&id=tplink_archer-c7-v2";
  assert.deepEqual(routes.map((r) => [r.method, r.difficulty]), [["vendor-upload", "easy"], ["other", "medium"], ["serial", "hard"]]);
  for (const r of routes) {
    assert.equal(r.project, "OpenWrt");
    assert.equal(r.guide, "https://openwrt.org/toh/tp-link/archer_c7");
    assert.equal(r.installer, installer);
  }
  assert.equal(routes[0].opens_device, false);
  assert.equal(routes[0].brick_risk, "low");
  assert.equal(routes[0].reversible, undefined);
  assert.match(routes[0].notes!, /GUI OEM/);
  assert.match(routes[1].notes!, /U-Boot TFTP recovery, TFTP generic/);
  assert.deepEqual(routes[2].tools, ["USB-serial adapter (3.3 V)", "Computer with a TFTP server", "Ethernet cable"]);
  assert.equal(routes[2].opens_device, true);
});

test("stock web UI routes name no image type unless the source does (GL.iNet sysupgrade-only)", () => {
  // An ordinary GUI row: neutral wording, the device page decides which image.
  const plain = tohInstall({ devicepage: "toh:tp-link:archer_c7", installationmethods: ["GUI OEM"], firmwareopenwrtinstallurl: [FACTORY] });
  assert.match(plain[0].notes!, /upload the OpenWrt image the device page names through the stock firmware's upgrade page/);
  assert.doesNotMatch(plain[0].notes!, /factory image through/);
  // GL-MT3000: the ToH note requires the sysupgrade image and forbids the factory one.
  const gl = tohInstall({
    devicepage: "toh:gl.inet:gl-mt3000", installationmethods: ["GUI OEM", "GL.Inet installation"],
    commentinstallation: "Flash OpenWrt 'sysupgrade' image from GL.iNet web UI, select do not keep settings Do not use 'factory' image to preserve GL U-boot.",
  });
  assert.equal(gl.length, 1);
  assert.match(gl[0].notes!, /upload the sysupgrade image \(not the factory image, as the note below says\)/);
  assert.doesNotMatch(gl[0].notes!, /upload the factory image/);
  assert.match(gl[0].notes!, /Table of Hardware note: Flash OpenWrt 'sysupgrade' image/);
  // A note that only mentions sysupgrade for a later step does not change the wording.
  const later = tohInstall({ installationmethods: ["GUI OEM"], commentinstallation: "flash factory.img, then flash sysupgrade.bin to reclaim full flash memory" });
  assert.match(later[0].notes!, /the OpenWrt image the device page names/);
});

test("sd card, unknown method, missing device page", () => {
  const sd = tohInstall({ installationmethods: ["SD card"], firmwareopenwrtinstallurl: ["https://downloads.openwrt.org/releases/25.12.1/targets/bcm27xx/bcm2711/openwrt-25.12.1-bcm27xx-bcm2711-rpi-4-ext4-factory.img.gz"] });
  assert.equal(sd.length, 1);
  assert.equal(sd[0].method, "sd-card");
  assert.equal(sd[0].guide, FACTORY_GUIDE, "no device page: the generic factory installation guide");
  assert.equal(sd[0].installer, undefined, "profile not known: no selector link");

  // "see git-commit" without a device page: the commit that added support (git.openwrt.org only)
  const commit = "https://git.openwrt.org/?p=openwrt/openwrt.git;a=commit;h=f2f428c6991ba4be7180208c99693d8bb37e082b";
  const git = tohInstall({ installationmethods: ["see git-commit"], supportedsincecommit: commit, firmwareopenwrtinstallurl: [FACTORY] });
  assert.deepEqual(git.map((r) => [r.method, r.difficulty, r.guide]), [["other", "medium", commit]]);
  assert.match(git[0].notes!, /does not record the install method. A factory image exists/);
  const lede = tohInstall({ installationmethods: ["see git-commit"], supportedsincecommit: "https://git.lede-project.org/?p=source.git;a=commit;h=1" });
  assert.equal(lede[0].guide, FACTORY_GUIDE);
  assert.equal(lede[0].difficulty, "hard", "no method and no factory image");

  const noted = tohInstall({ devicepage: "toh:cudy:wr3000", installationmethods: ["GUI OEM"], commentinstallation: "Need a signed OpenWrt intermediary image from Cudy first." });
  assert.match(noted[0].notes!, /Table of Hardware note: Need a signed/);
});

test("ToH rows → records with routes", () => {
  const columns = ["deviceid", "brand", "model", "version", "devicetype", "supportedcurrentrel", "devicepage", "installationmethods", "firmwareopenwrtinstallurl"];
  const { records } = fromToh({ columns, entries: [
    ["tp-link:archer_c7_v2", "TP-Link", "Archer C7", ["v2"], "WiFi Router", "25.12.1", "toh:tp-link:archer_c7", ["GUI OEM"], [FACTORY]],
  ] }, D, profiles);
  assert.deepEqual(validate(records[0]), []);
  assert.equal(records[0].install![0].method, "vendor-upload");
  assert.ok(records[0].install![0].installer);
});
