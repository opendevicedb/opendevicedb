import{test}from"node:test";import assert from"node:assert/strict";
import{readFileSync}from"node:fs";import{loadRegistry,inspectComponent,COMPONENT_REPO_ROOT,repositoryFile}from"../src/index.ts";
import{inspectProbeWasm}from"../src/browser.ts";import{validateResources,createProbeDecoder}from"../src/probe/decoder.ts";
import{ProbeCaptureSession}from"../src/probe-session.ts";
const registry=loadRegistry(),component=registry.components.find(c=>c.id==="ultrasound/convex-decoder")!;
const bytes=readFileSync(repositoryFile(COMPONENT_REPO_ROOT,component.artifact!.path));
test("probe inspection exposes all readable sources and bounded WASI imports without execution",()=>{
 const inspection=inspectComponent(component);assert.equal(inspection.executed,false);assert.ok(inspection.source.files!.length>20);
 assert.ok(inspection.source.files!.some(f=>f.path.endsWith("convex_sri.rs")&&f.text.includes("pub struct")));
 assert.equal(inspection.wasm!.maximum_memory_bytes,268435456);
 assert.ok(inspection.wasm!.imports.every(i=>i.module==="wasi_snapshot_preview1"));
 assert.throws(()=>inspectProbeWasm(readFileSync(repositoryFile(COMPONENT_REPO_ROOT,registry.components.find(c=>c.id==="examples/scale")!.artifact!.path))),/exports/);
});
test("resource loader rejects path escapes and corrupt bytes and actual WASM rejects incomplete configuration",async()=>{
 const entry={base64:"",sha256:"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"};
 const base={format:"odb-probe-resources/1",profile:"convex-01",configuration:{},files:{"assets/A_Probe.bin":entry}};
 for(const path of["../secret","assets/../secret","https://remote/asset","maps/.hidden"]){await assert.rejects(()=>validateResources({...base,files:{[path]:entry}}));}
 await assert.rejects(()=>validateResources({...base,files:{"assets/A_Probe.bin":{...entry,base64:"AA=="}}}),/integrity/);
 const accepted=await validateResources(base);await assert.rejects(()=>createProbeDecoder(bytes,accepted),/Require settings object/);
});
test("a runtime without a built-in profile refuses resource-free initialization",async()=>{
 await assert.rejects(()=>createProbeDecoder(bytes),/explicitly supplied profile/);
});
test("capture cancellation releases a decoder prepared after stop and never opens USB",async()=>{
 const composition=registry.compositions.find(c=>c.id==="ultrasound/convex-capture")!;let resolve!:(value:any)=>void,uiClosed=0,decoderClosed=0,opened=0;
 const session=new ProbeCaptureSession(composition,registry,{usbDevice:{open(){opened++;}},resources:{}as any,phantomReady:true,
 prepareInterface:async()=>({update:async()=>{},close(){uiClosed++;}}),prepareDecoder:()=>new Promise(r=>{resolve=r;})});
 const started=session.start();await new Promise(r=>setImmediate(r));const stopping=session.stop();assert.equal(session.stop(),stopping);await stopping;
 resolve({close(){decoderClosed++;}});await assert.rejects(started);assert.equal(uiClosed,1);assert.equal(decoderClosed,1);assert.equal(opened,0);
});
