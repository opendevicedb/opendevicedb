// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs in an opaque-origin sandbox, receiving only validated scalar messages.
class OdbScalarDisplay extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<style>:host{display:block;font:16px system-ui;color:#eee;padding:20px}output{display:block;font-size:40px;margin:8px 0}small{color:#b8b8ce}</style><strong></strong><output aria-live="polite">Ready</output><small>Waiting for a session</small>';
  }
  update(sample) {
    this.querySelector('strong').textContent = sample.label || 'Measurement';
    this.querySelector('output').textContent = sample.value === null ? 'Stopped' : `${Number(sample.value).toLocaleString(undefined, {maximumFractionDigits: 6})} ${sample.unit}`;
    this.querySelector('small').textContent = sample.value === null ? 'No current measurement' : `${sample.source} · ${new Date(sample.timestamp).toLocaleTimeString()}`;
  }
}
customElements.define('odb-scalar-display', OdbScalarDisplay);
const display = document.createElement('odb-scalar-display');
document.body.append(display);
addEventListener('message', event => {
  if (event.source !== parent || event.data !== 'odb-ui-connect/1' || event.ports.length !== 1) return;
  const port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data?.format !== 'odb.scalar/1' || !(data.value === null || Number.isFinite(data.value)) || typeof data.unit !== 'string' || typeof data.timestamp !== 'number' || typeof data.source !== 'string') return;
    display.update(data);
  };
  port.start();
}, { once: true });
