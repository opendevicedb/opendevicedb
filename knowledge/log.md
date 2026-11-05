# Knowledge update log

## 2026-11-05

- **Correction and implementation**: The owner requested actual capture rather than reading driver images, and explicitly chose a browser-only runtime. Added [WebUSB acquisition, Rust/WASM reconstruction and reusable frame display](implementation/browser-ultrasound-capture.md). The old HTTP preview is a separate utility.

- **Implementation**: Added the [read-only ultrasound preview](implementation/ultrasound-preview.md), reusable PNG frame UI and origin-restricted local bridge. Clarified scalar technical examples and simplified controls/layout. Physical acquisition remains outside this browser component.

- **Implementation**: Added the [component registry and scalar application pilot](implementation/component-pilot.md), including browser customization and read-only MCP tools. Desktop packaging and spatial capture remain explicit outstanding requirements.
- **Creation**: Translated the agreed French [composable applications specification](specifications/composable-applications.md) into English and established an OKF v0.2 bundle. The owner authorized implementation after the specification commit.
