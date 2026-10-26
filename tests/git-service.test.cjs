const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { GitService, run, parseStatus } = require('../electron/git-service.cjs');
const { layout } = require('../src/graph.js');
let temp, repo, git;
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gitthor-test-'));
  repo = path.join(temp, 'repo con espacios'); await fs.mkdir(repo);
  git = new GitService(); repo = await git.init(repo);
  await run(repo, ['config', 'user.name', 'GitThor Test']);
  await run(repo, ['config', 'user.email', 'test@example.invalid']);
  await run(repo, ['config', 'commit.gpgsign', 'false']);
  await run(repo, ['config', 'core.autocrlf', 'false']);
  await run(repo, ['config', 'core.hooksPath', path.join(temp, 'no-hooks')]);
});
afterEach(async () => {
  if (temp && path.basename(temp).startsWith('gitthor-test-') && path.dirname(temp) === os.tmpdir()) await fs.rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
});
async function write(name, content) { await fs.writeFile(path.join(repo, name), content); }
async function commit(name = 'hola.txt', content = 'hola\n', message = 'Primer commit') {
  await write(name, content); await git.mutate(repo, 'stage', { paths: [name] }); await git.mutate(repo, 'commit', { message });
  return (await git.snapshot(repo)).commits[0].hash;
}

test('empty repository, stage, unstage before first commit and multiline commit', async () => {
  let s = await git.snapshot(repo); assert.equal(s.branch, 'main'); assert.deepEqual(s.commits, []); assert.equal(s.behind, 0);
  await write('archivo ñ con espacios.txt', 'primera\nsegunda\n');
  s = await git.snapshot(repo); assert.equal(s.files[0].path, 'archivo ñ con espacios.txt'); assert.equal(s.files[0].unstaged, true);
  assert.match(await git.diff(repo, { path: s.files[0].path }), /\+primera/);
  await git.mutate(repo, 'stage', { paths: [s.files[0].path] });
  assert.equal((await git.snapshot(repo)).files[0].staged, true);
  await git.mutate(repo, 'unstage', { paths: [s.files[0].path] });
  assert.equal((await git.snapshot(repo)).files[0].index, '?');
  await git.mutate(repo, 'stage', { paths: [s.files[0].path] });
  await git.mutate(repo, 'commit', { message: 'feat: primer commit\n\nDescripción completa.' });
  s = await git.snapshot(repo); assert.equal(s.files.length, 0); assert.equal(s.commits[0].subject, 'feat: primer commit'); assert.equal(s.commits[0].body, 'Descripción completa.');
  const files = await git.diff(repo, { commit: s.commits[0].hash }); assert.match(files, /archivo ñ con espacios.txt/);
  assert.match(await git.diff(repo, { commit: s.commits[0].hash, path: 'archivo ñ con espacios.txt' }), /\+segunda/);
});

test('staged and unstaged changes have separate diffs and unstaging preserves contents', async () => {
  await commit(); await write('hola.txt', 'preparado\n'); await git.mutate(repo, 'stage', { paths: ['hola.txt'] }); await write('hola.txt', 'local\n');
  const s = await git.snapshot(repo); assert.equal(s.files[0].staged, true); assert.equal(s.files[0].unstaged, true);
  assert.match(await git.diff(repo, { path: 'hola.txt', staged: true }), /\+preparado/);
  assert.match(await git.diff(repo, { path: 'hola.txt', staged: false }), /\+local/);
  await git.mutate(repo, 'unstage', { paths: ['hola.txt'] }); assert.equal(await fs.readFile(path.join(repo, 'hola.txt'), 'utf8'), 'local\n');
});

test('rename parsing, rename unstage, deletion and literal pathspecs', async () => {
  await commit(); await fs.rename(path.join(repo, 'hola.txt'), path.join(repo, 'nuevo.txt'));
  await git.mutate(repo, 'stage', { paths: ['hola.txt', 'nuevo.txt'] });
  let s = await git.snapshot(repo); assert.equal(s.files[0].original, 'hola.txt'); assert.equal(s.files[0].path, 'nuevo.txt');
  await git.mutate(repo, 'unstage', { paths: ['hola.txt', 'nuevo.txt'] });
  assert.ok((await git.snapshot(repo)).files.some(f => f.path === 'nuevo.txt' && f.index === '?'));
  await write('literal[1].txt', 'literal\n'); await write('literal1.txt', 'otro\n');
  await git.mutate(repo, 'stage', { paths: ['literal[1].txt'] });
  s = await git.snapshot(repo); assert.equal(s.files.find(f => f.path === 'literal[1].txt').staged, true); assert.equal(s.files.find(f => f.path === 'literal1.txt').staged, false);
});

