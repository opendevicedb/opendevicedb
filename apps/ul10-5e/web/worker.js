let engine;

function result(code) {
  if (code === 0) return null;
  const data = new Uint8Array(engine.memory.buffer, engine.output(), engine.size());
  if (code < 0) throw Error(new TextDecoder().decode(data));
  return data.slice();
}

onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const wasm = Uint8Array.from(atob(data.wasm), c => c.charCodeAt(0));
      const {instance} = await WebAssembly.instantiate(wasm, {});
      engine = instance.exports;
      result(engine.reset());
      postMessage({type:'ready'});
    } else if (data.type === 'block') {
      new Uint8Array(engine.memory.buffer, engine.input(), data.bytes.length).set(data.bytes);
      const rgba = result(engine.push(data.bytes.length));
      if (rgba) postMessage({type:'frame', rgba}, [rgba.buffer]);
    } else if (data.type === 'end') {
      postMessage({type:'end'});
    }
  } catch (error) {
    postMessage({type:'error', message:String(error)});
  }
};
