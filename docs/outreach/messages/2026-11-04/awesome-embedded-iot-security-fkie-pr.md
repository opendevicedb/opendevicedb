# Awesome Embedded and IoT Security / FKIE — resource listing proposal

- Published: 2026-11-04T21:51:53Z
- Channel: GitHub pull request
- URL: https://github.com/fkie-cad/awesome-embedded-and-iot-security/pull/41
- Title: docs: add OpenDeviceDB to websites
- Head: 31e8343e72aa4a654d54d38d2fa31872e56b04fe
- Base: fbd0301e6690a21d98ca8d565c0657aae0fba339
- Contributor guide: https://github.com/fkie-cad/awesome-embedded-and-iot-security/blob/fbd0301e6690a21d98ca8d565c0657aae0fba339/contributing.md
- Verification: connector readback confirmed author, exact PR body, head, two commits and one changed README (five additions, three deletions).
- Status: open non-draft, unmerged. Local awesome-lint 2.3.0 passed. Upstream workflow reports action_required with no jobs/check runs; no upstream CI success claimed.
- Workflow: https://github.com/fkie-cad/awesome-embedded-and-iot-security/actions/runs/41920034405

The first commit corrects three existing lint findings: repeated names in J-Link/IoTGoat descriptions and the misplaced license directive. A banner comment keeps the heading layout intact; the license text is unchanged. The second commit adds exactly one line in Websites, preserving its parent README bytes outside that line.

Proposed entry:

```markdown
- [OpenDeviceDB](https://opendevicedb.org/) - Directory linking device models to firmware, drivers, tools and protocol research.
```

Exact outgoing PR body follows.

---

Add [OpenDeviceDB](https://opendevicedb.org/) under **Websites**: a directory linking device models to firmware, drivers, tools and protocol research. It can help researchers find existing work before investigating a device. OpenDeviceDB is my project.

The entry is a separate commit. The preceding commit fixes three existing `awesome-lint` findings: repeated names in the J-Link and IoTGoat descriptions, and the misplaced license directive. A banner comment preserves the existing heading layout; license text is unchanged.

Validation: `npx awesome-lint readme.md` passes with awesome-lint 2.3.0; the canonical site returned HTTP 200 without redirect; one entry in the intended section; `git diff --check` passes. README only.

Prepared with AI assistance.
