// SPDX-License-Identifier: AGPL-3.0-or-later
import { WASI, File as WasiFile, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
export interface ProbeResources {format:"odb-probe-resources/1";profile:"convex-01";configuration:Record<string,unknown>;files:Record<string,{base64:string;sha256:string}>}
export async function validateResources(value:unknown):Promise<ProbeResources>{
 const v=value as ProbeResources;
 if(v?.format!=="odb-probe-resources/1"||v.profile!=="convex-01"||!v.configuration||!v.files||typeof v.files!=="object"||Array.isArray(v.files))throw Error("Choose a convex probe resource bundle");
 let total=0;const entries=Object.entries(v.files);if(entries.length<1||entries.length>512)throw Error("Resource file count exceeded");
 for(const [path,file] of entries){
  if(!/^(assets|hv|sri|maps)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(path)||typeof file?.base64!=="string"||!/^[a-f0-9]{64}$/.test(file.sha256)||file.base64.length>5592408)throw Error("Invalid resource entry");
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));total+=bytes.length;if(bytes.length>4194304||total>16777216)throw Error("Resource byte limit exceeded");
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n=>n.toString(16).padStart(2,"0")).join("");if(digest!==file.sha256)throw Error(`Resource integrity failed: ${path}`);
 }
 return v;
}
export async function createProbeDecoder(bytes:BufferSource,resources?:ProbeResources,options:{purpose?:"acquisition"|"reconstruction";continuous?:boolean}={}){
 // The same Rust Session receives owned byte arrays on Linux and in WASM.
 // No preopened WASI directory, mounted resources, network or host filesystem.
 const files=resources?Object.fromEntries(Object.entries(resources.files).map(([name,file])=>[name,[...Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0))]])):undefined;
 const wasi=new WASI([],[],[new OpenFile(new WasiFile([])),ConsoleStdout.lineBuffered(()=>{}),ConsoleStdout.lineBuffered(()=>{})],{debug:false});
 const module=await WebAssembly.compile(bytes);const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});wasi.initialize(instance as any);
 const e=instance.exports as any;
 function call(operation:number,input:Uint8Array){
  const pointer=e.odb_alloc(input.length);if(!pointer)throw Error("Decoder input allocation failed");
  try{
   new Uint8Array(e.memory.buffer,pointer,input.length).set(input);const status=e.odb_call(operation,pointer,input.length);
   const length=e.odb_output_len();if(length>16777216)throw Error("Decoder output bound exceeded");const result=new Uint8Array(e.memory.buffer,e.odb_output_ptr(),length).slice();
   if(status!==0)throw Error(new TextDecoder().decode(result));return result;
  }finally{e.odb_free(pointer,input.length);}
 }
 const json=(operation:number,input:Uint8Array)=>JSON.parse(new TextDecoder().decode(call(operation,input)));
 if(resources&&options.continuous)throw Error("Continuous mode requires an explicitly advertised built-in runtime");
 let initialized;
 if(resources)initialized=json(6,new TextEncoder().encode(JSON.stringify({...resources.configuration,files})));
 else {
  if(typeof e.odb_builtin_profile!=="function"||e.odb_builtin_profile()!==1)throw Error("This decoder requires an explicitly supplied profile");
  if(options.continuous&&e.odb_live_api?.()!==1)throw Error("This decoder does not support continuous display");
  initialized=json(options.continuous?8:7,new TextEncoder().encode(JSON.stringify(options.purpose?{purpose:options.purpose}:{})));
 }
 const frames=(operation:number,input:Uint8Array)=>{
  const result=call(operation,input),view=new DataView(result.buffer);if(result.length<4)throw Error("Invalid decoder frame batch");const count=view.getUint32(0,true);if(count>64)throw Error("Frame batch limit exceeded");
  const frames:{sequence:number;data:ArrayBuffer}[]=[];let offset=4;
  for(let n=0;n<count;n++){if(offset+8>result.length)throw Error("Truncated frame batch");const sequence=view.getUint32(offset,true),length=view.getUint32(offset+4,true);offset+=8;if(length>8388608||offset+length>result.length)throw Error("Invalid PNG length");frames.push({sequence,data:result.slice(offset,offset+length).buffer});offset+=length;}
  if(offset!==result.length)throw Error("Trailing frame batch bytes");return frames;
 };
 return{initialized,decodeMessage:(data:Uint8Array)=>json(3,data),bind:(data:Uint8Array)=>json(4,data),push:(data:Uint8Array)=>frames(2,data),finish:()=>frames(5,new Uint8Array()),
  encodePng:(data:Uint8Array)=>{if(e.odb_live_api?.()!==1)throw Error("PNG encoding unsupported");return call(11,data);},
  advance:(data:Uint8Array)=>{if(e.odb_live_api?.()!==1)throw Error("Continuous advance unsupported");return frames(12,data);},
  pushRgba:(data:Uint8Array)=>{if(e.odb_live_api?.()!==1)throw Error("RGBA streaming unsupported");return frames(9,data);},
  finishRgba:()=>{if(e.odb_live_api?.()!==1)throw Error("RGBA streaming unsupported");return frames(10,new Uint8Array());},memory:e.memory as WebAssembly.Memory};
}
