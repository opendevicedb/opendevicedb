import {join} from "node:path";
import {standaloneHtml} from "../../../../../apps/ul10-5e/render.mjs";
declare const __ODB_ROOT__: string;

export function GET() {
  return new Response(standaloneHtml(join(__ODB_ROOT__, "apps/ul10-5e")), {
    headers: {"Content-Type": "text/html; charset=utf-8"},
  });
}
