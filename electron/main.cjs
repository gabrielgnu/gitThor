const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { GitService } = require('./git-service.cjs');

app.setName('GitThor');
if (process.env.GITTHOR_PROFILE && path.isAbsolute(process.env.GITTHOR_PROFILE)) app.setPath('userData', process.env.GITTHOR_PROFILE);
const git = new GitService();
let window, settings = { recent: [], theme: 'dark' };
const approved = new Set();
const entry = path.join(__dirname, '../src/index.html');
const entryUrl = pathToFileURL(entry).href;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

async function remember(repo) {
  approved.add(repo);
  settings.recent = [repo, ...settings.recent.filter(item => item !== repo)].slice(0, 12);
  const target = settingsPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', JSON.stringify(settings, null, 2));
  await fs.rename(target + '.tmp', target);
  return repo;
}
function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entryUrl) {
      return { ok: false, error: 'Origen no autorizado.' };
    }
    try { return { ok: true, data: await handler(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
function repository(repo) {
  if (!approved.has(repo)) throw new Error('Abrí el repositorio desde el selector de carpetas.');
  return repo;
}
async function folder(title) {
  const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
}
function registerIpc() {
  handle('app:info', async () => ({ version: app.getVersion(), platform: process.platform, recent: settings.recent,
    gitVersion: await require('./git-service.cjs').run(undefined, ['--version']).then(s => s.trim(), e => e.message) }));
  handle('repo:open', async () => { const selected = await folder('Abrir repositorio Git'); return selected ? remember(await git.root(selected)) : null; });
  handle('repo:recent', async repo => {
    if (!settings.recent.includes(repo)) throw new Error('Repositorio desconocido.');
    return remember(await git.root(repo));
  });
  handle('repo:init', async () => { const selected = await folder('Inicializar un repositorio en esta carpeta'); return selected ? remember(await git.init(selected)) : null; });
  handle('repo:clone', async payload => {
    git.remoteUrl(payload.url);
    const parent = await folder('Elegir carpeta de destino para el clon');
    return parent ? remember(await git.clone(payload.url, parent, payload.name)) : null;
  });
  handle('repo:snapshot', (repo, limit) => git.snapshot(repository(repo), limit));
  handle('repo:diff', (repo, payload) => git.diff(repository(repo), payload));
  handle('repo:mutate', (repo, action, payload) => git.mutate(repository(repo), action, payload));
  handle('repo:reveal', repo => shell.openPath(repository(repo)));
}
async function createWindow() {
  window = new BrowserWindow({ width: 1520, height: 960, minWidth: 1080, minHeight: 700,
    backgroundColor: '#111419', title: 'GitThor', icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  const mayWriteClipboard = (wc, permission) => wc === window.webContents && permission === 'clipboard-sanitized-write';
  window.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback(mayWriteClipboard(wc, permission)));
  window.webContents.session.setPermissionCheckHandler(mayWriteClipboard);
  window.webContents.session.setSpellCheckerEnabled(false);
  // Git remotes use the separate Git process. The application UI needs no network.
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Abrir repositorio', accelerator: 'CmdOrCtrl+O', click: () => window.webContents.send('app:command', 'open') },
      { label: 'Clonar repositorio', click: () => window.webContents.send('app:command', 'clone') },
      { type: 'separator' }, { role: 'quit', label: 'Salir' },
    ] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ver', submenu: [{ label: 'Actualizar repositorio', accelerator: 'CmdOrCtrl+R', click: () => window.webContents.send('app:command', 'refresh') }, { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
  await window.loadFile(entry);
}
app.whenReady().then(async () => {
  try { const saved = JSON.parse(await fs.readFile(settingsPath(), 'utf8')); settings.recent = Array.isArray(saved.recent) ? saved.recent.filter(x => typeof x === 'string').slice(0, 12) : []; } catch {}
  registerIpc();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
