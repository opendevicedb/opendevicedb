import {join} from 'node:path';
import {renderProbe} from '../shared/ultrasound/render.mjs';
export function standaloneHtml(directory) {
  return renderProbe(directory, {
    model:'UC5-2S', heading:'Sonde convexe UC5-2S', id:'uc5-2s-general-depth-v1',
    nativePng:true, filePrefix:'uc5-2s', productId:0x4611, depths:[0,1,2,3,4,5,6,7],
    description:'Fréquence et focus à l’indice 0.',
  }, 'worker-direct.ts', join(directory,'../../components/ultrasound/usb-capture/1.0.0/source.ts'));
}
