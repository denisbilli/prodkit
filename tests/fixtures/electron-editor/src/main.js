const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const window = new BrowserWindow({ width: 1200, height: 800 });
  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
