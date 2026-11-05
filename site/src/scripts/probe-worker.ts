import { createProbeDecoder, validateResources } from "@opendevicedb/components/probe-decoder";
let decoder:Awaited<ReturnType<typeof createProbeDecoder>>|undefined;
let chain=Promise.resolve();
self.onmessage=({data})=>{chain=chain.then(async()=>{
 try{
  let value:any;
  if(data.type==="init"){decoder=await createProbeDecoder(data.bytes,data.resources?await validateResources(data.resources):undefined,data.options);value=decoder.initialized;}
  else if(!decoder)throw Error("Decoder is not initialized");
  else if(data.type==="decode-message")value=decoder.decodeMessage(new Uint8Array(data.bytes));
  else if(data.type==="bind")value=decoder.bind(new Uint8Array(data.bytes));
  else if(data.type==="push")value=decoder.push(new Uint8Array(data.bytes));
  else if(data.type==="finish")value=decoder.finish();
  else throw Error("Unknown decoder operation");
  const transfers=Array.isArray(value)?value.map(f=>f.data):[];
  self.postMessage({id:data.id,ok:true,value},transfers);
 }catch(e){self.postMessage({id:data.id,ok:false,error:(e as Error).message});}
 });};
