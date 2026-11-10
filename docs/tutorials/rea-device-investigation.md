# Investigating one device question with REA and OpenDeviceDB

> **Draft.** Steps 1 to 3 are written; steps 4 and 5 are an outline. Proposed in
> [morluto/rea discussion 5334](https://github.com/morluto/rea/discussions/5334) as a
> joint tutorial. Corrections are welcome there or as a pull request.

This tutorial follows one loop: **pick a device, look up what is already known,
choose one open question, investigate it, and contribute a scoped finding.** It uses
the [REA question template](https://github.com/morluto/rea/discussions/5334) to keep
planning separate from verified results.

The worked example is the **V380 S300** dual-lens pan/tilt Wi-Fi camera, because its
protocol notes and client are public:

- record: [opendevicedb.org/devices/macro-video/s300](https://opendevicedb.org/devices/macro-video/s300/)
- protocol notes: [v380-lan-protocol/PROTOCOL.md](https://github.com/smichea/v380-lan-protocol/blob/main/PROTOCOL.md) (CC BY 4.0)
- client: [v380-lan-client](https://github.com/smichea/v380-lan-client) (AGPL-3.0-or-later)

You need your own device to go past step 3. Do not use someone else's camera, account
or network.

## 1. Look the device up first

Before capturing anything, check whether the work already exists. Use any of these:

- the website: search for "V380 S300" on [opendevicedb.org/devices](https://opendevicedb.org/devices/);
- the static API: `https://opendevicedb.org/api/devices/macro-video/s300.json`;
- the MCP server [`@opendevicedb/mcp`](https://github.com/opendevicedb/opendevicedb/tree/main/packages/mcp),
  from your coding agent: `lookup_device(vendor: "Macro-Video", model: "S300")`, or
  `lookup_device(usb: "VID:PID")` for a USB device.

Read three things in the result:

1. **Status.** `controllable` here: an open client drives the camera over its stock
   firmware. It says nothing about every firmware version or hardware revision.
2. **What was exercised versus recovered statically.** The record says login, live
   HEVC video, IMA ADPCM audio, pan/tilt, talkback login and configuration reads were
   exercised on a real camera. Live settings, SD-card search and replay were only
   recovered from the app.
3. **Identity details.** Hardware `HsAkQQVL`, firmware
   `AppEV3L_V2_V1.0.9.10_20250731`. If yours differs, note it: a match on the model
   name alone is a hint, not proof.

If nothing is known about your device, the lookup says so. That is a useful result
too: it means your investigation can start from zero, and its findings will be new.

## 2. Choose one open question

Pick **one** question that the record leaves open, small enough to answer with a few
observations. For the S300, the protocol notes list several statically recovered
areas. A good first question is:

> Does the SD-card search command (361) behave as the static notes describe on a
> camera that has a card inserted?

The notes say: request 361 is 128 bytes with the device ID at offset 4, the ticket at
8, two date ranges from offsets 14 and 34, and the reply 461 carries an `i16` result
at offset 4 (`1` ready, `-1` none, `-2` no card, `-3` card error, `-4` bad device ID,
`-5` bad ticket). The original camera had no SD card, so none of it was exercised.

Avoid questions that need anything you should not do: no firmware flashing for this
question, no vendor cloud access beyond your own account, and no bypassing of
authentication you do not own.

## 3. Plan it with the REA template

Fill the template before running anything. Fields you have not established stay
`unknown`.

```text
Target/build: V380 S300, hardware HsAkQQVL, firmware <read from your camera>
Starting state: camera on the LAN, 1 SD card inserted and formatted by the camera,
  at least one recording on it, v380-lan-client logged in
One action or input: send search 361 for a date range that covers the recording
Documentation/source reference and version: PROTOCOL.md "SD-card listing and replay
  (static)", at the commit you read
Expected output based on that source: 461 with result 1 (ready), then 362/462
  result packets with 13-byte entries
Observed output: unknown (not run yet)
Question this observation raises: unknown
Evidence reference: packet capture file and client log, kept locally
Possible explanation A: (fill after observing)
Possible explanation B: (fill after observing)
One next check that could distinguish A from B: (fill after observing)
What remains unknown: replay framing and decryption (363/463), other firmware versions
```

Two rules make the result reusable:

- **Write the expected output before running.** If you cannot cite a source for it,
  write `unknown` instead of a guess.
- **Keep the capture local.** Only the description of the finding, with the evidence
  needed to reproduce it, is shared. Recordings from your camera can contain private
  images and must not be published.

## 4. Investigate (outline)

- Run the single action from the plan and capture it.
- Compare each field with the notes; record matches and differences.
- Keep negative and partial results: "result -2 although a card is inserted" is a
  finding.
- Stop at the question's boundary. Replay (363) is a separate question.

## 5. Contribute a scoped finding (outline)

- Update only what you verified: for example, move "SD-card search" from static to
  exercised in the protocol notes, with your firmware version and evidence.
- In OpenDeviceDB, propose the change with the MCP `claim_device` and
  `publish_findings` tools from a local checkout, or as a pull request. Keep the record
  status unchanged unless the evidence supports a change.
- Say what remains unknown, so the next person can pick the next question.
