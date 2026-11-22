import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// Embed the worker and WASM so a saved copy runs offline too.
export function standaloneHtml(directory) {
  const bundle = (entry, define = {}) => buildSync({
    entryPoints: [join(directory, 'web', entry)], bundle: true,
    format: 'iife', platform: 'browser', write: false, define,
  }).outputFiles[0].text;
  const worker = bundle('worker.js');
  const wasm = readFileSync(join(directory, 'probe.wasm'));
  const bank = readFileSync(join(directory, 'profile/command-rows.bin'));
  const indices = readFileSync(join(directory, 'profile/command-index.bin'));
  const plan = Buffer.concat(Array.from(indices, row => bank.subarray(row * 512, (row + 1) * 512)));
  const app = bundle('app.js', {
    PLAN_BASE64: JSON.stringify(plan.toString("base64")), WORKER_SOURCE: JSON.stringify(worker), WASM_BASE64: JSON.stringify(wasm.toString('base64')),
  });
  return readFileSync(join(directory, 'web/index.html'), 'utf8')
    .replace('<!-- APP -->', () => '<script>' + app.replace(/<\/script/gi, '<\\/script') + '</script>');
}
