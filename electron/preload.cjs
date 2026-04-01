const { contextBridge, shell, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => shell.openExternal(url),

  getConnectionConfig: () => ipcRenderer.invoke('app:get-connection-config'),
  saveConnectionConfig: (payload) => ipcRenderer.invoke('app:save-connection-config', payload),

  getDbRuntimeConfig: () => ipcRenderer.invoke('app:get-db-runtime-config'),
  saveDbRuntimeConfig: (payload) => ipcRenderer.invoke('app:save-db-runtime-config', payload),
  clearDbRuntimeConfig: () => ipcRenderer.invoke('app:clear-db-runtime-config'),

  isInitialSetupRequired: () => ipcRenderer.invoke('app:is-initial-setup-required'),

  testDbConnection: (payload) => ipcRenderer.invoke('app:test-db-connection', payload),
  runDatabaseSetup: (payload) => ipcRenderer.invoke('app:run-database-setup', payload),

  openConnectionSetup: () => ipcRenderer.invoke('app:open-connection-setup'),
  testCurrentDbConnection: () => ipcRenderer.invoke('app:test-current-db-connection'),

  relaunchApp: () => ipcRenderer.invoke('app:relaunch-app'),
  importActivationFile: () => ipcRenderer.invoke('app:import-activation-file')
});