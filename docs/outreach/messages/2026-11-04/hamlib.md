# Hamlib — radio support discovery proposal

- Published: 2026-11-04T22:05:11Z
- Channel: GitHub Show and tell discussion
- URL: https://github.com/Hamlib/Hamlib/discussions/2310
- Title: OpenDeviceDB: helping radio owners discover Hamlib support
- Source: https://github.com/Hamlib/Hamlib/tree/9199f8a239aed26b5eb0ee9c1a73bf51580483ce
- Verification: independent public readback confirmed author, category, title and exact body.
- Status: published and read back; response unconfirmed. Proposed model pages/index only; no importer, Hamlib code change or radio test.

Exact outgoing body follows.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org/), a directory to help device owners find existing firmware, drivers and protocol documentation. I'd like to add radio-model pages that point people to Hamlib's own support information.

For example, a page for an IC-7300 could link to the relevant Hamlib release and model identifier, while retaining the upstream support status and setup instructions. I haven't built a Hamlib importer or tested a radio.

Your README's distinction between the Hamlib 5 development branch and the 4.7 branch seems particularly important to keep. For a small initial model index, would you recommend a release-specific `rigctl --list` output, the supported-radio wiki, or another maintained source?

I'd welcome feedback from people who maintain or use these backends, including limitations a device-directory page should make visible.

Thanks,
Sébastien

Prepared with AI assistance.
