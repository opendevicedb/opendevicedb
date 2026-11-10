# PyMeasure — follow-up

- Published: 2026-11-10T12:42:36Z
- Channel: GitHub discussion reply
- Public post: https://github.com/pymeasure/pymeasure/discussions/1587#discussioncomment-19518744
- Verification: public author and exact body read back.
- Summary: Five-instrument sample from PyMeasure v0.16.0 with three questions (series drivers, connections, test types).

---

As promised, here is a small sample of what PyMeasure records would look like, for corrections before I go further. None of these instruments has a record in OpenDeviceDB yet.

Source: PyMeasure **v0.16.0** (MIT). Driver links point to that tag, documentation links to `stable`.

| Proposed record | Driver class (v0.16.0) | Docs | Connection shown in the driver | Tests in the repo |
| --- | --- | --- | --- | --- |
| Keithley 2400 SourceMeter | [`Keithley2400`](https://github.com/pymeasure/pymeasure/blob/v0.16.0/pymeasure/instruments/keithley/keithley2400.py) | [page](https://pymeasure.readthedocs.io/en/stable/api/instruments/keithley/keithley2400.html) | GPIB (example) | protocol tests + with-device tests |
| HP / Agilent / Keysight 34401A multimeter | [`HP34401A`](https://github.com/pymeasure/pymeasure/blob/v0.16.0/pymeasure/instruments/hp/hp34401A.py) | [page](https://pymeasure.readthedocs.io/en/stable/api/instruments/hp/hp34401A.html) | GPIB (example), serial settings | protocol tests + with-device tests |
| Stanford Research Systems SR830 lock-in amplifier | [`SR830`](https://github.com/pymeasure/pymeasure/blob/v0.16.0/pymeasure/instruments/srs/sr830.py) | [page](https://pymeasure.readthedocs.io/en/stable/api/instruments/srs/sr830.html) | not stated | protocol tests |
| Rigol DG800 series waveform generator | [`DG800`](https://github.com/pymeasure/pymeasure/blob/v0.16.0/pymeasure/instruments/rigol/rigol_dg800.py) | [page](https://pymeasure.readthedocs.io/en/stable/api/instruments/rigol/rigol_dg800.html) | not stated | protocol tests |
| Thorlabs PM100USB power meter | [`ThorlabsPM100USB`](https://github.com/pymeasure/pymeasure/blob/v0.16.0/pymeasure/instruments/thorlabs/thorlabspm100usb.py) | [page](https://pymeasure.readthedocs.io/en/stable/api/instruments/thorlabs/thorlabspm100usb.html) | USB (in the model name) | none found |

Each record would say "a PyMeasure driver is available, maintained by people who use the instrument", link the class and its documentation, and state whether repository tests exist, without claiming we tested the instrument. Instruments are found by manufacturer and model; a VISA resource string never becomes an identifier.

Three points I'm unsure about:

1. **Series drivers.** `DG800` covers a series. Should we keep one series record, or list individual models (DG811, DG812, DG821, DG822…) only where your docs name them?
2. **Connections.** Most drivers don't say which interface they were used with. Should we leave that out, or take it from the manufacturer's documentation and label it as such?
3. **Tests.** Is "protocol tests" versus "with-device tests" a fair way to describe `test_*.py` versus `test_*_with_device.py`?

Written with AI assistance.
