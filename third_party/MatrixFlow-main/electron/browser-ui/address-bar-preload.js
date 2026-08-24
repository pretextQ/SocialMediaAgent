const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  navigate(action, url) {
    if (action === 'url' && url) {
      ipcRenderer.send('browser-address:navigate', { url });
    } else {
      ipcRenderer.send(`browser-address:${action}`);
    }
  },

  openDevTools() {
    ipcRenderer.send('browser-address:open-devtools');
  },

  onUrlChange(callback) {
    ipcRenderer.on('browser-address:url-change', (_, url) => callback(url));
  },

  onNavigationState(callback) {
    ipcRenderer.on('browser-address:navigation-state', (_, canBack, canForward) => {
      callback(canBack, canForward);
    });
  },

  onLoadingState(callback) {
    ipcRenderer.on('browser-address:loading-state', (_, isLoading) => callback(isLoading));
  },
});