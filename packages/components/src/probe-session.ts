// SPDX-License-Identifier: AGPL-3.0-or-later
import {findComponent,lockComposition,parameterValues,type Composition,type Registry,type RegisteredComponent}from"./browser.ts";
import{ProbeUsbCapture}from"../../../components/ultrasound/usb-capture/1.0.0/source.ts";
import{pngDimensions,type UltrasoundFrame}from"../../../components/ultrasound/preview-source/1.0.0/source.ts";
import type{ProbeResources}from"./probe/decoder.ts";
import type{VideoRenderer}from"./video.ts";
export interface ProbeDecoderHost{
 decodeMessage(bytes:Uint8Array):Promise<any>;bind(bytes:Uint8Array):Promise<any>;
 push(bytes:Uint8Array):Promise<{sequence:number;data:ArrayBuffer}[]>;finish():Promise<{sequence:number;data:ArrayBuffer}[]>;close():void;
}
export interface ProbeCaptureHost{
 usbDevice:any;resources:ProbeResources;phantomReady:boolean;
 prepareDecoder(component:RegisteredComponent,resources:ProbeResources,signal:AbortSignal):Promise<ProbeDecoderHost>;
 prepareInterface(component:RegisteredComponent,node:string,signal:AbortSignal):Promise<VideoRenderer>;
 onState?(state:string,error?:string):void;onFrame?(metadata:Omit<UltrasoundFrame,"data">):void;
}
export class ProbeCaptureSession{
 private host:ProbeCaptureHost;private registry:Registry;readonly composition:Composition;
 private controller=new AbortController();private decoder?:ProbeDecoderHost;private renderers:VideoRenderer[]=[];private capture?:ProbeUsbCapture;
 private pending:Uint8Array[]=[];private queuedBytes=0;private draining?:Promise<void>;private started=false;private stopped=false;private stopping?:Promise<void>;private session=crypto.randomUUID();
 constructor(composition:Composition,registry:Registry,host:ProbeCaptureHost){this.composition=lockComposition(composition,registry);this.registry=registry;this.host=host;}
 async start(){
  if(this.started)throw Error("Create a new capture session");this.started=true;const signal=this.controller.signal;
  const nodes=this.composition.nodes.map(n=>({...n,c:findComponent(this.registry,n.component,n.version)!}));
  const sources=nodes.filter(n=>n.c.runtime?.entry==="probe-usb"),decoders=nodes.filter(n=>n.c.runtime?.abi==="odb.ultrasound.decode/1"),displays=nodes.filter(n=>n.c.runtime?.abi==="odb.video-ui/1");
  if(sources.length!==1||decoders.length!==1||!displays.length||displays.length>4||nodes.length!==2+displays.length)throw Error("Capture requires one USB source, one probe decoder and one to four frame displays");
  const source=sources[0],decoder=decoders[0];
  if(decoder.component!=="ultrasound/convex-decoder"||decoder.version!=="1.0.0")throw Error("USB configuration requires the audited UC5-2S core release; arbitrary processors cannot supply device commands");
  if(!this.composition.connections.some(e=>e.from===`${source.id}.bytes`&&e.to===`${decoder.id}.bytes`)||displays.some(n=>!this.composition.connections.some(e=>e.from===`${decoder.id}.frames`&&e.to===`${n.id}.frames`)))throw Error("Connect USB bytes to the decoder and decoded frames to each display");
  try{
   for(const n of displays){signal.throwIfAborted();const ui=await this.host.prepareInterface(n.c,n.id,signal);if(signal.aborted){ui.close();signal.throwIfAborted();}this.renderers.push(ui);}
   const prepared=await this.host.prepareDecoder(decoder.c,this.host.resources,signal);if(signal.aborted){prepared.close();signal.throwIfAborted();}this.decoder=prepared;
   const seconds=Number(parameterValues(source.c,source.parameters).seconds);
   this.capture=new ProbeUsbCapture({device:this.host.usbDevice,planner:prepared,seconds,phantomReady:this.host.phantomReady,onState:state=>this.host.onState?.(state),onBytes:bytes=>{
    if(this.stopped)return;this.queuedBytes+=bytes.length;if(this.queuedBytes>16777216)throw Error("Image decoder cannot keep up; stopped at the 16 MiB queue limit");
    this.pending.push(bytes);this.drain();
   }});
   await this.capture.start();
   void this.capture.done.then(async()=>{
    if(this.stopped)return;this.host.onState?.("Finishing decoded frames");await this.draining;if(this.stopped)return;
    await this.publish(await this.decoder!.finish());if(!this.stopped)this.host.onState?.("Capture complete");
   }).catch(e=>this.fail(e));
  }catch(e){await this.stop();throw e;}
 }
 private drain(){
  if(this.draining||this.stopped)return;
  this.draining=(async()=>{while(this.pending.length&&!this.stopped){const bytes=this.pending.shift()!;this.queuedBytes-=bytes.length;await this.publish(await this.decoder!.push(bytes));}})().catch(e=>this.fail(e)).finally(()=>{this.draining=undefined;if(this.pending.length&&!this.stopped)this.drain();});
 }
 private async publish(frames:{sequence:number;data:ArrayBuffer}[]){
  for(const raw of frames){if(this.stopped)return;const frame:UltrasoundFrame={format:"odb.video.frame/1",encoding:"image/png",data:raw.data,...pngDimensions(raw.data),sequence:raw.sequence,session:this.session,received_at:Date.now(),timebase:"host-receipt",mode:"live",profile:"convex-01",calibrated:false};
   await Promise.all(this.renderers.map(r=>r.update({...frame,data:frame.data.slice(0)})));if(!this.stopped){const{data:_data,...metadata}=frame;this.host.onFrame?.(metadata);}
  }
 }
 private async fail(e:Error){if(this.stopped)return;await this.stop();this.host.onState?.("error",e.message);}
 stop():Promise<void>{return this.stopping??=this.release();}
 private async release(){
  this.stopped=true;this.controller.abort();this.pending=[];this.queuedBytes=0;
  const stop=this.capture?.stop();this.decoder?.close();for(const r of this.renderers.splice(0))r.close();await stop;this.host.onState?.("Stopped");
 }
}
