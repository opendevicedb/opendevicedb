# usb-rea

- Sent/published: 2026-11-04T11:49:51Z
- Channel: GitHub discussion
- Public permalink: https://github.com/emirmrkaljevic/usb-rea/discussions/3
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi Emir,

I came across usb-rea through Glama. Your use of existing liquidctl/rivalcfg protocol knowledge to validate the generated output is particularly relevant to a project I maintain.

I created [OpenDeviceDB](https://opendevicedb.org) following the release of REA, to help people find existing device-protocol, driver and firmware work. Its MCP server provides read-only `lookup_device` / `search_devices` by vendor/model or USB VID:PID and links results back to upstream sources. An unknown device remains explicitly unknown; a matching USB ID alone does not establish exact-unit compatibility.

Would an optional lookup before a capture be useful in usb-rea? The first step could simply show existing projects and their evidence/limitations. It would use the identity supplied by the user; capture files stay in the local analysis workflow. Sharing new findings could remain a separate user-reviewed contribution.

I can prepare a small example if this fits your plans. The server is already published as `@opendevicedb/mcp`, and its [documentation](https://github.com/opendevicedb/opendevicedb/tree/main/packages/mcp) describes the public read-only backend and the separate local-checkout contribution workflow.

Thanks for sharing usb-rea. Written with AI assistance.
