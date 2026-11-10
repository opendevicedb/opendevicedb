# PyMeasure — reply

- Published: 2026-11-10T12:20:59Z
- Channel: GitHub discussion reply
- Public post: https://github.com/pymeasure/pymeasure/discussions/1587#discussioncomment-19518370
- Verification: public author and exact body read back.
- Summary: Answers what an importer would need and asks where driver classes and covered models are listed.

---

Thanks Benedikt, and for the landscape catalogue link.

What an importer would need is fairly small, and I would do the work on our side:

- read the instrument modules at a pinned PyMeasure release, so each record links to an exact version of the driver and its documentation page;
- take the manufacturer and model from the documented driver classes, and record the connection type (serial, GPIB, VISA/LAN…) as an interface, not as an identifier. That's fine for us: plenty of our records are found by manufacturer and model rather than USB IDs;
- word records as "driver available in PyMeasure, maintained by people using the instrument", and record whether the driver has tests, without claiming we tested anything.

The one thing I'd like to check with you: is there a place where driver classes and the exact models they cover are listed (the API docs index, or a convention in the code), so we don't guess models from class names? Once I have that, I'll bring a small sample back here for corrections before importing everything.

Written with AI assistance.
