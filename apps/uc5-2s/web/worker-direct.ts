import {createProbeDecoder} from '../../../packages/components/src/probe/decoder.ts';
let decoder:Awaited<ReturnType<typeof createProbeDecoder>>|undefined;
// Input calls are serialized by the host, bounded to 64KiB. No retained frame list.
self.onmessage=async({data})=>{try{
 let value:any;const started_ms=performance.now();
 if(data.type==='init'){decoder=await createProbeDecoder(data.bytes,undefined,{continuous:true,depthIndex:data.depthIndex});value=decoder.initialized;}
 else if(!decoder)throw Error('Moteur non initialisé');
 else if(data.type==='decodeMessage')value=decoder.decodeMessage(new Uint8Array(data.bytes));
 else if(data.type==='bind')value=decoder.bind(new Uint8Array(data.bytes));
 else if(data.type==='push')value=data.present===false?decoder.advance(new Uint8Array(data.bytes)):decoder.pushRgba(new Uint8Array(data.bytes));
 else if(data.type==='png')value=decoder.encodePng(new Uint8Array(data.bytes));
 else if(data.type==='finish')value=decoder.finishRgba();
 else throw Error('Opération inconnue');
 self.postMessage({id:data.id,value,processing_ms:performance.now()-started_ms,memory_bytes:decoder!.memory.buffer.byteLength},Array.isArray(value)?value.map(f=>f.data):value instanceof Uint8Array?[value.buffer]:[]);
 }catch(e){self.postMessage({id:data.id,error:String(e)});}};
