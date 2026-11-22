// Persist continuous raw DATA on browser storage, rather than growing the JS heap.
// Capture remains independent of storage failures; omissions are always explicit.
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const transaction=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Transaction annulée'));tx.onerror=()=>{};});
export class StreamArchive {
 private db!:IDBDatabase;private queue:any[]=[];private queuedBytes=0;private task:Promise<void>=Promise.resolve();private timer:ReturnType<typeof setTimeout>|undefined;
 private ordinal=0;private committed=0;private metadata:Record<string,unknown>;
 error:string|null=null;omittedBytes=0;storedBytes=0;maxQueuedBytes=0;
 readonly id=crypto.randomUUID();
 constructor(metadata:Record<string,unknown>,private onError:(s:string)=>void){this.metadata={...metadata,id:this.id,started_at:new Date().toISOString()};}
 async open(){
  const r=indexedDB.open('odb-probe-direct-v1',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('sessions',{keyPath:'id'});r.result.createObjectStore('entries',{keyPath:['session','ordinal']});};
  this.db=await request(r);await this.saveMetadata({active:true});return this;
 }
 private fail(e:unknown){if(!this.error){this.error=String(e);this.onError(this.error);}for(const row of this.queue)if(row.kind==='data')this.omittedBytes+=row.payload.length;this.queue=[];this.queuedBytes=0;}
 append(kind:'data'|'journal'|'display',payload:Uint8Array|unknown){
  if(this.error){if(kind==='data')this.omittedBytes+=(payload as Uint8Array).length;return;}
  const bytes=payload instanceof Uint8Array?payload.length:JSON.stringify(payload).length;
  if(this.queuedBytes+bytes>8388608){this.fail(Error('Stockage local trop lent ; historique interrompu, direct maintenu.'));if(kind==='data')this.omittedBytes+=bytes;return;}
  const copy=payload instanceof Uint8Array?payload.slice():structuredClone(payload);
  this.queue.push({session:this.id,ordinal:++this.ordinal,kind,payload:copy});this.queuedBytes+=bytes;this.maxQueuedBytes=Math.max(this.maxQueuedBytes,this.queuedBytes);
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},25);
 }
 async flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
  this.task=this.task.then(async()=>{
   while(this.queue.length&&!this.error){
    const batch=this.queue.splice(0,128),size=batch.reduce((n,row)=>n+(row.kind==='data'?row.payload.length:JSON.stringify(row.payload).length),0);
    try{
     const tx=this.db.transaction('entries','readwrite'),done=transaction(tx),store=tx.objectStore('entries');
     for(const row of batch)store.put(row);await done;
     this.committed=batch.at(-1).ordinal;this.storedBytes+=batch.reduce((n,row)=>n+(row.kind==='data'?row.payload.length:0),0);
    }catch(e){this.omittedBytes+=batch.reduce((n,row)=>n+(row.kind==='data'?row.payload.length:0),0);this.fail(e);}
    this.queuedBytes=Math.max(0,this.queuedBytes-size);
   }
  });await this.task;
 }
 private async saveMetadata(extra:Record<string,unknown>){
  this.metadata={...this.metadata,...extra,storage_error:this.error,omitted_bytes:this.omittedBytes,stored_bytes:this.storedBytes};
  const tx=this.db.transaction('sessions','readwrite'),done=transaction(tx);tx.objectStore('sessions').put(this.metadata);await done;
 }
 async finish(extra:Record<string,unknown>){await this.flush();try{await this.saveMetadata({...extra,active:false,ended_at:new Date().toISOString()});}catch(e){this.fail(e);}}
 async *lines(extra:Record<string,unknown>={}){
  await this.flush();const end=this.committed;
  yield JSON.stringify({format:'odb-probe-stream/1',...this.metadata,...extra,storage_error:this.error,omitted_bytes:this.omittedBytes,stored_bytes:this.storedBytes,snapshot_last_ordinal:end})+'\n';
  let after=0;
  while(after<end){
   const tx=this.db.transaction('entries','readonly');
   const rows=await request(tx.objectStore('entries').getAll(IDBKeyRange.bound([this.id,after+1],[this.id,end]),128));
   if(!rows.length)throw Error('Historique local incomplet');
   for(const row of rows){
    const entry=row.kind==='data'?{ordinal:row.ordinal,kind:'data',bytes:row.payload.length,base64:btoa(String.fromCharCode(...row.payload))}:{ordinal:row.ordinal,kind:row.kind,value:row.payload};
    yield JSON.stringify(entry)+'\n';after=row.ordinal;
   }
  }
 }
}
