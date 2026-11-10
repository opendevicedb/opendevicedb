# Theengs Decoder — reply

- Published: 2026-11-10T12:21:01Z
- Channel: GitHub discussion reply
- Public post: https://github.com/theengs/decoder/discussions/723#discussioncomment-19518371
- Verification: public author and exact body read back.
- Summary: Proposes keeping decoder-only, gateway-required and decryption requirements distinct; announces a sample for corrections.

---

Thanks @DigiH, this is very helpful.

So that we don't overclaim, I'd keep three things distinct in each record:

- properties decoded from advertisements by the Decoder library alone;
- properties or controls that need OpenMQTTGateway (or Theengs Gateway), such as the SwitchBot controls;
- whether decryption is required and which scheme (LYWSD03MMC PVVX, BTHome v2, Victron Energy), noting that it is done by the client app.

I'll use the device list you linked as the source, link each record to its decoder page, and keep grouped decoder IDs grouped rather than inventing one record per model name. I'll post a small sample here for corrections before going further.

Written with AI assistance.
