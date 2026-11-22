import '../../../components/video/frame-viewer/1.1.0/viewer.js';
import {ProbeUsbCapture} from 'probe-transport';
declare const PROBE:{id:string;model:string;filePrefix:string;productId:number;depths:number[];nativePng?:boolean;quickCapture?:boolean;replay?:boolean};
import {StreamArchive} from './stream-archive.ts';
import {mountArchiveRecovery} from './archive-recovery.ts';
declare const WORKER_SOURCE:string,WASM_BASE64:string;
type Frame={sequence:number;data:ArrayBuffer;received_ms:number};
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const btn=(id:string)=>el<HTMLButtonElement>(id),ready=el<HTMLInputElement>('ready');
const viewer=el<HTMLElement & {showRgba(data:ArrayBuffer,w:number,h:number):void;snapshot():Promise<Blob>}>('image');
const canvas=viewer.querySelector('canvas')!,ctx=canvas.getContext('2d')!,status=el('status');
const replayInput=el<HTMLInputElement>('replay'),duration=el<HTMLSelectElement>('duration');
let replaying=false;
const depthSelector=el<HTMLSelectElement>('depth');
let sessionDepth=0;
let active=false,selecting=false,stopRequested=false,disconnected=false,device:any,capture:ProbeUsbCapture|undefined,worker:Worker|undefined;
let sequence=0,run=0,lastError:string|null=null,archive:StreamArchive|undefined,archiveWarning='';
let lastFrame:Frame|undefined,latestFrame:Frame|undefined,renderRequest:number|undefined;
let queue:{data:Uint8Array;received_ms:number}[]=[],queuedBytes=0,pumping:Promise<void>|undefined,processingError:unknown;
let receivedBytes=0,decoded=0,displayed=0,coalesced=0,liveSince=0,lastLag=0,lastCompute=0,wasmMemory=0,maxQueuedBytes=0;
let advancedBytes=0;
let exportingCurrent=false;
let recentPaints:number[]=[],lastPhoto='';
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:unknown)=>void}>();
function controls(){
 if(depthSelector)depthSelector.disabled=active||selecting;
 if(duration)duration.disabled=active||selecting;
 if(replayInput)replayInput.disabled=active||selecting;
 btn('start').disabled=active||selecting||!ready.checked||!(navigator as any).usb;btn('stop').disabled=(!active&&!selecting)||stopRequested;
 btn('photo').disabled=!lastFrame;btn('raw').disabled=!archive||exportingCurrent;ready.disabled=active||selecting;
 el('live-badge').textContent=active&&!stopRequested?(replaying?'REJEU':'DIRECT'):active?'ARRÊT EN COURS':'DÉCONNECTÉ';el('live-badge').dataset.active=String(active&&!stopRequested);
}
function rpc(type:string,bytes?:Uint8Array,present=true):Promise<any>{
 if(!worker)return Promise.reject(Error('Moteur indisponible'));const id=++sequence;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,type,bytes,present,depthIndex:sessionDepth},bytes?[bytes.buffer]:[]);});
}
function closeWorker(){worker?.terminate();worker=undefined;for(const p of pending.values())p.reject(Error('Session fermée'));pending.clear();}
function paint(){
 renderRequest=undefined;const frame=latestFrame;latestFrame=undefined;if(!frame)return;
 viewer.showRgba(frame.data,512,512);lastFrame=frame;displayed++;
 const now=performance.now();recentPaints.push(now);recentPaints=recentPaints.filter(t=>now-t<1000);lastLag=Math.max(0,now-frame.received_ms);
 el('empty').hidden=true;el('count').textContent=String(decoded);el('current-frame').textContent=`Image ${frame.sequence} · 512 × 512`;
 archive?.append('display',{sequence:frame.sequence,at_ms:now,input_received_ms:frame.received_ms});controls();
}
function offer(frames:{sequence:number;data:ArrayBuffer}[],received_ms:number){
 for(const frame of frames){decoded++;if(latestFrame)coalesced++;latestFrame={...frame,received_ms};}
 if(latestFrame&&renderRequest===undefined)renderRequest=requestAnimationFrame(paint);
}
function pump(){
 if(pumping)return;
 pumping=(async()=>{
  while(queue.length&&!processingError){
   const batch=queue.splice(0,4),size=batch.reduce((n,b)=>n+b.data.length,0),bytes=new Uint8Array(size);let offset=0;
   for(const b of batch){bytes.set(b.data,offset);offset+=b.data.length;}queuedBytes-=size;
   // Under load, keep processing every group and present at least the first image.
   const present=duration?.value==='1'||decoded===0||performance.now()-batch[0].received_ms<120||queuedBytes<131072;
   if(!present)advancedBytes+=size;const frames=await rpc('push',bytes,present);offer(frames,batch[0].received_ms);
  }
 })().catch(e=>{processingError=e;void stop();}).finally(()=>{pumping=undefined;if(queue.length&&!processingError)pump();});
}
async function stop(){
 if(!active&&!selecting)return;stopRequested=true;status.textContent='Arrêt du direct…';controls();await capture?.stop();
}
function snapshot(){return{profile:PROBE.id,depth_index:sessionDepth,software:'oddb-ultrasound-viewer/1',decoded_frames:decoded,displayed_frames:displayed,coalesced_display_frames:coalesced,received_bytes:receivedBytes,error:lastError,disconnected,max_decoder_queue_bytes:maxQueuedBytes,wasm_memory_bytes:wasmMemory,advanced_bytes_without_raster:advancedBytes,active};}
ready.onchange=controls;btn('stop').onclick=()=>void stop();
async function begin(file?:File){
 if(active||selecting||(!file&&!ready.checked))return;replaying=!!file;selecting=true;stopRequested=false;disconnected=false;capture=undefined;status.textContent='Choisir la sonde…';controls();
 let initialized=false,created=false,selectionError:string|undefined;
 try{
  if(!file&&!(navigator as any).usb)throw Error('Ouvrir cette page dans Chrome ou Chromium avec WebUSB.');
  if(file&&file.size>16*1024*1024)throw Error('Le rejeu accepte jusqu’à 16 Mio.');
  const selected=file?undefined:await(navigator as any).usb.requestDevice({filters:[{vendorId:0x04b4,productId:PROBE.productId}]});if(stopRequested)return;
  sessionDepth=Number(depthSelector?.value??PROBE.depths[0]);device=selected;created=true;run++;active=true;selecting=false;lastError=null;processingError=undefined;
  queue=[];queuedBytes=0;pumping=undefined;receivedBytes=0;decoded=0;displayed=0;coalesced=0;liveSince=0;maxQueuedBytes=0;wasmMemory=0;advancedBytes=0;archive=undefined;archiveWarning='';
  lastFrame=undefined;latestFrame=undefined;recentPaints=[];if(renderRequest!==undefined)cancelAnimationFrame(renderRequest);renderRequest=undefined;
  ctx.clearRect(0,0,512,512);el('empty').hidden=false;el('count').textContent='0';el('current-frame').textContent='En attente d’une image';controls();
  try{if(!file)archive=await new StreamArchive({profile:PROBE.id,depth_index:sessionDepth,software:'oddb-ultrasound-viewer/1',run},s=>{archiveWarning=s;}).open();}
  catch(e){archiveWarning=`Historique local indisponible : ${e}. Le direct reste disponible.`;}
  if(stopRequested)return;
  const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
  try{
   worker=new Worker(url);worker.onmessage=({data})=>{
    lastCompute=data.processing_ms??lastCompute;wasmMemory=data.memory_bytes??wasmMemory;
    const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);}
   };
   worker.onerror=e=>{processingError=Error(e.message||'Échec du moteur');for(const p of pending.values())p.reject(processingError);pending.clear();void stop();};
   await rpc('init',Uint8Array.from(atob(WASM_BASE64),c=>c.charCodeAt(0)));initialized=true;
  }finally{URL.revokeObjectURL(url);}
  if(stopRequested)return;
  if(file){
   status.textContent='Rejeu du flux enregistré…';
   const bytes=new Uint8Array(await file.arrayBuffer());
   for(let offset=0;offset<bytes.length&&!stopRequested;offset+=65536){
    const chunk=bytes.slice(offset,offset+65536);receivedBytes+=chunk.length;
    const frames=await rpc('push',chunk);
    for(const frame of frames){offer([frame],performance.now());if(renderRequest!==undefined)cancelAnimationFrame(renderRequest);paint();}
   }
   return;
  }
  capture=new ProbeUsbCapture({device,seconds:duration?.value==='1'?1:null,phantomReady:ready.checked,
   planner:{decodeMessage:b=>rpc('decodeMessage',b.slice()),bind:b=>rpc('bind',b.slice())},
   onState:s=>{if(s==='Capturing from USB'&&!stopRequested){liveSince=performance.now();status.textContent=`Capture · profondeur ${sessionDepth}`;controls();}else if(s==='Opening USB probe')status.textContent='Connexion à la sonde…';},
   onJournal:e=>archive?.append('journal',e),
   onBytes:b=>{
    if(!b.length)return;receivedBytes+=b.length;archive?.append('data',b);
    if(processingError)return;
    queuedBytes+=b.length;maxQueuedBytes=Math.max(maxQueuedBytes,queuedBytes);
    if(queuedBytes>(duration?.value==='1'?16777216:4194304))throw Error('Le traitement ne suit plus le flux ; bruts conservés pour diagnostic.');
    queue.push({data:b,received_ms:performance.now()});pump();
   }});
  await capture.start();await capture.done;
 }catch(e){if(created)lastError=String(e);else selectionError=String(e);await capture?.stop();}
 finally{
  if(created){
   stopRequested=true;controls();while(pumping)await pumping;
   if(initialized&&!processingError){try{offer(await rpc('finish'),performance.now());}catch(e){processingError=e;}}
   if(renderRequest!==undefined)cancelAnimationFrame(renderRequest);renderRequest=undefined;paint();
   if(processingError)lastError??=String(processingError);queue=[];queuedBytes=0;
   await archive?.finish({...snapshot(),active:false});active=false;closeWorker();capture=undefined;device=undefined;
  }
  selecting=false;replaying=false;ready.checked=false;if(replayInput)replayInput.value='';controls();
  status.textContent=!created?(selectionError||'Connexion annulée.'):disconnected?'Sonde débranchée. Dernière image conservée.':lastError?`${lastError} — ${decoded} images reçues.`:`${file?'Rejeu terminé':'Direct arrêté'} : ${decoded} images. Dernière image conservée.`;
 }
}
btn('start').onclick=()=>void begin();
if(replayInput)replayInput.onchange=()=>{const file=replayInput.files?.[0];if(file)void begin(file);};
if(PROBE.quickCapture)document.addEventListener('visibilitychange',()=>{if(document.hidden&&!replaying)void stop();});
(navigator as any).usb?.addEventListener('disconnect',(e:any)=>{
 if(e.device!==device)return;disconnected=true;stopRequested=true;status.textContent='Sonde débranchée.';controls();void capture?.disconnect();
});
async function nativePhoto(frame:ArrayBuffer):Promise<Blob>{
 const bytes=new Uint8Array(frame.slice(0));
 if(worker)return new Blob([await rpc('png',bytes)],{type:'image/png'});
 const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
 const encoder=new Worker(url);
 try{
  const call=(type:string,input:Uint8Array)=>new Promise<any>((resolve,reject)=>{
   encoder.onerror=e=>reject(Error(e.message));
   encoder.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.value);
   encoder.postMessage({type,bytes:input,depthIndex:sessionDepth},[input.buffer]);
  });
  await call('init',Uint8Array.from(atob(WASM_BASE64),c=>c.charCodeAt(0)));
  return new Blob([await call('png',bytes)],{type:'image/png'});
 }finally{encoder.terminate();URL.revokeObjectURL(url);}
}
btn('photo').onclick=async()=>{
 if(!lastFrame)return;
 const name=`${PROBE.filePrefix}-${run}-image-${lastFrame.sequence}.png`;
 try{const png=PROBE.nativePng?await nativePhoto(lastFrame.data):await viewer.snapshot();lastPhoto=name;download(name,png);}
 catch(e){el('export-status').textContent=String(e);}
};
function download(name:string,blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
btn('raw').onclick=async()=>{
 const source=archive;if(!source||exportingCurrent)return;exportingCurrent=true;controls();
 try{
  if('showSaveFilePicker'in window){
   const handle=await(window as any).showSaveFilePicker({suggestedName:`${PROBE.filePrefix}-${source.id}.odb-stream`});
   const file=await handle.createWritable();try{for await(const line of source.lines(snapshot()))await file.write(line);await file.close();}catch(e){await file.abort();throw e;}
  }else{
   if(source.storedBytes>33554432)throw Error('Utiliser Chrome ou Chromium pour exporter un long historique directement sur disque.');
   const parts:BlobPart[]=[];for await(const line of source.lines(snapshot()))parts.push(line);download(`${PROBE.filePrefix}-${source.id}.odb-stream`,new Blob(parts,{type:'application/x-ndjson'}));
  }
  el('export-status').textContent='Historique exporté.';
 }catch(e){el('export-status').textContent=String(e);}finally{exportingCurrent=false;controls();}
};
setInterval(()=>{
 const now=performance.now();el('received').textContent=`${(receivedBytes/1048576).toFixed(1)} Mo`;el('elapsed').textContent=active&&liveSince?`${Math.floor((now-liveSince)/1000)} s`:'—';
 recentPaints=recentPaints.filter(t=>now-t<1000);el('rate').textContent=active?`${recentPaints.length} img/s affichées`:'Affichage arrêté';
 el('latency').textContent=active&&lastFrame?`${Math.round(lastLag)} ms`:'—';
 el('storage-status').textContent=archiveWarning||`${((archive?.storedBytes||0)/1048576).toFixed(1)} Mo conservés dans ce navigateur.`;
},250);
// Read-only metrics allow offline regression tests without exposing a command API.
Object.defineProperty(window,'probeMetrics',{get:()=>({...snapshot(),queued_bytes:queuedBytes,last_compute_ms:lastCompute,last_display_delay_ms:lastLag,last_photo:lastPhoto})});
window.addEventListener('beforeunload',()=>{void capture?.stop();worker?.terminate();});controls();mountArchiveRecovery();
