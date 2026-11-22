const plan=Uint8Array.from(atob(PLAN_BASE64),c=>c.charCodeAt(0));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
async function capture(s,d,host){
  let touched=false,reading=false,ioError=null;
  const readers=[];
  async function read(endpoint,length){
    try{
      while(reading){
        const r=await d.transferIn(endpoint,length);
        if(r.status!=='ok')throw Error('Lecture USB interrompue.');
        if(reading&&endpoint===1&&r.data?.byteLength)host.onBytes(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength).slice());
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

    if(s.cancelled)return;
    reading=true;readers.push(read(1,16384),read(2,512));

    for(let p=0;p<plan.length-512&&!s.cancelled;p+=512){
      touched=true;await send(d,p);host.onJournal({operation:'write',ordinal:p/512+1});
    }
    host.onState('Capturing from USB');
    const until=host.seconds===null ? Infinity : performance.now()+1000*host.seconds;
    while(!s.cancelled&&performance.now()<until)await delay(10);
  }finally{
    try{
      if(touched){await send(d,plan.length-512);host.onJournal({operation:'freeze',ordinal:39});}
    }catch(e){throw Error('Arrêt USB non confirmé. Débranche la sonde. '+e);}
    finally{
      reading=false;
      if(d.opened)await d.close();
      await Promise.all(readers);
    }
  }
  if(ioError)throw ioError;

}

export class ProbeUsbCapture {
  constructor(host) {this.host=host;this.state={cancelled:false};}
  start() {
    if (!this.host.phantomReady) throw Error('Confirmez le montage sur fantôme.');
    this.host.onState('Opening USB probe');
    this.done=capture(this.state,this.host.device,this.host);
  }
  stop(){this.state.cancelled=true;}
  disconnect(){this.stop();}
}
