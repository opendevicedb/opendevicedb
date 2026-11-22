import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {renderProbe} from '../shared/ultrasound/render.mjs';
export function standaloneHtml(directory) {
  const bank = readFileSync(join(directory, 'profile/command-rows.bin'));
  const indices = readFileSync(join(directory, 'profile/command-index.bin'));
  const plan = Buffer.concat(Array.from(indices, row => bank.subarray(row * 512, (row + 1) * 512)));
  return renderProbe(directory, {
    model:'UL10-5E', heading:'Sonde linéaire UL10-5E', id:'ul10-5e-vascular-depth-1',
    filePrefix:'ul10-5e', productId:0x00f1, depths:[1], quickCapture:true, replay:true,
    description:'Profil Vascular à l’indice de profondeur 1.',
  }, 'worker.js', join(directory,'web/transport.js'), {PLAN_BASE64:JSON.stringify(plan.toString('base64'))});
}
