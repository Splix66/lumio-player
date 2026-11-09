// Telvo Player für Windows und Mac (Electron).
// Lädt dieselbe App wie auf Handy und TV aus dem Ordner "app".
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Videos über die Grafikkarte abspielen und skalieren (schärfer und flüssiger, auch auf 2K/4K-Monitoren mit 144/240 Hz).
// Laptops mit zwei Grafikchips nutzen dafür den stärkeren.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0b0a1a',
    title: 'Telvo Player',
    autoHideMenuBar: true,
    webPreferences: {
      // IPTV-Server erlauben meist keinen Browser-Zugriff (CORS) und nutzen oft http.
      // In der Desktop-App ist das abgeschaltet, damit Anmeldung und Streams funktionieren.
      webSecurity: false,
      contextIsolation: true,
      // Sicherheit: kein Node.js in der Oberfläche, Renderer in der Sandbox
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Nur Links mit http/https dürfen nach außen (andere Schemata wie file:, smb: oder
  // ms-…: könnten sonst Programme auf dem PC starten).
  function isWebUrl(url) {
    try { return /^https?:$/.test(new URL(url).protocol); } catch (e) { return false; }
  }

  // Das App-Fenster selbst bleibt immer in der App. Fremde Seiten öffnen im normalen Browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (isWebUrl(url)) shell.openExternal(url);
  });

  // Keine Kamera-, Mikrofon- oder Standortabfragen – nur Vollbild ist erlaubt
  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'fullscreen');
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
    if (isWebUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
