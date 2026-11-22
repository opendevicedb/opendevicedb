import {join} from "node:path";
import {standaloneHtml} from "../../../../../apps/uc5-2s/render.mjs";
declare const __ODB_ROOT__: string;

export function GET() {
  return new Response(standaloneHtml(join(__ODB_ROOT__, "apps/uc5-2s")), {
    headers: {"Content-Type": "text/html; charset=utf-8"},
  });
}
