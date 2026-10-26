const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { GitService, run, sanitizeError } = require('../electron/git-service.cjs');
const root = path.resolve(__dirname, '..');
const exists = file => fs.access(file).then(() => true, () => false);

async function temporary(prefix, fn) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try { return await fn(folder); }
  finally { if (path.dirname(folder) === os.tmpdir() && path.basename(folder).startsWith(prefix)) await fs.rm(folder, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
}

test('Git rejects traversal, option injection and unsupported operations without changing the index', async () => temporary('gitthor-sec-path-', async folder => {
  const git = new GitService(), repo = await git.init(folder);
  await fs.writeFile(path.join(repo, 'safe.txt'), 'safe');
  for (const file of ['../private.txt', 'sub/../../private.txt', '..\\private.txt', '/etc/passwd', 'C:\\private.txt', '\\private.txt', 'safe\0.txt']) {
    await assert.rejects(git.mutate(repo, 'stage', { paths: [file] }));
    await assert.rejects(git.diff(repo, { path: file }));
  }
  await assert.rejects(git.mutate(repo, 'stage', { paths: ['*'] }));
  await assert.rejects(git.mutate(repo, 'stage', { paths: [':(glob)**'] }));
  for (const branch of ['--help', '-c', 'a..b', 'main@{0}', 'branch name']) await assert.rejects(git.mutate(repo, 'checkout', { branch }));
  await assert.rejects(git.diff(repo, { commit: '--output=outside.txt' }));
  await assert.rejects(git.mutate(repo, 'exec', { command: 'anything' }));
  assert.equal(await run(repo, ['diff', '--cached', '--name-only']), '');
  assert.equal(await fs.readFile(path.join(repo, 'safe.txt'), 'utf8'), 'safe');
}));

test('Git passes shell metacharacters as literal commit text and handles filenames beginning with a dash', async () => temporary('gitthor-sec-shell-', async folder => {
  const git = new GitService(), repo = await git.init(folder), marker = path.join(folder, 'EXECUTED');
  await run(repo, ['config', 'user.name', 'Security test']); await run(repo, ['config', 'user.email', 'security@example.invalid']);
  await run(repo, ['config', 'commit.gpgsign', 'false']); await run(repo, ['config', 'core.hooksPath', path.join(folder, 'no-hooks')]);
  await fs.writeFile(path.join(repo, '-file.txt'), 'safe'); await git.mutate(repo, 'stage', { paths: ['-file.txt'] });
  const message = `literal "; echo PWNED > "${marker}" & $(touch marker) \`whoami\``;
  await git.mutate(repo, 'commit', { message });
  assert.equal((await git.snapshot(repo)).commits[0].subject, message);
  assert.equal(await exists(marker), false); assert.equal(await exists(path.join(repo, 'marker')), false);
}));

test('Git disables external diff, textconv, fsmonitor and ext transport even when configured locally', async () => temporary('gitthor-sec-helper-', async folder => {
  const git = new GitService(), repo = await git.init(folder), marker = path.join(folder, 'HELPER_EXECUTED');
  const helper = path.join(folder, 'helper.cjs');
  await fs.writeFile(helper, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  const command = `"${process.execPath.replace(/\\/g, '/')}" "${helper.replace(/\\/g, '/')}"`;
  await run(repo, ['config', 'user.name', 'Security test']); await run(repo, ['config', 'user.email', 'security@example.invalid']);
  await run(repo, ['config', 'commit.gpgsign', 'false']); await run(repo, ['config', 'core.hooksPath', path.join(folder, 'no-hooks')]);
  await fs.writeFile(path.join(repo, 'file.txt'), 'before\n'); await git.mutate(repo, 'stage', { paths: ['file.txt'] }); await git.mutate(repo, 'commit', { message: 'base' });
  await fs.writeFile(path.join(repo, 'file.txt'), 'after\n'); await fs.writeFile(path.join(repo, '.gitattributes'), '*.txt diff=probe\n');
  await run(repo, ['config', 'diff.external', command]); await run(repo, ['config', 'diff.probe.textconv', command]); await run(repo, ['config', 'core.fsmonitor', command]);
  assert.match(await git.diff(repo, { path: 'file.txt' }), /\+after/);
  await git.snapshot(repo);
  await run(repo, ['config', 'protocol.ext.allow', 'always']); await run(repo, ['remote', 'add', 'untrusted', 'ext::' + command]);
  await assert.rejects(git.mutate(repo, 'fetch'), /transport 'ext' not allowed/);
  assert.equal(await exists(marker), false);
}));

test('new remotes reject executable transports and embedded credentials; clone rejects reserved names', async () => {
  const git = new GitService();
  for (const url of ['ext::sh payload', 'file:///outside', 'javascript:payload', '--upload-pack=payload', 'https://person:SECRET@example.invalid/repo', 'https://TOKEN@example.invalid/repo', 'ssh://git:SECRET@example.invalid/repo', 'https://example.invalid/repo?access_token=SECRET', 'https://example.invalid/repo?API_KEY=SECRET']) assert.throws(() => git.remoteUrl(url));
  for (const url of ['https://example.invalid/repo.git', 'ssh://git@example.invalid/repo.git', 'git@example.invalid:repo.git']) assert.equal(git.remoteUrl(url), url);
  for (const name of ['..', 'CON', 'nul.txt', 'COM1', 'LPT9.any', 'folder.', 'folder ']) await assert.rejects(git.clone('https://example.invalid/repo.git', os.tmpdir(), name), /carpeta inválido/);
});

test('errors redact URL userinfo, query secrets and Authorization headers, including real Git failures', async () => temporary('gitthor-sec-error-', async repo => {
  const samples = [
    'https://user:SECRET@example.invalid/private', 'https://SECRET@example.invalid/private',
    'ssh://git:SECRET@example.invalid/private',
    'https://example.invalid/repo?access_token=SECRET&token=SECRET&password=SECRET&api_key=SECRET',
    'Authorization: Basic SECRET', 'Authorization: Bearer SECRET',
  ];
  for (const message of samples) assert.equal(sanitizeError(message).includes('SECRET'), false);
  await new GitService().init(repo);
  await assert.rejects(run(repo, ['remote', 'get-url', samples[0]]), error => !error.message.includes('SECRET') && error.message.includes('[credenciales]'));
}));

test('untracked previews cannot read through a link outside the chosen repository', async () => temporary('gitthor-sec-link-', async folder => {
  const repo = path.join(folder, 'repo'), outside = path.join(folder, 'outside'); await fs.mkdir(repo); await fs.mkdir(outside);
  const git = new GitService(); await git.init(repo); await fs.writeFile(path.join(outside, 'private.txt'), 'OUTSIDE_CANARY');
  let target;
  if (process.platform === 'win32') { await fs.symlink(outside, path.join(repo, 'escape'), 'junction'); target = 'escape/private.txt'; }
  else { await fs.symlink(path.join(outside, 'private.txt'), path.join(repo, 'escape')); target = 'escape'; }
  await assert.rejects(git.diff(repo, { path: target }), error => !error.message.includes('OUTSIDE_CANARY'));
}));

async function mainHarness(folder) {
  const handlers = new Map(), events = new Map(), session = {}, calls = [];
  let window; let onLoaded;
  const loaded = new Promise(resolve => onLoaded = resolve);
  class FakeGit {
    async root(repo) { return repo; }
    async snapshot(repo) { calls.push(repo); return { repo }; }
    async mutate() { calls.push('mutate'); }
  }
  const electron = {
    app: { setName() {}, whenReady: () => Promise.resolve(), getPath: () => folder, getVersion: () => 'test', on() {} },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [folder] }) },
    Menu: { setApplicationMenu() {}, buildFromTemplate: value => value }, shell: { openPath: async () => '' },
    BrowserWindow: class {
      constructor(options) {
        this.options = options; this.webContents = { mainFrame: { url: '' }, session,
          setWindowOpenHandler: callback => this.popup = callback,
          on: (name, callback) => events.set(name, callback), send() {} }; window = this;
      }
      async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; onLoaded(); }
    },
  };
  session.setPermissionRequestHandler = callback => session.request = callback;
  session.setPermissionCheckHandler = callback => session.check = callback;
  session.setSpellCheckerEnabled = enabled => session.spelling = enabled;
  session.webRequest = { onBeforeRequest: (filter, callback) => session.network = { filter, callback } };
  vm.runInNewContext(await fs.readFile(path.join(root, 'electron/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === './git-service.cjs' ? { GitService: FakeGit, run: async () => 'git test' } : require(name),
    __dirname: path.join(root, 'electron'), process: { env: {}, platform: process.platform },
  });
  await loaded;
  return { window, handlers, events, session, calls,
    event: () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame }) };
}

