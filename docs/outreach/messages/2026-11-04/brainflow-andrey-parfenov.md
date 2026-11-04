# BrainFlow / Andrey Parfenov

- Sent/published: 2026-11-04T14:02:36.000Z
- Channel: email
- Public project contact: andrey@brainflow.org
- Subject: OpenDeviceDB: making BrainFlow device interfaces easier to discover
- Original content format: text/plain

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hello Andrey,

I created OpenDeviceDB following the release of REA: https://opendevicedb.org . It is my independent open-source directory linking device models to existing protocols, drivers and open firmware, so people can find and reuse earlier work.

BrainFlow seems particularly relevant to its coverage of biosensors. I have read your supported-board documentation: a person searching for a device could find the existing BrainFlow interface and setup instructions before starting another implementation. There is no BrainFlow importer in OpenDeviceDB yet.

I am considering a small downstream import using the board descriptions and the supported-board documentation, initially for a few physical models. Synthetic, playback and streaming boards would be excluded as standalone devices. Different transports and firmware requirements would need to remain explicit—for example, your Ganglion documentation distinguishes native BLE and Wi-Fi configurations and notes firmware-version differences.

Would that be useful? Is BoardShim.get_board_descr together with the documentation a suitable source, or would you recommend a different maintained source for model-to-interface relationships? I can handle the directory-side work, keep attribution and direct links to BrainFlow, and send a small sample back for correction. There is no need to create a new export for us.

I would also be glad to discuss how this could help people discover open biosensor tools.

Project: https://github.com/opendevicedb/opendevicedb

Best regards,
Sebastien Michea

Written with AI assistance.
