const { app, BrowserWindow } = require('electron')
const express = require('express')

// The in-process proxy the composed requests are sent through. It listens on
// localhost for this window and nothing else.
const proxy = express()
proxy.listen(0)

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1200, height: 800 })
  win.loadFile('index.html')
})
