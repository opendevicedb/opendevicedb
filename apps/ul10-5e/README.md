# UL10-5E browser capture

Open the standalone viewer from the BMV UL10-5E record or the USB identification result in Chromium. Place the probe on a stable test phantom, confirm the setup, and select the Cypress FX3 device. The Vascular preset uses depth index 1. Choose a one-second capture or continuous capture until disconnected. The viewer shows the decoded frames and can save the displayed image as PNG. Each new capture requires a fresh confirmation. Use on phantoms only.

WebUSB checks the product identity and firmware before configuration. Endpoint 1 OUT carries the fixed command sequence, endpoint 1 IN carries frame data and endpoint 2 IN carries messages. Stop requests the final Freeze packet. Disconnect the probe if the viewer reports an unconfirmed stop. The image has no calibrated distance scale.

Both probe apps use the same capture controls, local session history, raw export and video/frame-viewer web component. Under decoder pressure, continuous mode archives the incoming data and can omit images from the live preview.

The page embeds its worker, WebAssembly decoder and fixed settings. The worker reconstructs 512 × 512 RGBA frames, retaining temporal state across adjacent frames. The profile directory contains the ordered indices and unique command packets, selected aperture and filter rows, active oscillator samples, gain settings and the composed display palette for this preset. It can also replay a contiguous DATA stream up to 16 MiB.

## Build

From this directory, with Rust 1.99.0:

```sh
rustup target add wasm32-unknown-unknown
cargo build --locked --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/ul10_browser.wasm probe.wasm
node check.mjs
```

The site builds the standalone HTML with the same route mechanism as the convex viewer. The owner observed a live phantom image in the local browser app. Release verification also compared all 14 RGBA frames from the one-second phantom recording with the native reference and checked all 39 WebUSB writes, including Freeze, against the recorded sequence on a simulated transport.
