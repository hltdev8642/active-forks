const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Active GitHub Forks',
    icon: path.join(__dirname, 'favicon.ico'),
  });

  win.loadFile('index.html');

  // Open GitHub links in the default browser instead of a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept in-page navigation to external URLs and open in default browser
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// macOS re-open behaviour (no-op on Windows but harmless)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
