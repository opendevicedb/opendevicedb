# QCoDeS

- Published: 2026-11-10T20:03:11Z
- Channel: GitHub Discussions / Show and tell
- Public post: https://github.com/microsoft/Qcodes/discussions/8750
- Title: Making QCoDeS drivers findable by instrument model (sample for corrections)
- Channel source: https://github.com/microsoft/Qcodes/blob/main/CONTRIBUTING.rst (help and discussion route: GitHub Discussions)
- Verification: author, category, title and exact body read back.

---

Hi, I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an [open-source catalogue](https://github.com/opendevicedb/opendevicedb) that links device models to the open drivers, firmware and tools that already support them. PyMeasure maintainers pointed me to the [Python lab automation landscape](https://pymeasure.github.io/python-lab-automation-landscape/catalog/), and QCoDeS stood out for its clean one-class-per-model driver layout.

I've prepared an importer that would let someone looking up, say, a Keithley 2450 or a Rohde & Schwarz ZNB20 find the QCoDeS driver class and its documentation. It is a [draft PR](https://github.com/opendevicedb/opendevicedb/pull/41), not merged, and I'd like your corrections first.

How it works:

- a reviewed table of 116 concrete driver classes from v0.62.0, each checked against the release; product names are written by hand rather than derived from class names;
- each record links the driver file at the release tag and your vendor page in the driver docs, says "driver available in QCoDeS", and never claims we tested the instrument;
- left out: base classes, aliases, series drivers (DPO5000/MSO5000, RTO1000, DG4000, DS4000, Infiniium, N51x1), the AMI 430 3D composite and lab-built instruments. QCoDeS-contrib is not included yet.

A few sample records:

| Record | Driver class |
| --- | --- |
| Keithley 2450 | [`Keithley2450`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/Keithley/Keithley_2450.py) |
| Keithley DMM6500 | [`Keithley6500`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/Keithley/Keithley_6500.py) |
| Keysight 34465A | [`Keysight34465A`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/Keysight/Keysight_34465A_submodules.py) |
| Rohde & Schwarz ZNB20 | [`RohdeSchwarzZNB20`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/rohde_schwarz/Rohde_Schwarz_ZNB20.py) |
| Stanford Research Systems SR860 | [`SR860`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/stanford_research/SR860.py) |
| Rigol DP832 and DP832A (two records) | [`RigolDP832`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/rigol/Rigol_DP832.py) |
| Lake Shore Model 372 | [`LakeshoreModel372`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/Lakeshore/Lakeshore_model_372.py) |
| Quantum Design PPMS DynaCool | [`DynaCool`](https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/QuantumDesign/DynaCoolPPMS/DynaCool.py) |

Questions:

1. **Agilent and Keysight duplicates.** `Agilent34410A` and `Keysight34410A` both exist. Should we treat them as one instrument (the Keysight-branded 34410A) or keep both names?
2. **Series drivers.** For the Tektronix DPO/MSO and R&S RTO1000 drivers, is there an authoritative list of the models each one is meant for? Without one, we leave them out rather than guess.
3. **The DP8xx "(A)" models.** The docstrings say "DP832(A)". Is it right to list both DP832 and DP832A as supported?

Thanks for QCoDeS. Written with AI assistance.
