// QCoDeS (microsoft/Qcodes, MIT): instrument drivers for laboratory equipment.
// Driver class names are not a reliable source of product names (base classes,
// aliases, series drivers and channel helpers share the same namespace), so this
// importer uses a reviewed table of concrete driver classes. Every entry is checked
// against the latest release: a missing class or file fails the import, and new
// public driver classes are reported for review instead of being guessed.
// Series and family drivers (DPO5000, RTO1000, DG4000, Infiniium...) are excluded:
// they would need an explicit model list from upstream. A driver class in QCoDeS
// is upstream support, not an OpenDeviceDB hardware test.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { fetchJson, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";

const REPO = "microsoft/Qcodes";
const ROOT = "src/qcodes/instrument_drivers";
const GUIDE = "https://microsoft.github.io/Qcodes/start/index.html";
const DOCS = "https://microsoft.github.io/Qcodes/drivers_api/";

/** Driver directory -> vendor display name and documentation page. */
const VENDORS: Record<string, { vendor: string; docs?: string }> = {
  agilent: { vendor: "Agilent", docs: "Agilent" },
  AimTTi: { vendor: "Aim-TTi", docs: "AimTTi" },
  AlazarTech: { vendor: "AlazarTech", docs: "AlazarTech" },
  american_magnetics: { vendor: "American Magnetics", docs: "American_magnetics" },
  basel: { vendor: "Basel Precision Instruments", docs: "Basel" },
  CopperMountain: { vendor: "Copper Mountain" },
  cryomagnetics: { vendor: "Cryomagnetics", docs: "CryoMagnetics" },
  Galil: { vendor: "Galil", docs: "Galil" },
  HP: { vendor: "HP", docs: "HP" },
  ithaco: { vendor: "Ithaco", docs: "Ithaco" },
  Keithley: { vendor: "Keithley", docs: "Keithley" },
  Keysight: { vendor: "Keysight", docs: "Keysight" },
  Lakeshore: { vendor: "Lake Shore", docs: "Lakeshore" },
  Minicircuits: { vendor: "Mini-Circuits", docs: "Minicircuits" },
  oxford: { vendor: "Oxford Instruments", docs: "Oxford" },
  QDev: { vendor: "QDevil", docs: "QDev" },
  QuantumDesign: { vendor: "Quantum Design", docs: "QuantumDesign" },
  rigol: { vendor: "Rigol", docs: "Rigol" },
  rohde_schwarz: { vendor: "Rohde & Schwarz", docs: "RohdeSchwarz" },
  signal_hound: { vendor: "Signal Hound", docs: "SignalHound" },
  stanford_research: { vendor: "Stanford Research Systems", docs: "SRS" },
  tektronix: { vendor: "Tektronix", docs: "Tektronix" },
  weinschel: { vendor: "Weinschel", docs: "Weinschel" },
  yokogawa: { vendor: "Yokogawa", docs: "Yokogawa" },
};

