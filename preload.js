const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: data => ipcRenderer.invoke('save', data),
  displays: () => ipcRenderer.invoke('displays'),
  pick: kind => ipcRenderer.invoke('pick', kind),
  importDeck: src => ipcRenderer.invoke('importDeck', src),
  removeDeck: dir => ipcRenderer.invoke('removeDeck', dir),
  live: state => ipcRenderer.send('live', state),
  onStatus: fn => ipcRenderer.on('status', (_e, s) => fn(s)),
  onState: fn => ipcRenderer.on('state', (_e, s) => fn(s)),
});
