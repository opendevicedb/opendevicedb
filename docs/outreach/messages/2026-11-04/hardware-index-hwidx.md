# Hardware Index — versioned identifier interoperability question

- Published: 2026-11-04T20:05:23Z
- Channel: GitHub Issue / documented contact and non-PR question route
- URL: https://github.com/ResearchCulture/hwidx/issues/40
- Channel source: https://m.hwidx.org/
- Verification: open state, author, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No new identifier request, importer, metadata republication or license agreement.

---

Hi, I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) linking device models to firmware, drivers and documentation. I'd like to reference hwidx identifiers without losing hardware revision information.

I noticed that [2/1/1.0](https://github.com/ResearchCulture/hwidx/blob/5174da135a4bc0e67bb6d1b4ad1ec01ebad26ceb/2/1/1.0.yml) and [2/1/2.0](https://github.com/ResearchCulture/hwidx/blob/5174da135a4bc0e67bb6d1b4ad1ec01ebad26ceb/2/1/2.0.yml) describe different Rib:bit prototypes while sharing the same documentation URL. This is a useful concrete case: a downstream catalogue mustn't merge their identities just because those URLs match.

My proposed approach is to preserve the complete hwidx identifier, keep the inherited organization context, and treat the documentation URL as a separate pointer that can change. An hwidx ID would also remain separate from USB/PCI IDs and OSHWA certification IDs.

Is that the intended interpretation? Is there a preferred stable metadata-reference format for downstream catalogues, and which attribution/licensing terms apply to reusing the YAML metadata? I didn't find an explicit data license in this repository.

No hwidx importer or metadata republication is implemented by this proposal. I'm asking here because the README and website identify issues as the route for questions; I'm not requesting a new identifier.

Thanks!

Prepared with AI assistance.
