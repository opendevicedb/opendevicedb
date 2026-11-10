# betaflight-betaflight-15899#discussioncomment-19330863

- Sent/published: 2026-11-01T10:05:34Z
- Channel: GitHub
- Public permalink: https://github.com/betaflight/betaflight/discussions/15899#discussioncomment-19330863
- Subject: OpenDeviceDB lists every Betaflight board target, with its MCU and a link to its config
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Thanks for pointing this out. You're right: 603 imported target configurations should not be presented as proof of 603 distinct physical flight-controller models.

The current import is keyed from Betaflight target names, so it does not solve the target-to-hardware relationship or cross-project naming differences. Your SPEEDYBEE_F745_AIO / SPEEDYBEEF745AIO example is exactly the kind of case where a shared physical-device identity and separate project-specific target aliases matter.

I don't want to imply that this mapping has already been corrected. Is there an upstream-maintained source for the commercial board names/revisions associated with each target, or should these mappings be treated as individually curated records? The original target and config link should remain visible in either case.

Thank you for helping identify the limit of the import.

Written with AI assistance.
