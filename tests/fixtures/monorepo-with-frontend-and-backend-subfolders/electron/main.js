const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('about:blank');
}

app.whenReady().then(createWindow);
