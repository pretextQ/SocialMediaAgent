const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  navigate(action, panelId, url) {
    if (action === 'url' && panelId && url) {
      ipcRenderer.send('panel-address:navigate', { panelId, url });
    } else if (panelId) {
      ipcRenderer.send(`panel-address:${action}`, { panelId });
    }
  },

  openDevTools(panelId) {
    ipcRenderer.send('panel-address:open-devtools', { panelId });
  },

  onUrlChange(callback) {
    ipcRenderer.on('panel-address:url-change', (_, panelId, url) => callback(panelId, url));
  },

  onNavigationState(callback) {
    ipcRenderer.on('panel-address:navigation-state', (_, panelId, canBack, canForward) => {
      callback(panelId, canBack, canForward);
    });
  },

  onLoadingState(callback) {
    ipcRenderer.on('panel-address:loading-state', (_, panelId, isLoading) => callback(panelId, isLoading));
  },
});
