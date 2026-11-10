// The only execution path for contributed scalar WASM. The host can terminate this
// worker if code loops; no contributor JavaScript is loaded into this worker.
import { inspectWasm } from "@opendevicedb/components/browser";
let processValue: ((value: number, factor: number) => number) | undefined;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      inspectWasm(new Uint8Array(data.bytes), data.entry);
      const result = await WebAssembly.instantiate(data.bytes, {});
      processValue = result.instance.exports[data.entry] as typeof processValue;
      self.postMessage({ id: data.id, ok: true });
    } else if (data.type === "process" && processValue) {
      const value = processValue(data.value, data.factor);
      if (!Number.isFinite(value)) throw Error("The module returned a non-finite value");
      self.postMessage({ id: data.id, ok: true, value });
    } else throw Error("Invalid scalar worker message");
  } catch (e) { self.postMessage({ id: data.id, ok: false, error: (e as Error).message }); }
};