test('branch checkout, merge, annotated tags and safe branch deletion', async () => {
  await commit(); await git.mutate(repo, 'branch', { branch: 'feature/idea' }); await commit('feature.txt', 'idea\n', 'Agregar idea');
  await git.mutate(repo, 'checkout', { branch: 'main' }); await git.mutate(repo, 'merge', { branch: 'feature/idea' });
  let s = await git.snapshot(repo); assert.equal(s.commits.length, 2); assert.equal(s.branch, 'main');
  await run(repo, ['tag', '-a', 'v0.1', '-m', 'Release']);
  s = await git.snapshot(repo); assert.equal(s.refs.find(r => r.name === 'refs/tags/v0.1').hash, s.commits[0].hash);
  await git.mutate(repo, 'deleteBranch', { branch: 'feature/idea' });
  assert.equal((await git.snapshot(repo)).refs.some(r => r.name === 'refs/heads/feature/idea'), false);
});

test('stash includes untracked files, applies without dropping, and drops explicitly', async () => {
  await commit(); await write('hola.txt', 'cambio\n'); await write('nuevo.txt', 'nuevo\n');
  await git.mutate(repo, 'stash', { message: 'En progreso' });
  let s = await git.snapshot(repo); assert.equal(s.files.length, 0); assert.equal(s.stashes.length, 1);
  await git.mutate(repo, 'stashApply', { stash: s.stashes[0].name });
  s = await git.snapshot(repo); assert.equal(s.files.length, 2); assert.equal(s.stashes.length, 1);
  await git.mutate(repo, 'stashDrop', { stash: s.stashes[0].name }); assert.equal((await git.snapshot(repo)).stashes.length, 0);
});

test('local remote: clone, fetch, push, upstream counts, pull and tracking', async () => {
  await commit(); const bare = path.join(temp, 'remote.git'); await fs.mkdir(bare); await run(bare, ['init', '--bare', '-b', 'main']);
  await git.mutate(repo, 'addRemote', { name: 'origin', url: bare });
  await git.mutate(repo, 'push', { remote: 'origin', branch: 'main' });
  const clone = await git.clone(bare, temp, 'clon'); assert.equal((await git.snapshot(clone)).commits.length, 1);
  await commit('segundo.txt', 'segundo\n', 'Segundo commit'); assert.equal((await git.snapshot(repo)).ahead, 1);
  await git.mutate(repo, 'push', { remote: 'origin', branch: 'main' });
  await git.mutate(clone, 'fetch'); assert.equal((await git.snapshot(clone)).behind, 1);
  await git.mutate(clone, 'pull'); assert.equal((await git.snapshot(clone)).commits.length, 2);
  await git.mutate(repo, 'branch', { branch: 'feature/remota' }); await git.mutate(repo, 'push', { remote: 'origin', branch: 'feature/remota' });
  await git.mutate(clone, 'fetch'); await git.mutate(clone, 'track', { branch: 'origin/feature/remota' }); assert.equal((await git.snapshot(clone)).branch, 'feature/remota');
});

test('merge conflicts are visible and abort restores the branch', async () => {
  await commit('hola.txt', 'base\n'); await git.mutate(repo, 'branch', { branch: 'otra' }); await commit('hola.txt', 'otra\n', 'Otra');
  await git.mutate(repo, 'checkout', { branch: 'main' }); await commit('hola.txt', 'main\n', 'Main');
  await assert.rejects(git.mutate(repo, 'merge', { branch: 'otra' }));
  let s = await git.snapshot(repo); assert.equal(s.operation, 'merge'); assert.equal(s.files[0].conflict, true);
  await git.mutate(repo, 'abort'); s = await git.snapshot(repo); assert.equal(s.operation, null); assert.equal(s.files.length, 0); assert.equal(await fs.readFile(path.join(repo, 'hola.txt'), 'utf8'), 'main\n');
});

