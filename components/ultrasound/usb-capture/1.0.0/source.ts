// SPDX-License-Identifier: AGPL-3.0-or-later
// WebUSB-only UC5-2S acquisition. No localhost, HTTP driver or arbitrary command API.
export interface ProbePlanner {decodeMessage(data:Uint8Array):Promise<any>;bind(data:Uint8Array):Promise<{packets:{name:string;bytes:number[]}[]}>}
export interface UsbCaptureHost {
 device:any;planner:ProbePlanner;seconds:number|null;phantomReady:boolean;
 onBytes(bytes:Uint8Array):void;onState?(state:string):void;onJournal?(entry:Record<string,unknown>):void;
}
const pair=(address:number,value:number)=>{const bytes=new Uint8Array(512),v=new DataView(bytes.buffer);for(const[o,n]of[[0,0x5a5aa5a5],[4,2],[16,address],[20,value],[24,2],[28,0xa5a55a5a]])v.setUint32(o,n,true);return bytes;};
const productMatches=(b:Uint8Array)=>b.length===32&&new TextDecoder().decode(b.slice(0,16))==="C0061435UC5-2S#\0"&&b.slice(16).every(n=>n===255);
const signature=(d:any)=>JSON.stringify([d.logic_compile_version,d.reported_probe_id,d.probe_backup_flags,d.secondary_probe_id,d.secondary_probe_append,d.probe_connection_bits,d.special_flag0,d.special_flag1,d.color_type]);
function timeout<T>(promise:Promise<T>,ms:number):Promise<T>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("USB operation timed out; close and reconnect explicitly")),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
export class ProbeUsbCapture {
 private host:UsbCaptureHost;private stopped=false;private uncertain=false;private anyWrite=false;private opened=false;private claimed=false;private freezeSent=false;private disconnected=false;
 private readers:Promise<void>[]=[];private finishing?:Promise<void>;private finished!:()=>void;private rejectFinished!:(e:Error)=>void;
 readonly done:Promise<void>;private inFlight?:Promise<any>;private deadline?:ReturnType<typeof setTimeout>;private error?:Error;private expected="";private received=0;private outOrdinal=0;
 constructor(host:UsbCaptureHost){this.host=host;this.done=new Promise((r,j)=>{this.finished=r;this.rejectFinished=j;});this.done.catch(()=>{});}
 private check(){if(this.stopped)throw Error("Capture stopped");}
 private async write(bytes:Uint8Array,power=false,producer="configuration",final=false){
  if(!final)this.check();if(this.uncertain)throw Error("No further OUT after an uncertain write");
  const ordinal=++this.outOrdinal;this.anyWrite=true;this.host.onJournal?.({kind:power?"power":"bulk-out",phase:"attempted",ordinal,producer,bytes:bytes.length,raw:Array.from(bytes),at_ms:performance.now()});
  try{const pending=timeout(power?this.host.device.controlTransferOut({requestType:"vendor",recipient:"device",request:0xb5,value:0,index:0},bytes):this.host.device.transferOut(2,bytes),power?5000:1000);this.inFlight=pending;const r=await pending;
   if(r.status!=="ok"||r.bytesWritten!==bytes.length)throw Error("USB write outcome is uncertain");this.host.onJournal?.({kind:"out",phase:"completed",ordinal,producer,bytes:bytes.length,status:r.status,bytes_written:r.bytesWritten,at_ms:performance.now()});
  }catch(e){this.host.onJournal?.({kind:"out",phase:"uncertain",ordinal,producer,error:String(e),at_ms:performance.now()});this.uncertain=true;throw e;}finally{this.inFlight=undefined;}
 }
 private async identity(){
  for(const[request,value,length]of[[0xa6,0,8],[0xa9,0x1f00,32]]){
   this.check();const r=await timeout(this.host.device.controlTransferIn({requestType:"vendor",recipient:"device",request,value,index:0},length),5000);
   if(r.status!=="ok"||!r.data)throw Error("Probe identity read failed");const b=new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength);
   this.host.onJournal?.({kind:"identity",request,value,bytes:b.length,raw:Array.from(b),at_ms:performance.now()});
   if(request===0xa6&&![8,2].includes(b.length)||request===0xa9&&!productMatches(b))throw Error("The selected USB device does not identify as UC5-2S");
  }
 }
 async start(){
  if(this.opened||this.stopped)throw Error("Create a new capture session");
  if(!this.host.phantomReady)throw Error("Confirm the current probe setup on the phantom");
  if(this.host.seconds!==null&&(!Number.isInteger(this.host.seconds)||this.host.seconds<1||this.host.seconds>30))throw Error("Capture duration must be 1–30 seconds");
  const d=this.host.device;if(d?.vendorId!==0x04b4||d.productId!==0x4611)throw Error("Select the convex probe 04b4:4611");
  try{
   this.host.onState?.("Opening USB probe");await d.open();this.opened=true;if(this.stopped){await d.close();this.opened=false;throw Error("Capture stopped while opening USB");}this.check();
   if(!d.configuration)await d.selectConfiguration(1);this.check();
   const iface=d.configuration.interfaces.find((i:any)=>i.interfaceNumber===0);const alt=iface?.alternates.find((a:any)=>[1,6,8].every(n=>a.endpoints.some((e:any)=>e.direction==="in"&&e.endpointNumber===n))&&a.endpoints.some((e:any)=>e.direction==="out"&&e.endpointNumber===2));
   if(!alt)throw Error("Expected USB capture endpoints are unavailable");
   await d.claimInterface(0);this.claimed=true;this.check();if(iface.alternate.alternateSetting!==alt.alternateSetting)await d.selectAlternateInterface(0,alt.alternateSetting);
   await this.identity();await this.write(new Uint8Array(2),true,"PowerON");await this.write(pair(0x60001,1),false,"initial-Freeze");await this.write(pair(0x60004,0),false,"query-hardware");
   let raw:Uint8Array|undefined,decoded:any;const until=performance.now()+2500;
   while(performance.now()<until){this.check();const r=await timeout(d.transferIn(8,512),Math.max(1,until-performance.now()));if(r.status!=="ok"||!r.data)throw Error("Hardware parameter read failed");
    const b=new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength).slice();if(b.length!==512)continue;
    this.host.onJournal?.({kind:"bootstrap-message",bytes:b.length,raw:Array.from(b),at_ms:performance.now()});
    const value=await this.host.planner.decodeMessage(b);if(value.message_pid!==0)continue;
    const legacy=value.reported_probe_id===0&&value.probe_connection_bits===0&&value.product_series===6&&value.logic_type===1&&value.message_type===0;
    if(value.reported_probe_id!==1435&&!legacy)continue;if(legacy)await this.identity();raw=b;decoded=value;break;
   }
   if(!raw)throw Error("No supported complete hardware parameter message");
   this.expected=signature(decoded);const planned=await this.host.planner.bind(raw);this.check();
   // Queue all endpoint readers before Start. WebUSB has no per-transfer timeout.
   const read=async(endpoint:number,length:number,kind:string,depth=1)=>{
    let issued=0;
    // Queue in request order, replenish before handing completed DATA to the host.
    // Settled promises prevent a later cancellation/rejection becoming unhandled.
    const issue=()=>{
     const ordinal=++issued,started_ms=performance.now();
     return d.transferIn(endpoint,length).then((value:any)=>({value,ordinal,started_ms,finished_ms:performance.now()}),(error:any)=>({error,ordinal,started_ms,finished_ms:performance.now()}));
    };
    const queue=Array.from({length:depth},issue);
    this.host.onJournal?.({kind:"reader-start",channel:kind,endpoint,transfer_bytes:length,in_flight_limit:depth,at_ms:performance.now()});
    while(queue.length){
     const result=await queue.shift()!;
     if(!this.stopped)queue.push(issue());
     if("error"in result){if(this.stopped)continue;throw result.error;}
     const r=result.value;
     if(r.status!=="ok"||!r.data){if(this.stopped)continue;throw Error(`${kind} USB read failed`);}
     const b=new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength).slice();if(b.length>length)throw Error("USB receive length exceeded");
     this.host.onJournal?.({kind:"read",channel:kind,endpoint,ordinal:result.ordinal,bytes:b.length,status:r.status,started_ms:result.started_ms,finished_ms:result.finished_ms,after_stop:this.stopped,...(kind!=="data"?{raw:Array.from(b)}:{})});
     // Preserve successful data already received while Stop cancels remaining reads.
     if(kind==="data"){this.received+=b.length;if(!Number.isSafeInteger(this.received)||this.host.seconds!==null&&this.received>67108864)throw Error("Capture byte budget exceeded");this.host.onBytes(b);}
     else if(!this.stopped&&kind==="messages"&&b.length===512){const value=await this.host.planner.decodeMessage(b);if(value.family==="button_candidate"||value.message_pid===0&&signature(value)!==this.expected)throw Error("Probe hardware parameters changed; capture stopped");}
     if(!this.stopped&&b.length===0)await new Promise(r=>setTimeout(r,0));
    }
   };
   this.readers=[[6,16384,"data",8],[8,512,"messages",1],[1,64,"notifications",1]].map(([ep,len,kind,depth])=>read(Number(ep),Number(len),String(kind),Number(depth)).catch(e=>{this.error??=e;if(!this.stopped)void this.stop();}));
   await this.write(pair(0x50062,1),false,"activate-type");
   for(const packet of planned.packets){if(!Array.isArray(packet.bytes)||packet.bytes.length<512||packet.bytes.length>16896||packet.bytes.length%512)throw Error("Invalid sealed configuration packet");await this.write(Uint8Array.from(packet.bytes),false,packet.name);}
   await this.write(pair(0x60001,0),false,"Start");this.check();this.host.onState?.("Capturing from USB");if(this.host.seconds!==null)this.deadline=setTimeout(()=>void this.stop(),this.host.seconds*1000);
  }catch(e){if(!this.stopped)this.error=e as Error;await this.stop();throw e;}
 }
 disconnect():Promise<void>{
  this.disconnected=true;this.error??=Error("Probe disconnected");return this.stop();
 }
 stop():Promise<void>{
  if(this.finishing)return this.finishing;this.stopped=true;if(this.deadline)clearTimeout(this.deadline);
  this.finishing=(async()=>{
   const d=this.host.device;
   if(this.inFlight){try{await this.inFlight;}catch{this.uncertain=true;}}
   // Exactly one final Freeze, suppressed after unknown OUT. Never retry a command.
   if(this.opened&&this.anyWrite&&!this.uncertain&&!this.disconnected&&!this.freezeSent){this.freezeSent=true;
    try{await this.write(pair(0x60001,1),false,"final-Freeze",true);}catch(e){this.uncertain=true;this.error??=e as Error;}
   }
   if(this.opened){try{await timeout(d.close(),2000);}catch(e){this.error??=e as Error;}this.opened=false;this.claimed=false;}
   // close() cancels outstanding IN promises; timeout bounds implementations that fail to settle.
   await Promise.race([Promise.allSettled(this.readers),new Promise(r=>setTimeout(r,1000))]);
   this.host.onState?.(this.error?"Capture failed":"USB capture finished");this.error?this.rejectFinished(this.error):this.finished();
  })();return this.finishing;
 }
}
