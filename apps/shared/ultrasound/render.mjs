import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export function renderProbe(app, profile, workerEntry, transport, defines = {}) {
  const directory = join(app, "../shared/ultrasound");
  const bundle = (file, define = {}, alias = {}) => buildSync({
    entryPoints: [file], bundle: true, format: 'iife', platform: 'browser', write: false, define, alias,
  }).outputFiles[0].text;
  const worker = bundle(join(app, 'web', workerEntry));
  const wasm = readFileSync(join(app, 'probe.wasm'));
  const script = bundle(join(directory, 'app-direct.ts'), {
    ...defines, PROBE: JSON.stringify(profile), WORKER_SOURCE: JSON.stringify(worker),
    WASM_BASE64: JSON.stringify(wasm.toString('base64')),
  }, {'probe-transport':transport});
  const depths = profile.depths.map(d => `<option value="${d}">${d}</option>`).join('');
  const settings = profile.depths.length === 1
    ? `<p>Profondeur · indice ${profile.depths[0]}</p>`
    : `<label>Profondeur (indice du profil) <select id="depth">${depths}</select></label><p class="hint">Déconnectez la sonde avant de changer de profondeur.</p>`;
  const duration = profile.quickCapture
    ? '<label>Durée <select id="duration"><option value="1">1 seconde</option><option value="continuous">Jusqu’à déconnexion</option></select></label>'
    : 'Le flux reste actif jusqu’à votre arrêt ou au débranchement de la sonde.';
  const replay = profile.replay
    ? '<section class="panel"><h2>Rejeu</h2><label>Flux DATA brut (16 Mio maximum) <input type="file" id="replay" accept=".bin"></label></section>' : '';
  const values = {MODEL:profile.model, HEADING:profile.heading, SETTINGS:settings, DURATION:duration, REPLAY:replay, PROFILE:profile.description};
  return readFileSync(join(directory,'direct.html'),'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => values[key])
    .replace('<!-- APP -->', () => '<script>' + script.replace(/<\/script/gi,'<\\/script') + '</script>');
}
