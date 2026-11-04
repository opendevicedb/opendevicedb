# COLMAP — capture pipeline and device-source documentation

- Published: 2026-11-04T22:45:20Z
- Channel: GitHub Show and tell
- URL: https://github.com/colmap/colmap/discussions/4964
- Title: Spatial Capture 3D: an experimental COLMAP-based pipeline and OpenDeviceDB
- Source: https://github.com/colmap/colmap/tree/e6644e744488a13f3aba82958500db9066341205
- Verification: independent public readback confirmed author, category, title and exact body.
- Status: published and read back; response unconfirmed. Describes the existing experimental capture package and its limits; no new integration, release, performance qualification or hardware test.

Exact outgoing body follows.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org/) to share device protocol research and help people find open tools for their hardware. One example is my [DJI Neo 2 protocol work and PC client](https://opendevicedb.org/devices/dji/neo-2/).

I've also released [Spatial Capture 3D](https://github.com/smichea/spatial-capture-3d), a camera-independent Python package with an experimental incremental COLMAP mapper, optional OpenMVS orchestration, textured GLB packaging and camera-path replay. Its SfM extra currently pins pycolmap 4.2.1. Camera adapters supply images, intrinsics, source identity and PC availability timestamps; the reconstruction package itself doesn't operate the hardware.

The current mapper expects rectified pinhole images. Continuous reconstruction is still experimental and has not met the five-second display-age target, so this isn't a qualified real-time reconstruction demo. The README describes the current limitations and recorded diagnostics.

I'd welcome feedback on the pipeline, particularly from people feeding decoded camera streams into COLMAP. Which calibration, image-processing or protocol details would make a device page useful when building a new image-source adapter? That's the connection I'd like to improve between the reconstruction tool and OpenDeviceDB.

Thanks for COLMAP,
Sébastien

Prepared with AI assistance.
