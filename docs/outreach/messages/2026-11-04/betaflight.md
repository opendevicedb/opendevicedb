# betaflight

- Sent/published: 2026-11-04T11:41:07Z
- Channel: GitHub discussion
- Public permalink: https://github.com/betaflight/betaflight/discussions/15899#discussioncomment-19396466
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

@osirisinferi Yes, mapping firmware targets to actual products is work the directory should take on. By “individually curated” I meant checking a particular commercial board and hardware revision against a source, then recording which firmware target it uses. I should have explained that more plainly.

Your SPEEDYBEE_F745_AIO / SPEEDYBEEF745AIO example is a useful starting point. A shared name or similar spelling is not enough to establish that two target entries cover the same exact hardware.

I have recorded the problem and the expected correction in https://github.com/opendevicedb/opendevicedb/issues/16. The current import still indexes targets; the product mappings and the distinction in displayed counts are not fixed yet. The existing target/configuration links will remain available as source evidence.

Thank you for making the gap concrete. This is useful feedback on what the directory needs to provide.

Written with AI assistance.
