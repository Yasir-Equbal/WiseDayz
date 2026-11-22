'use strict';

const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

let frontendServer;
let apiServer;
let mainWindow;
let downloadedInstaller = null;

const GITHUB_OWNER = 'Yasir-Equbal';
const GITHUB_REPO = 'WiseDayz';
const GITHUB_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
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

function requestBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'wisedayZ-desktop-updater', 'Accept': 'application/vnd.github+json' },
      timeout: 30000
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects while contacting GitHub.'));
        return resolve(requestBuffer(new URL(response.headers.location, url).toString(), redirects - 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`GitHub returned HTTP ${response.statusCode}.`));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Update request timed out.')));
    req.on('error', reject);
  });
}

function compareVersions(a, b) {
  const parse = value => String(value).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(x => Number.parseInt(x, 10) || 0);
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  const data = JSON.parse((await requestBuffer(GITHUB_RELEASE_API)).toString('utf8'));
  if (data.draft || data.prerelease) throw new Error('The latest GitHub release is not a stable release.');
  const currentVersion = app.getVersion();
  const latestVersion = String(data.tag_name || '').replace(/^v/i, '');
  if (!latestVersion) throw new Error('GitHub release does not contain a version tag.');
  const asset = (data.assets || []).find(item =>
    /^wisedayz-setup-.*\.exe$/i.test(item.name) && item.browser_download_url
  );
  if (compareVersions(latestVersion, currentVersion) > 0 && !asset) {
    throw new Error('A newer release exists, but its Windows installer asset was not found.');
  }
  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseName: data.name || `wisedayZ ${latestVersion}`,
    releaseUrl: data.html_url,
    assetName: asset?.name || null,
    downloadUrl: asset?.browser_download_url || null
  };
}

async function downloadInstaller() {
  const release = await checkForUpdates();
  if (!release.updateAvailable || !release.downloadUrl) throw new Error('No newer installer is available.');
  const buffer = await requestBuffer(release.downloadUrl);
  // Basic sanity check: a Windows installer must be an executable, not an HTML error page.
  if (buffer.length < 1024 * 1024 || buffer.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('The downloaded file does not look like a valid Windows installer.');
  }
  const destination = path.join(app.getPath('temp'), `wisedayZ-Setup-${release.latestVersion}.exe`);
  await fs.promises.writeFile(destination, buffer, { mode: 0o700 });
  downloadedInstaller = destination;
  return { fileName: release.assetName, path: destination, bytes: buffer.length };
}

function installDownloadedUpdate() {
  if (!downloadedInstaller || !fs.existsSync(downloadedInstaller)) {
    throw new Error('Download the update before installing it.');
  }
  if (process.platform !== 'win32') throw new Error('The installer is currently available for Windows only.');
  const installer = downloadedInstaller;
  const child = spawn(installer, [], { detached: true, stdio: 'ignore' });
  child.once('error', error => {
    console.error('Could not launch wisedayZ installer:', error);
    dialog.showErrorBox('Update could not start', error.message);
  });
  child.unref();
  app.quit();
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

function registerUpdaterIpc() {
  ipcMain.handle('wisedayz-updater:check', async event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized update request.');
    return checkForUpdates();
  });
  ipcMain.handle('wisedayz-updater:download', async event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized update request.');
    return downloadInstaller();
  });
  ipcMain.handle('wisedayz-updater:install', async event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized update request.');
    return installDownloadedUpdate();
  });
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
      preload: path.join(app.getAppPath(), 'preload.js'),
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
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(origin);
}

registerUpdaterIpc();
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
