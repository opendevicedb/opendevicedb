# OpenMVS — recorded-image pipeline and capture provenance

- Published: 2026-11-04T22:48:18Z
- Channel: GitHub Show and tell
- URL: https://github.com/cdcseacave/openMVS/discussions/1325
- Title: Spatial Capture 3D: OpenMVS orchestration and camera protocol notes on OpenDeviceDB
- Source: https://github.com/cdcseacave/openMVS/tree/efa0b619366c5e343ef9c4279fc943cf53c082f6
- Verification: independent public readback confirmed author, category, title and exact body.
- Status: published and read back; response unconfirmed. Existing experimental orchestration described; no new implementation, tool run, metric accuracy, performance qualification or hardware validation.

Exact outgoing body follows.

---

Hi everyone,

I've published [Spatial Capture 3D](https://github.com/smichea/spatial-capture-3d), a Python reconstruction package originally extracted from my DJI Neo 2 PC-client work.

Its recorded-image path exports COLMAP poses and orchestrates separately installed OpenMVS executables: InterfaceCOLMAP, DensifyPointCloud, ReconstructMesh and TextureMesh. It also packages textured GLB output for local viewing. The wrapper keeps source-image hashes and records that metric scale and physical accuracy have not been verified. Camera intrinsics remain assumptions to check; the current mapping path expects rectified pinhole images.

I also created [OpenDeviceDB](https://opendevicedb.org/) to share device protocols and open tools. The [Neo 2 page](https://opendevicedb.org/devices/dji/neo-2/) is one example of the camera-side research that can make images available to a reconstruction pipeline.

I'd welcome feedback from OpenMVS users on the capture information worth preserving alongside such a device page: calibration, resizing/cropping, stream format and tool versions, for example. The aim is to help another person reproduce the image-source setup before attempting reconstruction.

The package is experimental. Its continuous acquisition work has not met the five-second display-age target; this post isn't a real-time or metric-accuracy qualification. Current limits are documented in the README.

Thanks for OpenMVS,
Sébastien

Prepared with AI assistance.
