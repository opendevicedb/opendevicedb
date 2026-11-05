# UC5-2S USB: observed protocol and reconstruction

2026-11-05. Scope: one owner-identified convex probe, USB `04b4:4611`,
product text `UC5-2S`, decimal product ID `1435`. Observations on this unit
do not establish compatibility with every unit bearing that name.

## Identity and transports

The device enumerates at USB high speed with bulk OUT `02`, interrupt IN
`81` (64-byte descriptor maximum), and bulk IN `86`/`88` (512-byte descriptor
maximum). Host requests use 16,384 bytes on DATA `86` and 512 bytes on messages
`88`; these request sizes differ from the endpoint maximum packet size.
Linux adjusts the reported interrupt `bInterval` from 0 to 7.

Targeted control-IN identity reads use the following fields. Hexadecimal
notation is used except for lengths and timeouts. No serial value is published.

| Request type / request | Value | Index | Length | Observed result |
|---|---|---|---|---|
| `c0/a6` | `0000` | `0000` | 8 | Two bytes `20 01`; candidate firmware display 1.32 |
| `c0/a9` | `1f00` | `0000` | 32 | Product text UC5-2S and product ID 1435 |
| `c0/a9` | `1f20` | `0000` | 32 | Storage identity, intentionally omitted |

The implementation uses a 5,000 ms identity timeout. Product/storage strings
terminate at `ff`; NUL is not silently treated as a terminator. Identity bytes
were stable across three repetitions on one connection. This does not prove
stability across every reconnect or identify a PCB revision.

Hardware messages are interpreted only from a complete 512-byte host read;
short reads are not padded or joined. The public
[message decoder](../../components/ultrasound/convex-decoder/1.0.0/src/convex_messages.rs)
exposes the field layout without exporting device-unique fields. In the retained
phantom sessions, message PID0 reports raw probe ID0 and connection0 while
control-IN reads on the same handle report UC5-2S/1435. These identities remain
separate. USB firmware bytes are not the message's logic version.

Successful sessions report logic `0x4c02` (candidate series6/type1); another
session reports `0x0c00` (candidate series6/type0). The latter is refused before
configuration/Start by the experimental controller. No causal state-transition
mechanism or necessary recovery command has been established.

## Host command boundaries

The public [command codec](../../components/ultrasound/convex-decoder/1.0.0/src/convex_command.rs)
and [lifecycle planner](../../components/ultrasound/convex-decoder/1.0.0/src/convex_lifecycle.rs)
describe host serialization; they do not supply a calibrated acquisition profile.
An otherwise empty Start/Freeze command is 512 bytes: the eight little-endian
32-bit words below followed by 480 zero bytes.

```text
5a5aa5a5 00000002 00000000 00000000 00060001 VALUE 00000002 a5a55a5a
VALUE = 0 for Start; 1 for Freeze
```

The tested coordinator performs initial identity checks, explicitly selected
power handling, initial Freeze/query, bounded message reads and a second
control identity check on the same handle. Only an admitted runtime message
can bind configuration to that handle. The successful tested sequence has
19 host OUT transfers, including 13 configuration packets, Start and final
Freeze. The retained successful sessions use identical OUT payloads; those
resource-dependent payloads are not a freely distributable hardware profile.

Unknown/partial OUT results prohibit further writes rather than automatic
retry. Message changes and button candidates terminate the session. These are
host policies, not hardware acknowledgements. A completed host Freeze write
has not been verified as an acoustic stop. No firmware flashing, reset or
automatic retry was added for these sessions.

## Observed DATA framing

The [stream parser](../../components/ultrasound/convex-decoder/1.0.0/src/framing.rs)
retains opaque prefixes, incomplete tails and known gaps. A global candidate
header is 1,024 bytes beginning with two little-endian `7fff0000` markers.
Within that header, frame ID is u32 at `0x0c`, mode is u8 at `0x10`, P is u16
at `0x18` and N is u16 at `0x1c`. Lines retain a 32-byte prefix. The selected
reader parameters are explicitly A/B/C/D/E = 2/0/4/4/4; they are not defaults
for every mode or device.

The first successful phantom stream contains eleven such headers, IDs2..12,
mode0/P896/N32, separated by 231,424 bytes. Ten associated groups each retain
32 lines of 7,200 bytes (1,800 words), including each line prefix. The selected
image path interprets four u16 lanes. This establishes neither the ADC sampling
clock nor a calibrated RF/IQ interpretation, acoustic depth or spatial
completeness. Checksums, universal frame-ID monotonicity and other modes are
not established by these observations.

## Retained phantom results

All physical attempts below used an owner-confirmed stable coupled phantom;
the owner confirmed unplugging afterward. No new physical acquisition was
needed to publish these findings.

| Attempt | Host result | DATA retained | Final review images |
|---|---|---|---|
| 01 | Runtime/control ID mismatch refused before configuration/Start | 0 bytes | 0 |
| 02 | 19 OUT complete; DATA is an exact incrementing u16 counter | 2,113,536 bytes | 0 |
| 03 | Corrected command builder; 19 OUT complete; no global header | 770,048 bytes | 0 |
| 04, 1 s | Same 19 OUT as 03; bounded RAM receive | 2,776,576 bytes | 9 after initialization |
| 05 | Logic type0 refused before configuration/Start | 0 bytes | 0 |
| 06, 1 s | Same 19 OUT as 04; sealed RAM receive | 2,776,576 bytes | 9 |
| 07, 5 s | Same 19 OUT as 04; sealed RAM receive | 13,483,008 bytes | 36 |

Attempt04 retains 169 full DATA reads, one empty timeout and one 7,680-byte
timeout prefix. Raw hashes, command identities and source ranges were audited
offline. Attempt06 displayed four lossy-preview images, while attempt07
displayed none; their independent final reconstruction still produced 9/36.
Host journals do not prove loss-free reception inside the device. Separate
sessions do not isolate why framing or logic state changed. Export playback
at a chosen 10 fps is not a measured exposure rate.

## Published resource-free replay

The [original image profile](../../components/ultrasound/convex-open-image/0.1.0/README.md)
and [browser replay application](https://opendevicedb.org/components/)
reconstruct already recorded DATA without configuration files, vendor software,
a server or USB access. Native Linux and WASM share the same in-memory Rust
processing library; the hosts provide transport, storage and display.

This profile generates its 16-tap binomial filter and grayscale palette, uses
flat sample-index gain, and disables optional spatial enhancement. Its chosen
normalized 60-degree sector is a display convention, not a measured probe angle.
On two retained phantom acquisitions it preserves 9/36 reference frame counts.
Its appearance intentionally differs from the earlier image profile. Native
and WASM output differences remain bounded by two intensity levels out of255
in the published validation; that bound does not measure image correctness.

The generic [acquisition composition](../../compositions/ultrasound/convex-capture/composition.json)
still requires a separately supplied hardware configuration. It must not be
advertised as autonomous plug-and-scan. ADC/clock attribution, hardware filters,
the electrical meaning of HV words and a freely distributable acquisition
profile remain unresolved. No clock or transmit voltage is inferred to fill
these gaps. Full-engine comparison, acoustic/electrical characterization,
spatial calibration, repeatability and diagnostic suitability remain open.
The device record therefore remains `partial-protocol`, with manual verification.
