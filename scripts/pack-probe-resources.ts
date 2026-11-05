// SPDX-License-Identifier: AGPL-3.0-or-later
// Local preparation only. The resulting bundle must never enter the public repository.
import { readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
const args = process.argv.slice(2), options: Record<string,string> = {};
for(let i=0;i<args.length;i+=2){if(!["--assets","--hv","--sri","--maps","--settings","--selection","--parameters","--grouping","--output"].includes(args[i])||!args[i+1]||options[args[i]])throw Error("Supply assets, hv, sri, maps, settings, selection, parameters, grouping and an output outside the repository");options[args[i]]=args[i+1];}
for(const key of ["assets","hv","sri","maps","settings","selection","parameters","grouping","output"])if(!options[`--${key}`])throw Error(`Missing --${key}`);
const repository=resolve(import.meta.dirname,".."), output=resolve(options["--output"]);
if(!relative(repository,output).startsWith(".."))throw Error("Keep private resource bundles outside the public repository");
const files: Record<string,{base64:string;sha256:string}>={};let total=0;
for(const group of ["assets","hv","sri","maps"]){
 const dir=options[`--${group}`]; let count=0;
 for(const name of readdirSync(dir).sort()){
  if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error("Unexpected resource filename");
  const path=join(dir,name);if(!lstatSync(path).isFile())throw Error("Only regular files are accepted");
  const bytes=readFileSync(path);total+=bytes.length;if(++count>128||bytes.length>4*1024*1024||total>16*1024*1024)throw Error("Resource size limit exceeded");
  files[`${group}/${name}`]={base64:bytes.toString("base64"),sha256:createHash("sha256").update(bytes).digest("hex")};
 }
}
const configuration=Object.fromEntries(["settings","selection","parameters","grouping"].map(key=>{const raw=readFileSync(options[`--${key}`]);if(raw.length>32768)throw Error("Configuration too large");return[key,JSON.parse(raw.toString("utf8"))];}));
writeFileSync(output,JSON.stringify({format:"odb-probe-resources/1",profile:"convex-01",configuration,files}),{flag:"wx",mode:0o600});
console.log(`Prepared private browser resource bundle (${Object.keys(files).length} files). Keep it local: ${output}`);
