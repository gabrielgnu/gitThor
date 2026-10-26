// Real Electron window, isolated profile, synthetic repository and localhost canary.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { GitService, run } = require('../electron/git-service.cjs');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gitthor-security-ui-'));
  const checks = [], requests = [];
  let app;
  const server = http.createServer((request, response) => { requests.push(request.url); response.end('canary'); });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/canary`;
    const repo = path.join(temp, 'repo'), profile = path.join(temp, 'profile');
    await fs.mkdir(repo); await fs.mkdir(profile);
    const git = new GitService(), root = await git.init(repo);
    for (const [key, value] of [['user.name', 'Security fixture'], ['user.email', 'security@example.invalid'], ['commit.gpgsign', 'false'], ['core.hooksPath', path.join(temp, 'no-hooks')]]) await run(root, ['config', key, value]);
    const markup = `<img src="${url}" onerror="window.__gitthorXss=1">`;
    const subject = 'Security \x1e\x1f ' + markup;
    await fs.writeFile(path.join(repo, 'attack.txt'), 'base\n');
    await git.mutate(root, 'stage', { paths: ['attack.txt'] }); await git.mutate(root, 'commit', { message: subject + '\n\nLocal fixture only.' });
    await fs.writeFile(path.join(repo, 'attack.txt'), `</pre><script>window.__gitthorXss=1</script>${markup}\nLOCAL_DIFF_CANARY\n`);
    await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ recent: [root] }));
    const env = { ...process.env, GITTHOR_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    const executablePath = process.env.GITTHOR_EXECUTABLE;
    app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [path.resolve(__dirname, '..')]), ...process.argv.slice(2)], env, timeout: 60000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(20000);
    const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.locator('.recent-item').first().click(); await page.locator('#workspace').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.body.classList.contains('busy'));
    async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }

    await check('Commit metadata and diffs remain inert text, including control separators', async () => {
      assert.equal(await page.locator('.commit-row').count(), 1);
      assert.equal(await page.locator('.commit-row .subject').textContent(), subject);
      assert.equal(await page.locator('.commit-row img, .commit-row script').count(), 0);
      await page.locator('#unstaged-files .file-open').first().click();
      await page.waitForFunction(() => document.querySelectorAll('#diff-content .diff-line').length > 0);
      assert.match(await page.locator('#diff-content').textContent(), /LOCAL_DIFF_CANARY/);
      assert.equal(await page.locator('#diff-content img, #diff-content script').count(), 0);
      assert.equal(await page.evaluate(() => window.__gitthorXss), undefined);
    });
    await check('Renderer has no Node or raw IPC; unopened repositories are rejected', async () => {
      assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process, typeof window.ipcRenderer]), ['undefined', 'undefined', 'undefined']);
      const response = await page.evaluate(repo => window.gitthor.snapshot(repo), path.join(temp, 'unopened'));
      assert.equal(response.ok, false); assert.match(response.error, /selector de carpetas/);
    });
    await check('IPC from a foreign window is denied even with the application preload', async () => {
      const response = await app.evaluate(async ({ BrowserWindow }, { preload, repo }) => {
        const foreign = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
        try {
          await foreign.loadURL('data:text/html,<title>Security fixture</title>');
          return await foreign.webContents.executeJavaScript(`window.gitthor.snapshot(${JSON.stringify(repo)})`);
        } finally { foreign.destroy(); }
      }, { preload: path.resolve(__dirname, '../electron/preload.cjs'), repo: root });
      assert.equal(response.ok, false); assert.equal(response.error, 'Origen no autorizado.');
    });
    await check('CSP blocks inline scripts and renderer network requests', async () => {
      assert.equal(await page.evaluate(() => { window.__inlineRan = 0; const script = document.createElement('script'); script.textContent = 'window.__inlineRan=1'; document.head.append(script); return window.__inlineRan; }), 0);
      const sent = await page.evaluate(async url => { try { await fetch(url); return true; } catch { return false; } }, url);
      assert.equal(sent, false); assert.equal(requests.length, 0);
    });
    await check('Electron session blocks HTTP before the local canary receives it', async () => {
      const sent = await app.evaluate(async ({ BrowserWindow }, url) => {
        try { await BrowserWindow.getAllWindows()[0].webContents.session.fetch(url); return true; } catch { return false; }
      }, url);
      assert.equal(sent, false); assert.equal(requests.length, 0);
    });
    await check('Notifications denied, renderer isolated and dictionary downloads disabled', async () => {
      assert.equal(await page.evaluate(() => Notification.requestPermission()), 'denied');
      const p = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
      assert.equal(p.nodeIntegration, false); assert.equal(p.contextIsolation, true); assert.equal(p.sandbox, true); assert.equal(p.webSecurity, true);
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.isSpellCheckerEnabled()), false);
    });
    await check('Settings store only recent local paths and theme, without repository content', async () => {
      await page.locator('#theme-toggle').click();
      const settings = JSON.parse(await fs.readFile(path.join(profile, 'settings.json'), 'utf8'));
      assert.deepEqual(Object.keys(settings).sort(), ['recent', 'theme']); assert.deepEqual(settings.recent, [root]);
      assert.equal(JSON.stringify(settings).includes('LOCAL_DIFF_CANARY'), false);
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ['gitthor-theme']);
      assert.deepEqual(pageErrors, []); assert.equal(requests.length, 0);
    });
    // A canceled navigation can remain pending in Playwright's actionability tracker.
    // Check it last so subsequent locator actions do not wait on that canceled load.
    await check('Popups and external navigation cannot leave the local application', async () => {
      const original = page.url();
      assert.equal(await page.evaluate(url => window.open(url) === null, url), true);
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
      await app.evaluate(({ BrowserWindow }) => { globalThis.securityNavigation = new Promise(resolve => BrowserWindow.getAllWindows()[0].webContents.once('will-navigate', () => resolve(true))); });
      await page.evaluate(url => { location.href = url; }, url);
      await app.evaluate(() => globalThis.securityNavigation);
      assert.equal(page.url(), original); assert.equal(requests.length, 0);
    });
    const info = await page.evaluate(() => window.gitthor.info());
    const report = { date: new Date().toISOString(), platform: process.platform, version: info.data.version, checks: checks.map(name => ({ name, passed: true })), canaryRequests: requests.length, note: 'Playwright uses --no-sandbox for Linux automation; this is not a production sandbox attestation.' };
    await fs.mkdir(path.resolve(__dirname, '../test-results'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, `../test-results/security-ui-${process.platform}.json`), JSON.stringify(report, null, 2));
    console.log(`Security UI: ${checks.length}/${checks.length}, canary HTTP requests: ${requests.length}`);
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('gitthor-security-ui-')) await fs.rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
