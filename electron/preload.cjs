const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gitthor', {
  info: () => ipcRenderer.invoke('app:info'),
  open: () => ipcRenderer.invoke('repo:open'),
  recent: repo => ipcRenderer.invoke('repo:recent', repo),
  init: () => ipcRenderer.invoke('repo:init'),
  clone: payload => ipcRenderer.invoke('repo:clone', payload),
  snapshot: (repo, limit) => ipcRenderer.invoke('repo:snapshot', repo, limit),
  diff: (repo, payload) => ipcRenderer.invoke('repo:diff', repo, payload),
  mutate: (repo, action, payload) => ipcRenderer.invoke('repo:mutate', repo, action, payload),
  reveal: repo => ipcRenderer.invoke('repo:reveal', repo),
  onCommand: callback => { ipcRenderer.on('app:command', (_event, command) => callback(command)); },
});
