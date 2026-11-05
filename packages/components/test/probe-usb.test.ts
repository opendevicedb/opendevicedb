import{test}from"node:test";import assert from"node:assert/strict";
import{ProbeUsbCapture}from"../../../components/ultrasound/usb-capture/1.0.0/source.ts";
function device(){
 const writes:{kind:string;data:Uint8Array}[]=[],pending:((value:any)=>void)[]=[];
 let bootstrap=true,closed=false;const d:any={vendorId:0x04b4,productId:0x4611,opens:0,closes:0,
 configuration:{interfaces:[{interfaceNumber:0,alternate:{alternateSetting:0},alternates:[{alternateSetting:0,endpoints:[...[1,6,8].map(endpointNumber=>({endpointNumber,direction:"in"})),{endpointNumber:2,direction:"out"}]}]}]},
 open:async()=>{d.opens++;},claimInterface:async()=>{},close:async()=>{closed=true;d.closes++;for(const resolve of pending.splice(0))resolve({status:"ok",data:new DataView(new ArrayBuffer(0))});},
 controlTransferIn:async(setup:any)=>{const b=setup.request===0xa9?Uint8Array.from([...new TextEncoder().encode("C0061435UC5-2S#\0"),...new Uint8Array(16).fill(255)]):new Uint8Array(8);return{status:"ok",data:new DataView(b.buffer)};},
 controlTransferOut:async(_:any,b:Uint8Array)=>{writes.push({kind:"power",data:b});return{status:"ok",bytesWritten:b.length};},
 transferOut:async(_:number,b:Uint8Array)=>{writes.push({kind:"bulk",data:b});return{status:"ok",bytesWritten:b.length};},
 transferIn:async(ep:number)=>{if(ep===8&&bootstrap){bootstrap=false;return{status:"ok",data:new DataView(new ArrayBuffer(512))};}if(closed)return{status:"ok",data:new DataView(new ArrayBuffer(0))};return new Promise(resolve=>pending.push(resolve));},
 };
 return{d,writes};
}
const planner={decodeMessage:async()=>({message_pid:0,reported_probe_id:1435,logic_compile_version:1,low_power_mode:0}),bind:async()=>({packets:[{name:"synthetic configuration",bytes:Array(512).fill(0)}]})};
test("WebUSB source sends bounded known bootstrap/configuration/Start/Freeze and closes every reader",async()=>{
 const{d,writes}=device();const capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(){}});
 await capture.start();await capture.stop();await capture.done;
 assert.equal(d.opens,1);assert.equal(d.closes,1);assert.equal(writes.length,7);
 const pairs=writes.filter(w=>w.data.length===512&&new DataView(w.data.buffer).getUint32(0,true)===0x5a5aa5a5).map(w=>[new DataView(w.data.buffer).getUint32(16,true),new DataView(w.data.buffer).getUint32(20,true)]);
 assert.deepEqual(pairs,[[0x60001,1],[0x60004,0],[0x50062,1],[0x60001,0],[0x60001,1]]);
 await capture.stop();assert.equal(writes.length,7);
});
test("uncertain OUT suppresses all later writes including final Freeze",async()=>{
 const{d,writes}=device();d.transferOut=async(_:number,b:Uint8Array)=>{writes.push({kind:"bulk",data:b});return{status:"ok",bytesWritten:10};};
 const capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(){}});
 await assert.rejects(capture.start(),/uncertain/);await assert.rejects(capture.done,/uncertain/);assert.equal(writes.length,2);assert.equal(d.closes,1);
});
test("cancellation while opening releases the late handle and never writes",async()=>{
 const{d,writes}=device();let resolve!:()=>void;d.open=()=>new Promise<void>(r=>{resolve=r;});
 const capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(){}});
 const started=capture.start();await capture.stop();resolve();await assert.rejects(started,/stopped/);assert.equal(writes.length,0);assert.equal(d.closes,1);
});
test("resource-independent USB guards reject wrong device or missing current setup before opening",async()=>{
 for(const patch of[{phantomReady:false},{device:{vendorId:1,productId:2}},{seconds:31}]){
  const{d,writes}=device();const capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(){},...patch});await assert.rejects(capture.start());assert.equal(d.opens,0);assert.equal(writes.length,0);
 }
});

