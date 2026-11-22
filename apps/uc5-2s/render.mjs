import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// Embed the worker and WASM so a saved copy runs offline too.
export function standaloneHtml(directory) {
  const bundle = (entry, define = {}) => buildSync({
    entryPoints: [join(directory, 'web', entry)], bundle: true,
    format: 'iife', platform: 'browser', write: false, define,
  }).outputFiles[0].text;
  const worker = bundle('worker-direct.ts');
  const wasm = readFileSync(join(directory, 'probe.wasm'));
  const app = bundle('app-direct.ts', {
    WORKER_SOURCE: JSON.stringify(worker), WASM_BASE64: JSON.stringify(wasm.toString('base64')),
  });
  return readFileSync(join(directory, 'web/direct.html'), 'utf8')
    .replace('<!-- APP -->', () => '<script>' + app.replace(/<\/script/gi, '<\\/script') + '</script>');
}
