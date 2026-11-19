// Telvo PC-App: gibt der Oberfläche nur die Adresse des lokalen Umpack-Dienstes (remux.js) – sonst nichts.
const { contextBridge } = require('electron');
const arg = (process.argv || []).find((a) => a.indexOf('--telvo-remux=') === 0);
contextBridge.exposeInMainWorld('telvoDesktop', { remux: arg ? arg.slice('--telvo-remux='.length) : '' });