test("stop waits for an in-flight OUT result before sending its single final Freeze",async()=>{
 const{d,writes}=device();let finish!:(value:any)=>void;
 d.controlTransferOut=async(_:any,b:Uint8Array)=>{writes.push({kind:"power",data:b});return new Promise(r=>{finish=r;});};
 const capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(){}});const started=capture.start();
 for(let n=0;n<20&&!finish;n++)await new Promise(r=>setImmediate(r));assert.ok(finish);
 const stopping=capture.stop();await new Promise(r=>setImmediate(r));assert.equal(writes.length,1);
 finish({status:"ok",bytesWritten:2});await stopping;await assert.rejects(started,/stopped/);assert.equal(writes.length,2);assert.equal(d.closes,1);
});

test("DATA has eight queued requests before Start, preserves request order and drains successful Stop results",async()=>{
 const{d,writes}=device();const originalOut=d.transferOut,originalIn=d.transferIn;
 let started=false,issued=0,outstanding=0,maximum=0,queuedBeforeStart=0,delivered=0;
 const pending:{ordinal:number;resolve:(v:any)=>void}[]=[];
 const resolve=(item:{ordinal:number;resolve:(v:any)=>void},data:Uint8Array)=>{outstanding--;item.resolve({status:"ok",data:new DataView(data.buffer)});};
 const batch=()=>{
  if(!started||pending.length<8||delivered>=16)return;
  const items=pending.splice(0,8);delivered+=items.length;
  // Complete reverse order; consumption must still follow USB request order.
  for(const item of items.reverse())resolve(item,Uint8Array.of(item.ordinal));
 };
 d.transferIn=async(ep:number)=>{
  if(ep!==6)return originalIn(ep);
  const ordinal=issued++;outstanding++;maximum=Math.max(maximum,outstanding);
  return new Promise(r=>{pending.push({ordinal,resolve:r});batch();});
 };
 d.transferOut=async(ep:number,b:Uint8Array)=>{
  const result=await originalOut(ep,b),v=new DataView(b.buffer);
  if(b.length===512&&v.getUint32(16,true)===0x60001&&v.getUint32(20,true)===0){queuedBeforeStart=issued;started=true;batch();}
  return result;
 };
 const originalClose=d.close;
 d.close=async()=>{let tail=true;for(const item of pending.splice(0)){resolve(item,tail?Uint8Array.of(item.ordinal):new Uint8Array());tail=false;}await originalClose();};
 const received:number[]=[];let capture:ProbeUsbCapture;
 capture=new ProbeUsbCapture({device:d,planner,seconds:1,phantomReady:true,onBytes(b){received.push(...b);if(received.length===16)void capture.stop();}});
 await capture.start();await capture.done;
 assert.equal(queuedBeforeStart,8);assert.equal(maximum,8);
 assert.deepEqual(received,Array.from({length:17},(_,i)=>i));
 assert.equal(outstanding,0);assert.equal(writes.length,7);
});

test("continuous source has no deadline or lifetime byte cap; disconnect suppresses further OUT",async()=>{
 const{d,writes}=device();const original=d.transferIn;
 let count=0;const bytes=new Uint8Array(16384);
 d.transferIn=async(ep:number)=>ep===6&&count++<4200?{status:'ok',data:new DataView(bytes.buffer)}:original(ep);
 let received=0;const entries:any[]=[];
 const capture=new ProbeUsbCapture({device:d,planner,seconds:null,phantomReady:true,onBytes(b){received+=b.length;},onJournal(e){if(e.kind==='out')entries.push(e);}});
 await capture.start();
 for(let n=0;n<5000&&received<4200*16384;n++)await new Promise(r=>setImmediate(r));
 assert.equal(received,4200*16384);assert.ok(received>67108864);
 // No duration-based stop: still open after more than a legacy 1s capture deadline.
 await new Promise(r=>setTimeout(r,1050));assert.equal(d.closes,0);
 const before=writes.length;await capture.disconnect();await assert.rejects(capture.done,/disconnected/);
 assert.equal(writes.length,before);assert.equal(d.closes,1);assert.equal(entries.some(e=>e.producer==='final-Freeze'),false);
});
