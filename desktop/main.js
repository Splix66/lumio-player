// Lumio Player für Windows und Mac (Electron).
// Lädt dieselbe App wie auf Handy und TV aus dem Ordner "app".
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0a0c11',
    title: 'Lumio Player',
    autoHideMenuBar: true,
    webPreferences: {
      // IPTV-Server erlauben meist keinen Browser-Zugriff (CORS) und nutzen oft http.
      // In der Desktop-App ist das abgeschaltet, damit Anmeldung und Streams funktionieren.
      webSecurity: false,
      contextIsolation: true
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // F11 = Vollbild an/aus
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  // Links nach außen im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
