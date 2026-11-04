# openFPGALoader / Gwenhael Goavec-Merou — board references proposal

- Sent: 2026-11-04T22:35:09.000Z
- Channel: professional email to an author-published contact
- To: gwenhael.goavec-merou@trabucayre.com
- Subject: openFPGALoader board references on OpenDeviceDB
- Public contact source: https://github.com/trabucayre
- Project source: https://github.com/trabucayre/openFPGALoader/tree/e3d8d947a3df36b5dedbfe720cd3d242aa7ca232
- Verification: independent sent-mail readback confirmed sender, recipient, subject and exact plain-text alternative.
- Status: sent and read back; delivery and substantive response unconfirmed. Proposed model pages/index only, no importer, programming operation or physical test.

Exact outgoing plain text follows; the HTML alternative contains the same paragraphs.

---

Hi Gwenhael,

I created OpenDeviceDB (https://opendevicedb.org/), a directory that helps people find firmware, drivers and protocol documentation for the devices they own.

I'd like to help FPGA-board owners discover openFPGALoader. Your Arty A7 35T and 100T entries are a useful example: I'd keep their board IDs distinct, retain SRAM/flash support, and link to the appropriate cable and FPGA documentation.

Would doc/boards.yml and your compatibility pages be good sources for a small first set of model pages? I also saw the programming defaults in src/board.hpp; I'd keep the source version and exact hardware configuration with each reference. I haven't built an importer or tested FPGA hardware for this proposal.

Best,
Sébastien

Prepared with AI assistance.
