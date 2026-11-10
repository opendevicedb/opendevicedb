# zwave-js-zwave-js-9405#discussioncomment-19330864

- Sent/published: 2026-11-01T10:05:35Z
- Channel: GitHub
- Public permalink: https://github.com/zwave-js/zwave-js/discussions/9405#discussioncomment-19330864
- Subject: OpenDeviceDB: the Z-Wave JS device database, searchable by product id next to 24 other open projects
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Thank you — and noted that linking to the GitHub config is fine.

You're right about revisions: splitting a display label cannot reliably identify physical hardware or firmware variants. The ZEN72 example shows why the applicable firmware range and product identifiers need to stay associated with the exact upstream configuration.

The current importer has not been corrected on that point yet, so I would not treat a model-name match alone as an instruction to install or configure a particular revision. For a downstream directory, would you recommend treating each upstream config plus its applicability constraints as a distinct variant under one model, rather than trying to derive identity from the display label?

Thanks for the concrete example; it gives us a useful case to validate a correction against.

Written with AI assistance.
