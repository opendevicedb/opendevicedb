const el=id=>document.getElementById(id);
const canvas=document.querySelector('canvas');
const ctx=canvas.getContext('2d');
const plan=Uint8Array.from(atob(PLAN_BASE64),c=>c.charCodeAt(0));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MAX_BYTES=16*1024*1024;
let active=null;
function controls(){
  el('bench').disabled=!!active;
  el('start').disabled=!!active||!el('bench').checked||!navigator.usb;
  el('replay').disabled=!!active;
  el('stop').disabled=!active?.live||active.cancelled;
}
function status(text){el('status').textContent=text;}
function begin(live){
  const session={live,cancelled:false,frames:0,total:0};
  active=session;
  controls();el('photo').disabled=true;ctx.clearRect(0,0,512,512);
  return session;
}
async function decoder(session){
  const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
  const worker=new Worker(url);
  URL.revokeObjectURL(url);
  session.worker=worker;
  let ready, done;
  const initialized=new Promise(resolve=>ready=resolve);
  session.finished=new Promise(resolve=>done=resolve);
  function fail(reason){session.error=reason;session.cancelled=true;ready();done();}
  worker.onerror=e=>fail(e.message);
  worker.onmessage=({data})=>{
    if(data.type==='ready')ready();
    if(data.type==='error')fail(data.message);
    if(data.type==='end')done();
    if(data.type==='frame'){
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data.rgba.buffer),512,512),0,0);
      session.frames++;el('photo').disabled=false;
      status(session.frames+' image(s) reçue(s).');
    }
  };
  worker.postMessage({type:'init',wasm:WASM_BASE64});
  await initialized;
  if(session.error)throw Error(session.error);
}
function block(s,bytes){
  s.total+=bytes.length;
  if(s.total>MAX_BYTES)throw Error('Limite de la capture atteinte.');
  s.worker.postMessage({type:'block',bytes},[bytes.buffer]);
}
async function drain(s){
  s.worker.postMessage({type:'end'});await s.finished;
  if(s.error)throw Error(s.error);
  status((s.live?'Capture':'Rejeu')+' terminé · '+s.total+' octets · '+s.frames+' image(s).');
}
function finish(s){s.worker?.terminate();active=null;el('bench').checked=false;controls();}
function stop(){if(active){active.cancelled=true;controls();}}
el('stop').onclick=stop;
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
el('bench').onchange=controls;
el('photo').onclick=()=>canvas.toBlob(blob=>{
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='UL10-5E-phantom.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
el('replay').onchange=async e=>{
  const file=e.target.files[0];if(!file||active)return;
  const s=begin(false);
  try{
    if(file.size>MAX_BYTES)throw Error('Le rejeu accepte jusqu’à 16 Mio.');
    await decoder(s);
    const bytes=new Uint8Array(await file.arrayBuffer());
    for(let p=0;p<bytes.length;p+=16384)block(s,bytes.slice(p,p+16384));
    await drain(s);
  }catch(e){status(String(e));}finally{finish(s);el('replay').value='';}
};
async function identity(d,request,value,length,expected){
  const r=await d.controlTransferIn({requestType:'vendor',recipient:'device',request,value,index:0},length);
  if(r.status!=='ok'||r.data?.byteLength!==length||
     !expected.every((v,i)=>r.data.getUint8(i)===v))throw Error('Identité ou firmware incompatible avec le profil UL10-5E.');
}
async function send(d,offset){
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Délai USB dépassé.')),500);
  });
  let r;
  try{r=await Promise.race([d.transferOut(1,plan.subarray(offset,offset+512)),deadline]);}
  finally{clearTimeout(timer);}
  if(r.status!=='ok'||r.bytesWritten!==512)throw Error('Écriture USB incomplète.');
}
async function capture(s,d){
  let touched=false,reading=false,ioError=null;
  const readers=[];
  async function read(endpoint,length){
    try{
      while(reading){
        const r=await d.transferIn(endpoint,length);
        if(r.status!=='ok')throw Error('Lecture USB interrompue.');
        if(reading&&endpoint===1&&r.data?.byteLength)block(s,new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength).slice());
      }
    }catch(e){if(reading){ioError=e;s.cancelled=true;}}
  }
  try{
    await d.open();
    if(d.configuration?.configurationValue!==1)await d.selectConfiguration(1);
    await d.claimInterface(0);
    const alt=d.configuration.interfaces.find(i=>i.interfaceNumber===0)?.alternate;
    for(const [direction,num] of [['in',1],['in',2],['out',1]]){
      if(!alt?.endpoints.some(ep=>ep.direction===direction&&ep.endpointNumber===num&&ep.type==='bulk'))throw Error('Interface USB incompatible.');
    }
    const ascii=str=>Array.from(new TextEncoder().encode(str));
    await identity(d,0xb0,0,8,[...ascii('V1.350'),0,0]);
    await identity(d,0xbb,3,32,[...ascii('B0020007UL10-5E'),...Array(17).fill(255)]);
    await decoder(s);
    if(s.cancelled){status('Capture annulée avant démarrage.');return;}
    reading=true;readers.push(read(1,16384),read(2,512));
    status('Acquisition sur fantôme…');
    for(let p=0;p<plan.length-512&&!s.cancelled;p+=512){
      touched=true;await send(d,p);
    }
    const until=performance.now()+1000;
    while(!s.cancelled&&performance.now()<until)await delay(10);
  }finally{
    try{
      if(touched)await send(d,plan.length-512);
    }catch(e){throw Error('Arrêt USB non confirmé. Débranche la sonde. '+e);}
    finally{
      reading=false;
      if(d.opened)await d.close();
      await Promise.all(readers);
    }
  }
  if(ioError)throw ioError;
  if(s.worker)await drain(s);
}
el('start').onclick=async()=>{
  if(active||!el('bench').checked)return;
  const s=begin(true);
  try{
    const d=await navigator.usb.requestDevice({filters:[{vendorId:0x04b4,productId:0x00f1}]});
    await capture(s,d);
  }catch(e){status(String(e));}finally{finish(s);}
};
controls();
