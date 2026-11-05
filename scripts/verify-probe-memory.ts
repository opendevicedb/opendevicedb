// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline comparison only. Mock transport records bytes; it never opens a USB device.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {WASI,File as WasiFile,OpenFile,Directory,PreopenDirectory,ConsoleStdout} from '@bjorn3/browser_wasi_shim';
import {createProbeDecoder,validateResources} from '../packages/components/src/probe/decoder.ts';
import {ProbeUsbCapture} from '../components/ultrasound/usb-capture/1.0.0/source.ts';
const [bundlePath,capturePath,referencePath,oldWasmPath,outputPath,inventoryPath]=process.argv.slice(2);
if(!outputPath||!inventoryPath)throw Error('Usage: verify-probe-memory.ts PRIVATE.odb-probe archived-capture reference-reconstruction old-decoder.wasm PRIVATE-output PRIVATE-inventory.json');
const root=resolve(import.meta.dirname,'..'), output=resolve(outputPath);
if(!relative(root,output).startsWith('..'))throw Error('Keep input-derived verification artifacts outside the public repository');
mkdirSync(output,{recursive:false});
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const save=(name:string,v:unknown)=>writeFileSync(join(output,name),JSON.stringify(v,null,2)+'\n');
const inventory=JSON.parse(readFileSync(inventoryPath,'utf8')).resources;
const bundle=await validateResources(JSON.parse(readFileSync(bundlePath,'utf8')));
const files=Object.fromEntries(inventory.map((r:any)=>{const bytes=Buffer.from(bundle.files[r.file].base64,'base64');if(bytes.length!==r.bytes||hash(bytes)!==r.sha256)throw Error(`Reference mismatch: ${r.file}`);return[r.file,[...bytes]];}));
const configuration=bundle.configuration;
const input={...configuration,files};
const grayFiles=Object.fromEntries(Object.entries(files).filter(([n])=>!n.startsWith('maps/')));
const reconstructionFiles=Object.fromEntries(Object.entries(files).filter(([n])=>inventory.find((r:any)=>r.file===n)?.reconstruction&&!n.startsWith('maps/')));
const gray={...configuration,display_palette:'linear-gray-v1',files:grayFiles};
const reconstruction={...configuration,display_palette:'linear-gray-v1',purpose:'reconstruction',files:reconstructionFiles};delete (reconstruction as any).selection;
save('reference-input.json',input);save('gray-input.json',gray);save('reconstruction-input.json',reconstruction);
const native=join(root,'components/ultrasound/convex-decoder/1.0.0/target/release/examples/replay_memory');
const data=join(capturePath,'receive/data'), bootstrap=readFileSync(join(capturePath,'bootstrap/00001.bin'));
for(const [mode,args] of [['reference',[join(output,'reference-input.json'),data,join(output,'native-reference'),join(capturePath,'bootstrap/00001.bin')]],['reconstruction',[join(output,'reconstruction-input.json'),data,join(output,'native-gray')]]] as const){
 process.stdout.write(`native ${mode}: `);console.log(execFileSync(native,args as unknown as string[],{encoding:'utf8'}).trim());
}
const wasmBytes=readFileSync(join(root,'components/ultrasound/convex-decoder/1.0.0/decoder.wasm'));
const oldBytes=readFileSync(oldWasmPath);
async function oldDecoder(){
 const dirs=new Map(['assets','hv','sri','maps'].map(g=>[g,new Map<string,WasiFile>()]));
 for(const [path,bytes] of Object.entries(files)){const [group,name]=path.split('/');dirs.get(group)!.set(name,new WasiFile(bytes as number[],{readonly:true}));}
 const wasi=new WASI([],[],[new OpenFile(new WasiFile([])),ConsoleStdout.lineBuffered(()=>{}),ConsoleStdout.lineBuffered(()=>{}),new PreopenDirectory('/',new Map([...dirs].map(([n,v])=>[n,new Directory(v)])))],{debug:false});
 const instance=await WebAssembly.instantiate(await WebAssembly.compile(oldBytes),{wasi_snapshot_preview1:wasi.wasiImport});wasi.initialize(instance as any);const e=instance.exports as any;
 const call=(op:number,bytes:Uint8Array)=>{const p=e.odb_alloc(bytes.length);if(!p)throw Error('Reference allocation failed');try{new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);const status=e.odb_call(op,p,bytes.length);const v=new Uint8Array(e.memory.buffer,e.odb_output_ptr(),e.odb_output_len()).slice();if(status)throw Error(new TextDecoder().decode(v));return v;}finally{e.odb_free(p,bytes.length);}};
 const json=(op:number,b:Uint8Array)=>JSON.parse(new TextDecoder().decode(call(op,b)));
 json(1,new TextEncoder().encode(JSON.stringify(configuration)));
 const frames=(op:number,b:Uint8Array)=>{const raw=call(op,b),v=new DataView(raw.buffer),result=[];let p=4;for(let i=0;i<v.getUint32(0,true);i++){const sequence=v.getUint32(p,true),n=v.getUint32(p+4,true);p+=8;result.push({sequence,data:raw.slice(p,p+n).buffer});p+=n;}if(p!==raw.length)throw Error('Bad reference batch');return result;};
 return{decodeMessage:(b:Uint8Array)=>json(3,b),bind:(b:Uint8Array)=>json(4,b),push:(b:Uint8Array)=>frames(2,b),finish:()=>frames(5,new Uint8Array())};
}
function pack(v:any){return {...bundle,configuration:Object.fromEntries(Object.entries(v).filter(([n])=>n!=='files')),files:Object.fromEntries(Object.entries(v.files).map(([name,bytes])=>{const b=Buffer.from(bytes as number[]);return[name,{base64:b.toString('base64'),sha256:hash(b)}];}))};}
async function plannedWrites(decoder:any){
 const writes:Buffer[]=[], pending:((r:any)=>void)[]=[];let first=true;let capture:ProbeUsbCapture;
 const endpoints=[...[1,6,8].map(endpointNumber=>({endpointNumber,direction:'in'})),{endpointNumber:2,direction:'out'}];
 const device={vendorId:0x04b4,productId:0x4611,configuration:{interfaces:[{interfaceNumber:0,alternate:{alternateSetting:0},alternates:[{alternateSetting:0,endpoints}]}]},
 open:async()=>{},claimInterface:async()=>{},close:async()=>{for(const done of pending.splice(0))done({status:'ok',data:new DataView(new ArrayBuffer(0))});},
 controlTransferIn:async(s:any)=>{const b=s.request===0xa9?Uint8Array.from([...new TextEncoder().encode('C0061435UC5-2S#\0'),...new Uint8Array(16).fill(255)]):new Uint8Array(8);return {status:'ok',data:new DataView(b.buffer)};},
 controlTransferOut:async(_s:any,b:Uint8Array)=>{writes.push(Buffer.from(b));return{status:'ok',bytesWritten:b.length};},
 transferOut:async(_ep:number,b:Uint8Array)=>{writes.push(Buffer.from(b));return{status:'ok',bytesWritten:b.length};},
 transferIn:async(ep:number)=>{if(ep===8&&first){first=false;return{status:'ok',data:new DataView(bootstrap.buffer,bootstrap.byteOffset,bootstrap.byteLength)};}return new Promise(r=>pending.push(r));}};
 capture=new ProbeUsbCapture({device,planner:decoder,seconds:1,phantomReady:true,onBytes:()=>{},onState:s=>{if(s==='Capturing from USB')setTimeout(()=>void capture.stop(),0);}});
 await capture.start();await capture.done;return writes;
}
const commandManifest=JSON.parse(readFileSync(join(capturePath,'commands/manifest.json'),'utf8'));
const expectedCommands=commandManifest.operations.filter((o:any)=>o.state==='write_completed_unacknowledged');
const nativeCommands=JSON.parse(readFileSync(join(output,'native-reference/commands.json'),'utf8')).packets;
for(const packet of nativeCommands){const row=expectedCommands.find((o:any)=>o.producer===packet.name);if(!row||hash(Buffer.from(packet.bytes))!==row.sha256)throw Error(`Native packet changed: ${packet.name}`);}
const readManifest=JSON.parse(readFileSync(join(data,'manifest.json'),'utf8'));
const referenceManifest=JSON.parse(readFileSync(join(referencePath,'manifest.json'),'utf8'));
const referenceFrames=referenceManifest.groups.filter((g:any)=>g.publish_candidate).map((g:any)=>readFileSync(join(referencePath,g.directory,'preview.png')));
function rgba(b:Uint8Array){const bytes=Buffer.from(b),parts=[];let width=0,height=0;for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);if(type==='IHDR'){width=bytes.readUInt32BE(p+8);height=bytes.readUInt32BE(p+12);}if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));p+=n+12;}const raw=inflateSync(Buffer.concat(parts)),rows=[];if(raw.length!==(width*4+1)*height)throw Error('PNG dimensions mismatch');for(let y=0;y<height;y++){const off=y*(width*4+1);if(raw[off]!==0)throw Error('Fixture uses unsupported PNG filtering');rows.push(raw.subarray(off+1,off+1+width*4));}return Buffer.concat(rows);}
function compare(a:Uint8Array[],b:Uint8Array[]){if(a.length!==b.length)throw Error(`Frame count changed ${a.length}/${b.length}`);return a.map((bytes,i)=>{const x=rgba(bytes),y=rgba(b[i]);if(x.length!==y.length)throw Error('Pixel length changed');let changed=0,max=0,sum=0,squares=0;for(let j=0;j<x.length;j++){const d=Math.abs(x[j]-y[j]);if(d)changed++;max=Math.max(max,d);sum+=d;squares+=d*d;}return{sequence:i+1,identical_png:Buffer.from(bytes).equals(Buffer.from(b[i])),sha256:hash(bytes),different_channels:changed,max_channel_difference:max,mean_absolute_difference:sum/x.length,rmse:Math.sqrt(squares/x.length)};});}
const nativeReference=JSON.parse(readFileSync(join(output,'native-reference/images.json'),'utf8')).map((f:any)=>readFileSync(join(output,'native-reference',f.file)));
const nativeGray=JSON.parse(readFileSync(join(output,'native-gray/images.json'),'utf8')).map((f:any)=>readFileSync(join(output,'native-gray',f.file)));
const runs:Record<string,Uint8Array[]>={};const commands:any={};
for(const [name,decoder] of [['old-reference',await oldDecoder()],['memory-reference',await createProbeDecoder(wasmBytes,pack(input))],['memory-gray',await createProbeDecoder(wasmBytes,pack(gray))]] as const){
 console.log(`WASM ${name}`);const writes=await plannedWrites(decoder);
 if(writes.length!==expectedCommands.length||writes.some((b,i)=>hash(b)!==expectedCommands[i].sha256))throw Error(`Command bytes changed: ${name}`);
 commands[name]={count:writes.length,all_match_archived:true,sha256:writes.map(hash)};
 const frames:any[]=[];for(const row of readManifest.reads)frames.push(...decoder.push(readFileSync(join(data,row.raw_file))));frames.push(...decoder.finish());
 mkdirSync(join(output,name));runs[name]=frames.map(f=>Buffer.from(f.data));for(let i=0;i<frames.length;i++)writeFileSync(join(output,name,`${String(i+1).padStart(6,'0')}.png`),runs[name][i]);
 if(frames.length!==referenceFrames.length)throw Error(`Lost frames: ${name}`);
}
const comparisons={native_memory_vs_original_native:compare(nativeReference,referenceFrames),wasm_memory_vs_original_wasm:compare(runs['memory-reference'],runs['old-reference']),wasm_vs_native_reference:compare(runs['memory-reference'],nativeReference),original_wasm_vs_original_native:compare(runs['old-reference'],referenceFrames),native_gray_vs_reference:compare(nativeGray,nativeReference),wasm_gray_vs_native_gray:compare(runs['memory-gray'],nativeGray)};
for(const key of ['native_memory_vs_original_native','wasm_memory_vs_original_wasm'] as const)if(comparisons[key].some(r=>!r.identical_png))throw Error(`Reference regression: ${key}`);
// Reference identity is enforced per target above. Historical cross-target errors
// can reach two levels on the longer capture; they must not be called new regressions.
if(comparisons.wasm_gray_vs_native_gray.some(r=>r.max_channel_difference>1))throw Error('Original grayscale cross-target difference >1');
const negativeCases:[string,any,RegExp][]=[
 ['missing-hv',{...input,files:Object.fromEntries(Object.entries(files).filter(([n])=>n!=='hv/0.coe'))},/Missing resource/],
 ['missing-filter',{...input,files:Object.fromEntries(Object.entries(files).filter(([n])=>n!=='assets/B_LPF.bin'))},/Missing resource/],
 ['missing-reference-maps',{...input,files:grayFiles},/Missing resource/],
 ['bad-hv',{...input,files:{...files,'hv/0.coe':[0]}},/requires exactly|hash mismatch/],
 ['foreign-smoothing',{...input,files:{...files,'assets/B_Smooth.bin':[]}},/B_Smooth/],
 ['foreign-correlation',{...input,files:{...files,'assets/B_Persist.bin':[]}},/B_Persist/],
 ['unknown-palette',{...input,display_palette:'invented'},/Unknown display palette/],
 ['incompatible-tint',{...gray,settings:{...(configuration.settings as any),dsc:{...(configuration.settings as any).dsc,tint_map:1}}},/requires gray0/],
];
const refusals:string[]=[];
for(const [name,value,expected] of negativeCases){let refused=false;try{await createProbeDecoder(wasmBytes,pack(value));}catch(e){if(!expected.test(String(e)))throw e;refused=true;}if(!refused)throw Error(`Accepted invalid inputs: ${name}`);refusals.push(name);}
const offline=await createProbeDecoder(wasmBytes,pack(reconstruction));
let refused=false;try{offline.bind(bootstrap);}catch(e){if(!String(e).includes('can only be bound'))throw e;refused=true;}if(!refused)throw Error('Reconstruction-only session produced commands');refusals.push('reconstruction-cannot-bind');
const result={schema:'convex-autonomy-verification-v1',physical_acquisitions:0,transport:'in-memory mock only',refusals,frames:referenceFrames.length,native_configuration_packets:nativeCommands.length,commands,resource_counts:{reference:24,acquisition_linear_gray:22,reconstruction_linear_gray:13},wasm_sha256:hash(wasmBytes),original_wasm_sha256:hash(oldBytes),cross_target_reference_policy:'must preserve each target baseline; no assumed one-level historical bound',capture_manifest_sha256:hash(readFileSync(join(data,'manifest.json'))),comparisons};
save('verification.json',result);console.log(JSON.stringify({frames:result.frames,commands:expectedCommands.length,reference_native_exact:true,reference_wasm_exact:true,maximum_cross_target:Math.max(...comparisons.wasm_vs_native_reference.map(r=>r.max_channel_difference)),gray_maximum_difference:Math.max(...comparisons.native_gray_vs_reference.map(r=>r.max_channel_difference))}));