/** [driver file under ROOT, class, model(s)]. Several models: the driver names each product. */
export const DRIVERS: [string, string, string | string[]][] = [
  ["agilent/Agilent_34401A.py", "Agilent34401A", "34401A"],
  ["agilent/Agilent_34410A.py", "Agilent34410A", "34410A"],
  ["agilent/Agilent_34411A.py", "Agilent34411A", "34411A"],
  ["agilent/Agilent_E8257D.py", "AgilentE8257D", "E8257D"],
  ["agilent/Agilent_E8267C.py", "AgilentE8267C", "E8267C"],
  ["AimTTi/Aim_TTi_PL068_P.py", "AimTTiPL068P", "PL068-P"],
  ["AimTTi/Aim_TTi_PL155_P.py", "AimTTiPL155P", "PL155-P"],
  ["AimTTi/Aim_TTi_PL303_P.py", "AimTTiPL303P", "PL303-P"],
  ["AimTTi/Aim_TTi_PL303QMD_P.py", "AimTTiPL303QMDP", "PL303QMD-P"],
  ["AimTTi/Aim_TTi_PL303QMT_P.py", "AimTTiPL303QMTP", "PL303QMT-P"],
  ["AimTTi/Aim_TTi_PL601_P.py", "AimTTiPL601", "PL601-P"],
  ["AimTTi/Aim_TTi_QL355_TP.py", "AimTTiQL355TP", "QL355TP"],
  ["AlazarTech/ATS9360.py", "AlazarTechATS9360", "ATS9360"],
  ["AlazarTech/ATS9373.py", "AlazarTechATS9373", "ATS9373"],
  ["AlazarTech/ATS9440.py", "AlazarTechATS9440", "ATS9440"],
  ["AlazarTech/ATS9870.py", "AlazarTechATS9870", "ATS9870"],
  ["american_magnetics/AMI430_visa.py", "AMIModel430", "Model 430"],
  ["basel/BaselSP983a.py", "BaselSP983a", "SP983a"],
  ["CopperMountain/_M5065.py", "CopperMountainM5065", "M5065"],
  ["CopperMountain/_M5180.py", "CopperMountainM5180", "M5180"],
  ["cryomagnetics/_cryomagnetics4g.py", "CryomagneticsModel4G", "Model 4G"],
  ["cryomagnetics/_TM620.py", "CryomagneticsModelTM620", "TM-620"],
  ["Galil/dmc_41x3.py", "GalilDMC4133Controller", "DMC-4133"],
  ["HP/HP_8133A.py", "HP8133A", "8133A"],
  ["HP/HP_83650A.py", "HP83650A", "83650A"],
  ["HP/HP_8753D.py", "HP8753D", "8753D"],
  ["ithaco/Ithaco_1211.py", "Ithaco1211", "1211"],
  ["Keithley/Keithley_2000.py", "Keithley2000", "2000"],
  ["Keithley/Keithley_2400.py", "Keithley2400", "2400"],
  ["Keithley/Keithley_2450.py", "Keithley2450", "2450"],
  ["Keithley/Keithley_2601B.py", "Keithley2601B", "2601B"],
  ["Keithley/Keithley_2602A.py", "Keithley2602A", "2602A"],
  ["Keithley/Keithley_2602B.py", "Keithley2602B", "2602B"],
  ["Keithley/Keithley_2604B.py", "Keithley2604B", "2604B"],
  ["Keithley/Keithley_2611B.py", "Keithley2611B", "2611B"],
  ["Keithley/Keithley_2612B.py", "Keithley2612B", "2612B"],
  ["Keithley/Keithley_2614B.py", "Keithley2614B", "2614B"],
  ["Keithley/Keithley_2634B.py", "Keithley2634B", "2634B"],
  ["Keithley/Keithley_2635B.py", "Keithley2635B", "2635B"],
  ["Keithley/Keithley_2636B.py", "Keithley2636B", "2636B"],
  ["Keithley/Keithley_3706A.py", "Keithley3706A", "3706A"],
  ["Keithley/Keithley_6500.py", "Keithley6500", "DMM6500"],
  ["Keithley/Keithley_7510.py", "Keithley7510", "DMM7510"],
  ["Keithley/Keithley_s46.py", "KeithleyS46", "S46"],
  ["Keysight/Keysight_33210a.py", "Keysight33210A", "33210A"],
  ["Keysight/Keysight_33250a.py", "Keysight33250A", "33250A"],
  ["Keysight/Keysight_33510b.py", "Keysight33510B", "33510B"],
  ["Keysight/Keysight_33511b.py", "Keysight33511B", "33511B"],
  ["Keysight/Keysight_33512b.py", "Keysight33512B", "33512B"],
  ["Keysight/Keysight_33521b.py", "Keysight33521B", "33521B"],
  ["Keysight/Keysight_33522b.py", "Keysight33522B", "33522B"],
  ["Keysight/Keysight_33611a.py", "Keysight33611A", "33611A"],
  ["Keysight/Keysight_33612a.py", "Keysight33612A", "33612A"],
  ["Keysight/Keysight_33621a.py", "Keysight33621A", "33621A"],
  ["Keysight/Keysight_33622a.py", "Keysight33622A", "33622A"],
  ["Keysight/Keysight_34410A_submodules.py", "Keysight34410A", "34410A"],
  ["Keysight/Keysight_34411A_submodules.py", "Keysight34411A", "34411A"],
  ["Keysight/Keysight_34460A_submodules.py", "Keysight34460A", "34460A"],
  ["Keysight/Keysight_34461A_submodules.py", "Keysight34461A", "34461A"],
  ["Keysight/Keysight_34465A_submodules.py", "Keysight34465A", "34465A"],
  ["Keysight/Keysight_34470A_submodules.py", "Keysight34470A", "34470A"],
  ["Keysight/keysight_34980a.py", "Keysight34980A", "34980A"],
  ["Keysight/keysightb1500/KeysightB1500_base.py", "KeysightB1500", "B1500"],
  ["Keysight/keysight_b220x.py", "KeysightB2200", "B2200"],
  ["Keysight/keysight_b220x.py", "KeysightB2201", "B2201"],
  ["Keysight/Keysight_B2962A.py", "KeysightB2962A", "B2962A"],
  ["Keysight/keysight_e4980a.py", "KeysightE4980A", "E4980A"],
  ["Keysight/KtMAwg.py", "KeysightM9336A", "M9336A"],
  ["Keysight/Keysight_N5173B.py", "KeysightN5173B", "N5173B"],
  ["Keysight/Keysight_N5183B.py", "KeysightN5183B", "N5183B"],
  ["Keysight/Keysight_N5222B.py", "KeysightN5222B", "N5222B"],
  ["Keysight/Keysight_N5230C.py", "KeysightN5230C", "N5230C"],
  ["Keysight/_Keysight_N5232B.py", "KeysightN5232B", "N5232B"],
  ["Keysight/Keysight_N5245A.py", "KeysightN5245A", "N5245A"],
  ["Keysight/Keysight_N6705B.py", "KeysightN6705B", "N6705B"],
  ["Keysight/Keysight_N9030B.py", "KeysightN9030B", "N9030B"],
  ["Keysight/Keysight_P5002B.py", "KeysightP5002B", "P5002B"],
  ["Keysight/Keysight_P5004B.py", "KeysightP5004B", "P5004B"],
  ["Keysight/Keysight_P9374A.py", "KeysightP9374A", "P9374A"],
  ["Lakeshore/Lakeshore_model_325.py", "LakeshoreModel325", "Model 325"],
  ["Lakeshore/_lakeshore_model_335.py", "LakeshoreModel335", "Model 335"],
  ["Lakeshore/Lakeshore_model_336.py", "LakeshoreModel336", "Model 336"],
  ["Lakeshore/Lakeshore_model_372.py", "LakeshoreModel372", "Model 372"],
  ["Minicircuits/_minicircuits_rudat_13g_90.py", "MiniCircuitsRudat13G90Usb", "RUDAT-13G-90"],
  ["oxford/MercuryiPS_VISA.py", "OxfordMercuryiPS", "Mercury iPS"],
  ["QDev/QDac_channels.py", "QDevQDac", "QDAC"],
  ["QuantumDesign/DynaCoolPPMS/DynaCool.py", "DynaCool", "PPMS DynaCool"],
  ["rigol/Rigol_DG1062.py", "RigolDG1062", "DG1062"],
  ["rigol/Rigol_DP821.py", "RigolDP821", ["DP821", "DP821A"]],
  ["rigol/Rigol_DP831.py", "RigolDP831", ["DP831", "DP831A"]],
  ["rigol/Rigol_DP832.py", "RigolDP832", ["DP832", "DP832A"]],
  ["rigol/Rigol_DS1074Z.py", "RigolDS1074Z", "DS1074Z"],
  ["rohde_schwarz/SGS100A.py", "RohdeSchwarzSGS100A", "SGS100A"],
  ["rohde_schwarz/Rohde_Schwarz_ZNB20.py", "RohdeSchwarzZNB20", "ZNB20"],
  ["rohde_schwarz/Rohde_Schwarz_ZNB8.py", "RohdeSchwarzZNB8", "ZNB8"],
  ["rohde_schwarz/_rohde_schwarz_znle.py", "RohdeSchwarzZNLE14", "ZNLE14"],
  ["rohde_schwarz/_rohde_schwarz_znle.py", "RohdeSchwarzZNLE18", "ZNLE18"],
  ["rohde_schwarz/_rohde_schwarz_znle.py", "RohdeSchwarzZNLE3", "ZNLE3"],
  ["rohde_schwarz/_rohde_schwarz_znle.py", "RohdeSchwarzZNLE4", "ZNLE4"],
  ["rohde_schwarz/_rohde_schwarz_znle.py", "RohdeSchwarzZNLE6", "ZNLE6"],
  ["signal_hound/SignalHound_USB_SA124B.py", "SignalHoundUSBSA124B", "USB-SA124B"],
  ["stanford_research/SG384.py", "SG384", "SG384"],
  ["stanford_research/SR560.py", "SR560", "SR560"],
  ["stanford_research/SR830.py", "SR830", "SR830"],
  ["stanford_research/SR860.py", "SR860", "SR860"],
  ["stanford_research/SR865.py", "SR865", "SR865"],
  ["stanford_research/SR865A.py", "SR865A", "SR865A"],
  ["tektronix/AWG5014.py", "TektronixAWG5014", "AWG5014"],
  ["tektronix/AWG5208.py", "TektronixAWG5208", "AWG5208"],
  ["tektronix/Tektronix_70001A.py", "TektronixAWG70001A", "AWG70001A"],
  ["tektronix/Tektronix_70001B.py", "TektronixAWG70001B", "AWG70001B"],
  ["tektronix/AWG70002A.py", "TektronixAWG70002A", "AWG70002A"],
  ["tektronix/Tektronix_70002B.py", "TektronixAWG70002B", "AWG70002B"],
  ["tektronix/TPS2012.py", "TektronixTPS2012", "TPS2012"],
  ["weinschel/Weinschel_8320.py", "Weinschel8320", "8320"],
  ["yokogawa/Yokogawa_GS200.py", "YokogawaGS200", "GS200"],
];

