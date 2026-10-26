// Test the packaged executable through Chromium CDP, without a shell or Node inspector.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { GitService, run } = require('../electron/git-service.cjs');
(async () => {
  const executable = process.argv[2]; if (!executable) throw new Error('Indicá el ejecutable empaquetado.');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gitthor-packaged-'));
  let child, browser;
  try {
    const repo = path.join(temp, 'packaged-repo'), profile = path.join(temp, 'profile');
    await fs.mkdir(repo); await fs.mkdir(profile);
    const service = new GitService(); const root = await service.init(repo);
    for (const [key, value] of [['user.name', 'GitThor QA'], ['user.email', 'qa@example.invalid'], ['commit.gpgsign', 'false'], ['core.hooksPath', path.join(temp, 'no-hooks')]]) await run(root, ['config', key, value]);
    await fs.writeFile(path.join(repo, 'README.md'), '# Packaged desktop test\n');
    await service.mutate(root, 'stage', { paths: ['README.md'] }); await service.mutate(root, 'commit', { message: 'Initial commit' });
    await fs.writeFile(path.join(repo, 'README.md'), '# Packaged desktop test\n\nA real desktop commit.\n');
    await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ recent: [root] }));
    const env = { ...process.env, GITTHOR_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    child = spawn(path.resolve(executable), ['--remote-debugging-port=0'], { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let logs = ''; const timer = setTimeout(() => reject(new Error('CDP timeout: ' + logs)), 30000);
      const read = chunk => { logs += chunk; const match = logs.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } };
      child.stdout.on('data', read); child.stderr.on('data', read);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Desktop exited (${code}): ${logs}`)); });
    });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page'); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.locator('.recent-item').first().click();
    await page.locator('#workspace').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.body.classList.contains('busy'));
    assert.equal(await page.locator('.commit-row').count(), 1);
    await page.locator('#unstaged-files .file-open').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#diff-content .diff-line').length > 0);
    assert.match(await page.locator('#diff-content').textContent(), /A real desktop commit/);
    await page.locator('#stage-all').click();
    await page.waitForFunction(() => document.getElementById('staged-count').textContent === '1' && !document.body.classList.contains('busy'));
    await page.locator('#commit-message').fill('Verified packaged desktop'); await page.locator('#commit').click();
    await page.waitForFunction(() => document.querySelectorAll('.commit-row').length === 2 && !document.body.classList.contains('busy'));
    assert.equal((await service.snapshot(root)).commits[0].subject, 'Verified packaged desktop');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined'); assert.deepEqual(errors, []);
    await fs.mkdir(path.resolve(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, `../test-results/${process.platform}-packaged.png`) });
    console.log('PASS packaged desktop: launch, repository, history, diff, stage and real commit.');
    await page.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('gitthor-packaged-')) await fs.rm(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
