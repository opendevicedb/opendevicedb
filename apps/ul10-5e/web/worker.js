let engine, sequence = 0;
function check(code) {
  if (code < 0) throw Error(new TextDecoder().decode(new Uint8Array(engine.memory.buffer,engine.output(),engine.size())));
}
onmessage = async ({data}) => {
  const started = performance.now();
  try {
    const frames = [];
    if (data.type === 'init') {
      const {instance} = await WebAssembly.instantiate(data.bytes, {});
      engine = instance.exports;
      check(engine.reset());
    } else if (data.type === 'push') {
      for (let offset=0; offset<data.bytes.length; offset+=16384) {
        const chunk=data.bytes.subarray(offset,offset+16384);
        new Uint8Array(engine.memory.buffer,engine.input(),chunk.length).set(chunk);
        const result=data.present===false ? engine.advance(chunk.length) : engine.push(chunk.length);
        check(result);
        if (result) {
          const pixels=new Uint8Array(engine.memory.buffer,engine.output(),engine.size()).slice();
          frames.push({sequence:++sequence,data:pixels.buffer});
        }
      }
    } else if(data.type!=='finish') throw Error('Opération inconnue');
    postMessage({id:data.id,value:frames,memory_bytes:engine.memory.buffer.byteLength,processing_ms:performance.now()-started},frames.map(f=>f.data));
  } catch(error) { postMessage({id:data.id,error:String(error)}); }
};