/**
 * Public classes deliberately left out: base classes, aliases, series/family
 * drivers, composite or lab-built instruments. Listed so new upstream classes
 * stand out in the review report.
 */
export const EXCLUDED = new Set([
  "AcquisitionController", "DemodulationAcquisitionController", "AlazarTechATS", "Agilent344xxA", "AimTTi",
  "AMIModel4303D", "BaselSP983", "BaselSP983c", "CopperMountainM5xxx", "GalilMotionController", "HarvardDecadac",
  "Keithley2600", "Keysight33xxx", "Keysight33xxxDualChannels", "Keysight33xxxSingleChannel", "Keysight344xxA",
  "KeysightB220X", "KeysightInfiniium", "KeysightM960x", "KeysightN51x1", "KeysightPNABase", "KeysightPNAxBase",
  "LakeshoreBase", "MiniCircuitsHIDMixin", "MiniCircuitsRCSP4T", "MiniCircuitsRCSPDT", "MiniCircuitsRudat13G90Base",
  "MiniCircuitsSPDTBase", "MiniCircuitsUsbSPDT", "OxfordTriton", "QDac", "RTO1000", "RigolDG4000", "RigolDP8xxBase",
  "RigolDS4000", "RohdeSchwarzRTO1000", "RohdeSchwarzZNBBase", "SR86x", "Stahl", "TPS2012", "TektronixAWG70000Base",
  "TektronixDPO5000", "TektronixDPO7000", "TektronixDPO70000", "TektronixDPO7000xx", "TektronixDSA70000",
  "TektronixMSO5000", "TektronixMSO70000",
]);

