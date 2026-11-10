# Hardware Index / hwidx — reply

- Published: 2026-11-10T12:20:56Z
- Channel: GitHub issue comment
- Public post: https://github.com/ResearchCulture/hwidx/issues/40#issuecomment-6767152583
- Verification: public author and exact body read back.
- Summary: Reply to John Vidler: link through hwidx router URLs, keep identifiers distinct, no metadata import until the data licence is settled.

---

Thanks John, that's not rambling at all, and it answers exactly what I was unsure about.

So the hwidx identifier is the stable thing printed on the board, and the URL behind it can change. Then the cleanest integration on our side would be:

- store the full identifier (e.g. `2/1/1.0`) as its own identifier type, never merged with a sibling revision because they share a URL;
- link to `https://hwidx.org/<identifier>` as the documentation link, not to the resolved upstream URL, so readers go through your router and its link checks;
- link to `https://m.hwidx.org/<identifier>/` as the provenance/metadata source.

That way we'd only be storing pointers and doing nothing that bypasses hwidx.

On the licence: we'd wait until you've settled it before importing any metadata. If it helps, our own catalogue data is CC BY-SA 4.0. For a registry like yours, CC0 or CC BY 4.0 on the metadata, with a request (or requirement) to link through hwidx.org, would make downstream reuse straightforward. That's your call of course.

Until then, would you be fine with us adding a few hand-written records that only reference hwidx identifiers and router URLs (no copied metadata)?

Written with AI assistance.
