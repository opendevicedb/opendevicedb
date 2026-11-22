// SPDX-License-Identifier: AGPL-3.0-or-later
// Source-independent PNG frame viewer. Runs without camera, USB or network permission.
class OdbVideoViewer extends HTMLElement {
  connectedCallback() {
    if (this.hasAttribute('embedded')) {
      if (!this.querySelector('canvas')) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        canvas.setAttribute('aria-label', 'Image échographique');
        this.append(canvas);
      }
      return;
    }
    this.innerHTML = '<style>odb-video-viewer{display:flex;flex-direction:column;box-sizing:border-box;height:100%;padding:12px;font:15px system-ui;color:#eee;background:#090b13}canvas{width:100%;height:100%;min-height:0;object-fit:contain;background:#000;flex:1}p{margin:8px 0 0}small{color:#bec5d6}</style><canvas aria-label="Video frame"></canvas><p role="status">Waiting for an image</p><small>Uncalibrated preview</small>';
  }
  showRgba(data, width, height) {
    if (!(data instanceof ArrayBuffer) || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width > 2048 || height > 2048 || data.byteLength !== width * height * 4) {
      throw Error('Invalid RGBA frame');
    }
    const canvas = this.querySelector('canvas');
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  }
  snapshot() {
    return new Promise((resolve, reject) => this.querySelector('canvas').toBlob(blob =>
      blob ? resolve(blob) : reject(Error('PNG unavailable')), 'image/png'));
  }
  async showFrame(frame) {
    if (frame?.format !== 'odb.video.frame/1' || frame.encoding !== 'image/png' || !(frame.data instanceof ArrayBuffer) || frame.data.byteLength > 8388608 || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 2048 || frame.height > 2048) throw Error('Invalid video frame');
    const image = await createImageBitmap(new Blob([frame.data], {type:'image/png'}));
    try {
      if (image.width !== frame.width || image.height !== frame.height) throw Error('Frame dimensions differ from metadata');
      const canvas = this.querySelector('canvas'); canvas.width = image.width; canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      if (this.querySelector('p')) this.querySelector('p').textContent = `${frame.mode === 'replay' ? 'Recorded replay' : frame.mode === 'live' ? 'Live preview' : 'Last acquired image'} · frame ${frame.sequence}`;
      if (this.querySelector('small')) this.querySelector('small').textContent = `${image.width} × ${image.height} · ${frame.profile === 'unknown' ? 'Probe not identified · ' : ''}Uncalibrated preview`;
    } finally { image.close(); }
  }
}
customElements.define('odb-video-viewer', OdbVideoViewer);
// The isolated component host supplies a MessagePort. Embedded viewers already
// have a host and do not need the iframe layout or a message listener.
if (!document.querySelector('odb-video-viewer[embedded]')) {
  function connect(event) {
    if (event.source !== parent || event.data !== 'odb-ui-connect/1' || event.ports.length !== 1) return;
    removeEventListener('message', connect);
    const viewer = document.createElement('odb-video-viewer');
    document.body.style.cssText = 'margin:0;height:100vh';
    document.body.append(viewer);
    const port = event.ports[0];
    port.onmessage = async ({data}) => {
      try {
        await viewer.showFrame(data);
        port.postMessage({type:'odb-video-rendered/1', session:data.session, sequence:data.sequence});
      } catch {
        port.postMessage({type:'odb-video-error/1'});
      }
    };
    port.start();
  }
  addEventListener('message', connect);
}