test('main process denies IPC from foreign windows, frames and URLs and rejects unopened repositories', async () => temporary('gitthor-sec-ipc-', async folder => {
  const h = await mainHarness(folder), snapshot = h.handlers.get('repo:snapshot');
  for (const event of [{ sender: {}, senderFrame: h.window.webContents.mainFrame }, { sender: h.window.webContents, senderFrame: {} }, { sender: h.window.webContents, senderFrame: null }]) assert.equal((await snapshot(event, folder)).ok, false);
  const frame = h.window.webContents.mainFrame; const original = frame.url; frame.url = 'https://example.invalid/';
  assert.equal((await snapshot(h.event(), folder)).ok, false); frame.url = original;
  assert.equal((await snapshot(h.event(), path.join(folder, 'unopened'))).ok, false);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.handlers.get('repo:open')(h.event())).ok, true);
  assert.equal((await snapshot(h.event(), folder)).ok, true); assert.deepEqual(h.calls, [folder]);
}));

test('main process denies web traffic, sensitive permissions, popups and navigation', async () => temporary('gitthor-sec-policy-', async folder => {
  const h = await mainHarness(folder);
  for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'usb', 'serial']) {
    assert.equal(h.session.check(h.window.webContents, permission), false);
    let granted; h.session.request(h.window.webContents, permission, value => granted = value); assert.equal(granted, false);
  }
  assert.equal(h.session.check(h.window.webContents, 'clipboard-sanitized-write'), true);
  assert.equal(h.session.check({}, 'clipboard-sanitized-write'), false);
  assert.equal(h.window.popup({ url: 'https://example.invalid/' }).action, 'deny');
  let prevented = false; h.events.get('will-navigate')({ preventDefault: () => prevented = true }); assert.equal(prevented, true);
  let decision; h.session.network.callback({ url: 'https://example.invalid/' }, value => decision = value); assert.equal(decision.cancel, true);
  assert.equal(h.window.options.webPreferences.spellcheck, false);
  assert.equal(h.session.spelling, false);
  assert.equal(h.window.options.webPreferences.sandbox, true); assert.equal(h.window.options.webPreferences.nodeIntegration, false);
}));

test('preload exposes only intended operations and does not leak the IPC event', async () => {
  let exposed, listener; const invoked = [];
  vm.runInNewContext(await fs.readFile(path.join(root, 'electron/preload.cjs'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => exposed = value },
      ipcRenderer: { invoke: (...args) => { invoked.push(args); }, on: (_channel, callback) => listener = callback } }),
  });
  assert.deepEqual(Object.keys(exposed).sort(), ['clone', 'diff', 'info', 'init', 'mutate', 'onCommand', 'open', 'recent', 'reveal', 'snapshot'].sort());
  let received; exposed.onCommand((...args) => received = args); listener({ sender: 'privileged' }, 'refresh'); assert.deepEqual(received, ['refresh']);
  exposed.info(); assert.deepEqual(invoked, [['app:info']]);
});
