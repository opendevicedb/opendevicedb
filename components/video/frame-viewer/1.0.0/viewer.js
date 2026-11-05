// SPDX-License-Identifier: AGPL-3.0-or-later
// Source-independent PNG frame viewer. Runs without camera, USB or network permission.
class OdbVideoViewer extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<style>odb-video-viewer{display:flex;flex-direction:column;box-sizing:border-box;height:100%;padding:12px;font:15px system-ui;color:#eee;background:#090b13}canvas{width:100%;height:100%;min-height:0;object-fit:contain;background:#000;flex:1}p{margin:8px 0 0}small{color:#bec5d6}</style><canvas aria-label="Video frame"></canvas><p role="status">Waiting for an image</p><small>Uncalibrated preview</small>';
  }
  async showFrame(frame) {
    if (frame?.format !== 'odb.video.frame/1' || frame.encoding !== 'image/png' || !(frame.data instanceof ArrayBuffer) || frame.data.byteLength > 8388608 || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 2048 || frame.height > 2048) throw Error('Invalid video frame');
    const image = await createImageBitmap(new Blob([frame.data], {type:'image/png'}));
    try {
      if (image.width !== frame.width || image.height !== frame.height) throw Error('Frame dimensions differ from metadata');
      const canvas = this.querySelector('canvas'); canvas.width = image.width; canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      this.querySelector('p').textContent = `${frame.mode === 'replay' ? 'Recorded replay' : frame.mode === 'live' ? 'Live preview' : 'Last acquired image'} · frame ${frame.sequence}`;
      this.querySelector('small').textContent = `${image.width} × ${image.height} · ${frame.profile === 'unknown' ? 'Probe not identified · ' : ''}Uncalibrated preview`;
    } finally { image.close(); }
  }
}
customElements.define('odb-video-viewer', OdbVideoViewer);
const viewer = document.createElement('odb-video-viewer'); document.body.style.cssText = 'margin:0;height:100vh'; document.body.append(viewer);
addEventListener('message', event => {
  if (event.source !== parent || event.data !== 'odb-ui-connect/1' || event.ports.length !== 1) return;
  const port = event.ports[0];
  port.onmessage = async ({data}) => {
    try { await viewer.showFrame(data); port.postMessage({type:'odb-video-rendered/1', session:data.session, sequence:data.sequence}); }
    catch { port.postMessage({type:'odb-video-error/1'}); }
  }; port.start();
}, {once:true});
