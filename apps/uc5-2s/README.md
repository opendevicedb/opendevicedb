# UC5-2S standalone WebUSB capture

Open the app from the UC5-2S device record or from the USB identification result
for 04b4:4611. The standalone HTML contains its worker and Rust/WASM decoder.
Choose a General B-mode depth index, couple the probe to a stable phantom, then
confirm and connect. Disconnect before selecting another depth. The application
displays live frames, can save a PNG and records raw DATA locally in IndexedDB.
Depth indices have no calibrated distance scale.

The site renders the app at `/apps/uc5-2s/index.html` using the checked-in
WASM. Building the **site** and running the app require no extra resource files.
The Rust library embeds the selected per-depth image parameters and the
configuration packets for the supported status signature. Building the WASM
requires Rust 1.99.0 with the wasm32-wasip1 target. From the repository root:

```sh
npm run probe:build
npm run components:build
npm run build
```

The optional offline export example refreshes the snapshots from a matching
resource set and device status message. No recordings or status messages
are required for a normal build.

## Bench verification

One UC5-2S was tested on a stable phantom. The packaged implementation was
compared offline with the local application used for that test. With the
supported device status message, all 13 configuration packets matched at each
of the eight depth indices. The following archived DATA streams also produced
identical 512 × 512 RGBA frames in both implementations.

| General depth index | Frames compared |
| --- | ---: |
| 0 | 9 |
| 1 | 38 |
| 2 | 9 |
| 5 | 1 |

These counts describe the particular recordings. Indices 3, 4, 6 and 7 have
packet comparisons only. The comparison does not establish a frame rate,
a calibrated depth in centimetres, or suitability for use on people or animals.