export interface Driver { dir: string; file: string; cls: string; vendor: string; model: string }

export function drivers(table = DRIVERS): Driver[] {
  return table.flatMap(([file, cls, models]) => {
    const dir = file.split("/")[0];
    const v = VENDORS[dir];
    if (!v) throw new Error(`qcodes: no vendor for driver directory ${dir}`);
    return [models].flat().map((model) => ({ dir, file, cls, vendor: v.vendor, model }));
  });
}

/** Top-level class names defined in a Python module. */
export const pythonClasses = (src: string): string[] => [...src.matchAll(/^class\s+(\w+)\s*[(:]/gm)].map((m) => m[1]);

/** Public top-level classes whose bases name an instrument class (heuristic, for the review report only). */
export const instrumentClasses = (src: string): string[] =>
  [...src.matchAll(/^class\s+([A-Za-z]\w*)\s*\(([^)]*)\)/gm)].filter((m) => /Instrument\b|VisaInstrument|IPInstrument/.test(m[2]) && !/Channel|Module|Submodule/.test(m[2])).map((m) => m[1]);

const known = new Set(DRIVERS.map((d) => d[1]));

export function fromDrivers(items: Driver[], version: string, date = today()): DeviceRecord[] {
  return items.map((d) => {
    const docs = VENDORS[d.dir].docs;
    const twins = items.filter((o) => o.cls === d.cls && o.model !== d.model).map((o) => o.model);
    return {
      id: makeId(d.vendor, d.model), vendor: d.vendor, model: d.model,
      category: "test-instrument", status: "controllable",
      summary: `Remote control and data acquisition from Python with the QCoDeS ${d.cls} driver (${version}).${twins.length ? ` The same driver class also covers the ${twins.join(", ")}.` : ""} Available features depend on the driver, the instrument's options and firmware; this is not an OpenDeviceDB hardware test.`,
      projects: [{
        name: `QCoDeS (${d.cls})`, url: `https://github.com/${REPO}/blob/${version}/${ROOT}/${d.file}`, kind: "driver", license: "MIT",
        freedom: { notes: "The open driver talks to the instrument's existing firmware over its remote interface (typically VISA: GPIB, USB, LAN or serial). It does not replace or establish the license of the instrument firmware." },
      }],
      install: [{
        project: `QCoDeS (${d.cls})`, method: "host-software", guide: docs ? `${DOCS}${docs}.html` : `${DOCS}index.html`, difficulty: "medium",
        notes: "Install QCoDeS (pip install qcodes) and a VISA backend where the driver uses VISA, then instantiate the driver class with the instrument's resource address. Check the driver documentation for required instrument options and firmware.",
      }],
      provenance: { sources: ["qcodes"] }, updated: date,
    } satisfies DeviceRecord;
  });
}

