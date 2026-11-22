import {ProbeUsbCapture} from '../../../components/ultrasound/usb-capture/1.0.0/source.ts';
import {StreamArchive} from './stream-archive.ts';
import {mountArchiveRecovery} from './archive-recovery.ts';
declare const WORKER_SOURCE:string,WASM_BASE64:string;
type Frame={sequence:number;data:ArrayBuffer;received_ms:number};
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const btn=(id:string)=>el<HTMLButtonElement>(id),ready=el<HTMLInputElement>('ready');
const canvas=el<HTMLCanvasElement>('image'),ctx=canvas.getContext('2d')!,status=el('status');
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
 depthSelector.disabled=active||selecting;
 btn('start').disabled=active||selecting||!ready.checked;btn('stop').disabled=(!active&&!selecting)||stopRequested;
 btn('photo').disabled=!lastFrame;btn('raw').disabled=!archive||exportingCurrent;ready.disabled=active||selecting;
 el('live-badge').textContent=active&&!stopRequested?'DIRECT':active?'ARRÊT EN COURS':'DÉCONNECTÉ';el('live-badge').dataset.active=String(active&&!stopRequested);
}
function rpc(type:string,bytes?:Uint8Array,present=true):Promise<any>{
 if(!worker)return Promise.reject(Error('Moteur indisponible'));const id=++sequence;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,type,bytes,present,depthIndex:sessionDepth},bytes?[bytes.buffer]:[]);});
}
function closeWorker(){worker?.terminate();worker=undefined;for(const p of pending.values())p.reject(Error('Session fermée'));pending.clear();}
function paint(){
 renderRequest=undefined;const frame=latestFrame;latestFrame=undefined;if(!frame)return;
 ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.data),512,512),0,0);lastFrame=frame;displayed++;
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
   const present=decoded===0||performance.now()-batch[0].received_ms<120||queuedBytes<131072;
   if(!present)advancedBytes+=size;const frames=await rpc('push',bytes,present);offer(frames,batch[0].received_ms);
  }
 })().catch(e=>{processingError=e;void stop();}).finally(()=>{pumping=undefined;if(queue.length&&!processingError)pump();});
}
async function stop(){
 if(!active&&!selecting)return;stopRequested=true;status.textContent='Arrêt du direct…';controls();await capture?.stop();
}
function snapshot(){return{profile:'uc5-2s-general-depth-v1',depth_index:sessionDepth,software:'probe-embedded-web-v0.6.1',decoded_frames:decoded,displayed_frames:displayed,coalesced_display_frames:coalesced,received_bytes:receivedBytes,error:lastError,disconnected,max_decoder_queue_bytes:maxQueuedBytes,wasm_memory_bytes:wasmMemory,advanced_bytes_without_raster:advancedBytes,active};}
ready.onchange=controls;btn('stop').onclick=()=>void stop();
btn('start').onclick=async()=>{
 if(active||selecting||!ready.checked)return;selecting=true;stopRequested=false;disconnected=false;capture=undefined;status.textContent='Choisir la sonde…';controls();
 let initialized=false,created=false,selectionError:string|undefined;
 try{
  if(!(navigator as any).usb)throw Error('Ouvrir cette page dans Chrome ou Chromium avec WebUSB.');
  const selected=await(navigator as any).usb.requestDevice({filters:[{vendorId:0x04b4,productId:0x4611}]});if(stopRequested)return;
  sessionDepth=Number(depthSelector.value);device=selected;created=true;run++;active=true;selecting=false;lastError=null;processingError=undefined;
  queue=[];queuedBytes=0;pumping=undefined;receivedBytes=0;decoded=0;displayed=0;coalesced=0;liveSince=0;maxQueuedBytes=0;wasmMemory=0;advancedBytes=0;archive=undefined;archiveWarning='';
  lastFrame=undefined;latestFrame=undefined;recentPaints=[];if(renderRequest!==undefined)cancelAnimationFrame(renderRequest);renderRequest=undefined;
  ctx.clearRect(0,0,512,512);el('empty').hidden=false;el('count').textContent='0';el('current-frame').textContent='En attente d’une image';controls();
  try{archive=await new StreamArchive({profile:'uc5-2s-general-depth-v1',depth_index:sessionDepth,software:'probe-embedded-web-v0.6.1',run},s=>{archiveWarning=s;}).open();}
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
  capture=new ProbeUsbCapture({device,seconds:null,phantomReady:ready.checked,
   planner:{decodeMessage:b=>rpc('decodeMessage',b.slice()),bind:b=>rpc('bind',b.slice())},
   onState:s=>{if(s==='Capturing from USB'&&!stopRequested){liveSince=performance.now();status.textContent=`Direct continu · profondeur ${sessionDepth}`;controls();}else if(s==='Opening USB probe')status.textContent='Connexion à la sonde…';},
   onJournal:e=>archive?.append('journal',e),
   onBytes:b=>{
    if(!b.length)return;receivedBytes+=b.length;archive?.append('data',b);
    if(processingError)return;
    queuedBytes+=b.length;maxQueuedBytes=Math.max(maxQueuedBytes,queuedBytes);
    if(queuedBytes>4194304)throw Error('Le traitement ne suit plus le flux ; bruts conservés pour diagnostic.');
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
  selecting=false;ready.checked=false;controls();
  status.textContent=!created?(selectionError||'Connexion annulée.'):disconnected?'Sonde débranchée. Dernière image conservée.':lastError?`${lastError} — ${decoded} images reçues.`:`Direct arrêté : ${decoded} images. Dernière image conservée.`;
 }
};
(navigator as any).usb?.addEventListener('disconnect',(e:any)=>{
 if(e.device!==device)return;disconnected=true;stopRequested=true;status.textContent='Sonde débranchée.';controls();void capture?.disconnect();
});
btn('photo').onclick=async()=>{
 const frame=lastFrame;if(!frame)return;const name=`uc5-2s-${run}-image-${frame.sequence}.png`;
 const bytes=new Uint8Array(frame.data.slice(0));
 try{if(!worker){const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));try{worker=new Worker(url);worker.onmessage=({data})=>{const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);}};await rpc('init',Uint8Array.from(atob(WASM_BASE64),c=>c.charCodeAt(0)));}finally{URL.revokeObjectURL(url);}}
 const png=await rpc('png',bytes);lastPhoto=name;download(name,new Blob([png],{type:'image/png'}));
 }catch(e){el('export-status').textContent=String(e);}finally{if(!active)closeWorker();}
};
function download(name:string,blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
btn('raw').onclick=async()=>{
 const source=archive;if(!source||exportingCurrent)return;exportingCurrent=true;controls();
 try{
  if('showSaveFilePicker'in window){
   const handle=await(window as any).showSaveFilePicker({suggestedName:`uc5-2s-${source.id}.odb-stream`});
   const file=await handle.createWritable();try{for await(const line of source.lines(snapshot()))await file.write(line);await file.close();}catch(e){await file.abort();throw e;}
  }else{
   if(source.storedBytes>33554432)throw Error('Utiliser Chrome ou Chromium pour exporter un long historique directement sur disque.');
   const parts:BlobPart[]=[];for await(const line of source.lines(snapshot()))parts.push(line);download(`uc5-2s-${source.id}.odb-stream`,new Blob(parts,{type:'application/x-ndjson'}));
  }
  el('export-status').textContent='Historique exporté. Le direct continue.';
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
