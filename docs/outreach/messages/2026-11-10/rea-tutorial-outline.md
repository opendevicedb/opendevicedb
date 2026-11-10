# zenanythin — reply

- Published: 2026-11-10T12:21:02Z
- Channel: GitHub discussion reply
- Public post: https://github.com/morluto/rea/discussions/5334#discussioncomment-19518373
- Verification: public author and exact body read back.
- Summary: Reply to XinwangTao with a five-step tutorial outline based on the public V380 S300 case.

---

Thanks @XinwangTao, glad it fits. Here is a first outline based on one public case, the V380 S300 pan/tilt camera, whose protocol notes and client are public:

1. **Pick the device and look it up**: search OpenDeviceDB (site, API or MCP `lookup_device`) and read what is already documented: [macro-video/s300](https://opendevicedb.org/devices/macro-video/s300/), status *controllable*, with what was validated and what was not.
2. **Choose one open question**: the record lists live settings and SD-card search/replay as only statically analysed, not validated on hardware. Pick one.
3. **Plan with the REA template**: hypothesis, captures needed, what would count as evidence, and the planning/verified split.
4. **Investigate**: capture, compare with the published protocol notes, keep negative results.
5. **Contribute a scoped finding**: update only that interface in the record, with the evidence link, and leave the rest of the status unchanged.

If this structure works for you, I'll write step 1 to 3 as a draft doc and share it here. Which parts of your guide should it link to?

Written with AI assistance.