const source: Source = {
  source: "qcodes", name: "QCoDeS instrument drivers", url: "https://github.com/microsoft/Qcodes", license: "MIT",
  async fetch() {
    const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    const version: string = release.tag_name;
    const items = drivers();
    const files = [...new Set(items.map((d) => d.file))];
    const defined = new Map(await mapLimit(files, 6, async (f) => [f, pythonClasses(await githubRaw(REPO, version, `${ROOT}/${f}`))] as const));
    const missing = items.filter((d) => !defined.get(d.file)!.includes(d.cls));
    if (missing.length) throw new Error(`qcodes ${version}: driver classes not found: ${missing.map((d) => `${d.file}:${d.cls}`).join(", ")}`);
    // Review report: instrument classes in driver files this table does not reference.
    const others = (await githubFiles(REPO, version)).filter((p) => p.startsWith(`${ROOT}/`) && p.endsWith(".py") && !files.includes(p.slice(ROOT.length + 1)) && !/\/(mock_instruments|zurich_instruments)\//.test(p));
    const unreviewed = (await mapLimit(others, 6, async (p) => instrumentClasses(await githubRaw(REPO, version, p)).map((c) => `${p.slice(ROOT.length + 1)}:${c}`)))
      .flat().filter((c) => !EXCLUDED.has(c.split(":")[1]) && !known.has(c.split(":")[1]));
    if (unreviewed.length) console.error(`qcodes ${version}: unreviewed driver classes (not imported): ${unreviewed.join(", ")}`);
    console.error(`qcodes ${version}: ${items.length} records from ${new Set(items.map((d) => d.cls)).size} driver classes`);
    return fromDrivers(items, version);
  },
};
export default source;
