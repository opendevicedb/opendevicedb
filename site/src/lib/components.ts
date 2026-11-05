import { loadRegistry, type Registry } from "@opendevicedb/components";
import { ROOT } from "./data.ts";
let cached: Registry | undefined;
export const componentRegistry = () => cached ??= loadRegistry(ROOT);