test('resolved conflicts can continue with prepared files', async () => {
  await commit('hola.txt', 'base\n'); await git.mutate(repo, 'branch', { branch: 'otra' }); await commit('hola.txt', 'otra\n', 'Otra');
  await git.mutate(repo, 'checkout', { branch: 'main' }); await commit('hola.txt', 'main\n', 'Main');
  await assert.rejects(git.mutate(repo, 'merge', { branch: 'otra' }));
  await write('hola.txt', 'resuelto\n'); await git.mutate(repo, 'stage', { paths: ['hola.txt'] }); await git.mutate(repo, 'continue');
  const s = await git.snapshot(repo); assert.equal(s.operation, null); assert.equal(s.commits[0].parents.length, 2);
});

test('cherry-pick and rebase operate on real history', async () => {
  await commit(); await git.mutate(repo, 'branch', { branch: 'feature' }); const feature = await commit('feature.txt', 'idea\n', 'Feature');
  await git.mutate(repo, 'checkout', { branch: 'main' }); await git.mutate(repo, 'cherryPick', { commit: feature });
  assert.equal(await fs.readFile(path.join(repo, 'feature.txt'), 'utf8'), 'idea\n');
  await git.mutate(repo, 'branch', { branch: 'rebase-me' }); await commit('local.txt', 'local\n', 'Local');
  await git.mutate(repo, 'checkout', { branch: 'main' }); await commit('main.txt', 'main\n', 'Main'); await git.mutate(repo, 'checkout', { branch: 'rebase-me' });
  await git.mutate(repo, 'rebase', { branch: 'main' });
  assert.equal(await fs.readFile(path.join(repo, 'main.txt'), 'utf8'), 'main\n'); assert.equal((await git.snapshot(repo)).operation, null);
});

test('invalid paths, refs, revisions, remotes and actions are rejected', async () => {
  for (const name of ['../secreto', '/etc/passwd', 'C:\\secreto', '..\\secreto']) await assert.rejects(git.mutate(repo, 'stage', { paths: [name] }));
  await assert.rejects(git.mutate(repo, 'branch', { branch: '--help' }));
  await assert.rejects(git.diff(repo, { commit: '--output=elsewhere' }));
  await assert.rejects(git.mutate(repo, 'push', { remote: '--all', branch: 'main' }));
  await assert.rejects(git.mutate(repo, 'runAnything', {}));
  assert.throws(() => git.remoteUrl('ext::sh malicious'));
  await assert.rejects(git.clone('https://example.invalid/a.git', temp, '../escape'));
  assert.deepEqual(parseStatus('R  new name\0old name\0?? otro\0').map(f => [f.path, f.original]), [['new name', 'old name'], ['otro', null]]);
});

test('queued mutations do not race the Git index', async () => {
  await write('a.txt', 'a'); await write('b.txt', 'b');
  await Promise.all([git.mutate(repo, 'stage', { paths: ['a.txt'] }), git.mutate(repo, 'stage', { paths: ['b.txt'] })]);
  assert.equal((await git.snapshot(repo)).files.filter(f => f.staged).length, 2);
});

test('graph keeps merge edges and lanes within their row widths', () => {
  const commits = [{ hash: 'merge', parents: ['a', 'b'] }, { hash: 'a', parents: ['root'] }, { hash: 'b', parents: ['root'] }, { hash: 'root', parents: [] }];
  const rows = layout(commits); assert.equal(rows[0].edges.length, 2); assert.equal(rows[0].width, 2);
  for (const row of rows) for (const edge of row.edges) { assert.ok(edge.from >= 0 && edge.to >= 0); assert.ok(edge.from < row.width && edge.to < row.width); }
});

test('linked worktrees open at their own root and report operation state', async () => {
  await commit(); const worktree = path.join(temp, 'linked-worktree');
  await run(repo, ['worktree', 'add', '-b', 'worktree-branch', worktree]);
  const root = await git.root(worktree); const s = await git.snapshot(root);
  assert.equal(s.branch, 'worktree-branch'); assert.equal(s.operation, null); assert.equal(s.repo, await fs.realpath(worktree));
  await fs.writeFile(path.join(root, 'linked.txt'), 'linked\n'); await git.mutate(root, 'stage', { paths: ['linked.txt'] });
  assert.equal((await git.snapshot(root)).files[0].staged, true); assert.equal((await git.snapshot(repo)).files.length, 0);
});
