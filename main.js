'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let frontendServer;
let apiServer;
let mainWindow;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function makeFrontendServer(root, getApiBase) {
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); return res.end('Bad request'); }
    if (pathname === '/') pathname = '/index.html';
    const target = path.resolve(root, `.${pathname}`);
    const safeRoot = path.resolve(root) + path.sep;
    if (target !== path.resolve(root, 'index.html') && !target.startsWith(safeRoot)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    fs.readFile(target, (error, data) => {
      if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); return res.end('Not found'); }
      const headers = {
        'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'cache-control': path.basename(target) === 'index.html' ? 'no-store' : 'private, max-age=300'
      };
      if (path.basename(target) === 'index.html') {
        const injected = data.toString('utf8').replace(
          '<head>',
          `<head>\n<script>window.DAYWISE_API_BASE=${JSON.stringify(getApiBase())};</script>`
        );
        res.writeHead(200, headers);
        return res.end(req.method === 'HEAD' ? undefined : injected);
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

async function startLocalServices() {
  const appRoot = app.getAppPath();
  let apiBase = 'http://127.0.0.1';
  frontendServer = makeFrontendServer(appRoot, () => apiBase);
  const frontendPort = await listen(frontendServer, 43817);
  const origin = `http://127.0.0.1:${frontendPort}`;

  // Restrict the local API to this exact app origin before loading the API module.
  process.env.DAYWISE_ALLOWED_ORIGIN = origin;
  process.env.PORT = '0';
  process.env.DAYWISE_DATA_FILE = path.join(app.getPath('userData'), 'data', 'wisedayz-local-db.json');
  delete process.env.DATABASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const { createServer } = require('./server');
  apiServer = createServer({ dataFile: process.env.DAYWISE_DATA_FILE });
  const apiPort = await listen(apiServer);
  apiBase = `http://127.0.0.1:${apiPort}`;
  return origin;
}

async function createWindow() {
  const origin = await startLocalServices();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 650,
    show: false,
    title: 'wisedayZ',
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'assets', 'wisedayz.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(origin);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.wisedayz.desktop');
  try {
    await createWindow();
  } catch (error) {
    console.error('wisedayZ startup failed:', error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'wisedayZ could not start',
      message: 'wisedayZ could not start its local services.',
      detail: error.message
    });
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
});

app.on('before-quit', () => {
  if (frontendServer?.listening) frontendServer.close();
  if (apiServer?.listening) apiServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
