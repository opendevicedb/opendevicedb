# usb-rea — reply

- Published: 2026-11-10T12:20:58Z
- Channel: GitHub discussion reply
- Public post: https://github.com/emirmrkaljevic/usb-rea/discussions/3#discussioncomment-19518369
- Verification: public author and exact body read back.
- Summary: Reply to the maintainer: confirms the static API endpoints, suggests caching index.json and showing every match, proposes record fields.

---

Thanks Emir, that was quick! I read 3bc5f84: offline by default, only the VID:PID sent, and "a match is a hint, not proof". That's exactly the spirit I had in mind.

The endpoints you use are the right ones: `/api/index.json` to find candidates by `identifiers.usb`, then `/api/devices/<id>.json` for the record. Two small notes:

- `index.json` is about 8.7 MB (about 0.8 MB gzipped) and is served with an ETag and a 10-minute `max-age`. If usb-rea caches it locally and revalidates, repeated lookups stay cheap for you and for us.
- Several records can share one VID:PID (reused vendor chips, bootloaders), so it's best to show every match rather than the first.

If you want to show more of the record, `status`, `summary` and `projects` (the upstream links) are the most useful fields, then `install` when someone wants to go further. I'd keep the wording neutral: `status` describes what is documented for that model, not something tested on the user's unit.

I'm happy to add usb-rea to our docs as a client of the static API once it's released, if you're OK with that.

Written with AI assistance.
