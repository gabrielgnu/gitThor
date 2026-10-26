const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

class GitError extends Error {
  constructor(message) { super(message); this.name = 'GitError'; }
}

function run(cwd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', '-c', 'core.quotepath=false', ...args], {
      cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024,
      timeout: options.network ? 180000 : 60000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' },
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const message = error.code === 'ENOENT' ? 'No se encontró Git. Instalá Git y reiniciá GitThor.'
        : error.killed ? 'Git excedió el tiempo de espera. Revisá el estado del repositorio antes de reintentar.'
        : (stderr || stdout || error.message).trim();
      reject(new GitError(message.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[credenciales]@')));
    });
  });
}

function text(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new GitError(`${label} inválido.`);
  return value;
}
function filePath(value) {
  text(value, 'Archivo');
  if (path.isAbsolute(value) || /^[a-z]:/i.test(value) || value.split(/[\\/]/).includes('..')) throw new GitError('El archivo debe pertenecer al repositorio.');
  return value;
}
function revision(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value)) throw new GitError('Commit inválido.');
  return value;
}
function ref(value) {
  text(value, 'Rama', 512);
  if (value.startsWith('-') || /[\s~^:?*\[\\\x00-\x1f]/.test(value) || value.includes('..') || value.includes('@{')) throw new GitError('Nombre de rama inválido.');
  return value;
}
function parseStatus(output) {
  const entries = output.split('\0');
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const x = entry[0], y = entry[1], name = entry.slice(3);
    const original = /[RC]/.test(x + y) ? entries[++i] : null;
    files.push({ path: name, original, index: x, worktree: y,
      staged: x !== ' ' && x !== '?', unstaged: y !== ' ' || x === '?',
      conflict: ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(x + y) });
  }
  return files;
}
function parseLog(output) {
  return output.split('\x1e').map(row => row.replace(/^\n/, '')).filter(row => row.trim()).map(row => {
    const [hash, parents, author, email, date, subject, ...body] = row.split('\x1f');
    return { hash, parents: parents ? parents.split(' ') : [], author, email, date, subject, body: body.join('\x1f').trimEnd() };
  });
}

class GitService {
  constructor() { this.queues = new Map(); }
  async root(folder) {
    text(folder, 'Carpeta');
    const root = (await run(folder, ['rev-parse', '--show-toplevel'])).trim();
    return fs.realpath(root);
  }
  async snapshot(repo, limit = 400) {
    const head = (await run(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => 'HEAD separado')).trim();
    const [status, refs, log, remotes, stashes, upstream, operation] = await Promise.all([
      run(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      run(repo, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(HEAD)%00%(*objectname)', 'refs/heads', 'refs/remotes', 'refs/tags']),
      run(repo, ['log', '--all', 'HEAD', '--date-order', `--max-count=${Math.min(5000, Math.max(1, Number(limit) || 400))}`, '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e']).catch(async error => {
        const exists = await run(repo, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
        if (exists) throw error;
        return run(repo, ['log', '--all', '--date-order', '--max-count=400', '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e']).catch(() => '');
      }),
      run(repo, ['remote', '-v']),
      run(repo, ['stash', 'list', '--format=%gd%x00%H%x00%gs']),
      run(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).catch(() => ''),
      this.operation(repo),
    ]);
    const [ahead = 0, behind = 0] = upstream.trim().split(/\s+/).map(Number);
    return { repo, name: path.basename(repo), branch: head, files: parseStatus(status), commits: parseLog(log),
      refs: refs.trim().split('\n').filter(Boolean).map(line => { const [name, hash, upstream, current, peeled] = line.split('\0'); return { name, hash: peeled || hash, upstream, current: current.trim() === '*' }; }),
      remotes: [...new Set(remotes.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/)[0]))],
      stashes: stashes.trim().split('\n').filter(Boolean).map(line => { const [name, hash, subject] = line.split('\0'); return { name, hash, subject }; }),
      ahead, behind, operation };
  }
  async operation(repo) {
    const gitDir = (await run(repo, ['rev-parse', '--absolute-git-dir'])).trim();
    for (const [marker, kind] of [['MERGE_HEAD', 'merge'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['CHERRY_PICK_HEAD', 'cherry-pick']]) {
      if (await fs.access(path.join(gitDir, marker)).then(() => true, () => false)) return kind;
    }
    return null;
  }
  async diff(repo, payload) {
    if (payload.commit) {
      const hash = revision(payload.commit);
      if (payload.path) return run(repo, ['--literal-pathspecs', 'show', '--format=', '--no-ext-diff', '--no-textconv', '--find-renames', hash, '--', filePath(payload.path)]);
      return run(repo, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', '--no-renames', hash]);
    }
    const name = filePath(payload.path);
    const files = parseStatus(await run(repo, ['--literal-pathspecs', 'status', '--porcelain=v1', '-z', '--', name]));
    if (files.some(f => f.index === '?')) {
      const absolute = await fs.realpath(path.join(repo, name));
      const relative = path.relative(await fs.realpath(repo), absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new GitError('No se permite leer enlaces fuera del repositorio.');
      const info = await fs.stat(absolute);
      if (info.size > 1024 * 1024) return 'Archivo nuevo de más de 1 MB. La vista previa está limitada.';
      const content = await fs.readFile(absolute);
      if (content.includes(0)) return 'Archivo binario nuevo.';
      return `--- /dev/null\n+++ b/${name}\n` + content.toString('utf8').split('\n').map(line => '+' + line).join('\n');
    }
    return run(repo, ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', ...(payload.staged ? ['--cached'] : []), '--', name]);
  }
  mutate(repo, action, payload = {}) {
    const previous = this.queues.get(repo) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.execute(repo, action, payload));
    this.queues.set(repo, next);
    return next.finally(() => { if (this.queues.get(repo) === next) this.queues.delete(repo); });
  }
  async execute(repo, action, p) {
    switch (action) {
      case 'stage': {
        const paths = p.paths?.map(filePath);
        if (!paths?.length) throw new GitError('Seleccioná archivos.');
        return run(repo, ['--literal-pathspecs', 'add', '--', ...paths]);
      }
      case 'unstage': {
        const paths = p.paths?.map(filePath);
        if (!paths?.length) throw new GitError('Seleccioná archivos.');
        const hasHead = await run(repo, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
        return run(repo, ['--literal-pathspecs', ...(hasHead ? ['reset', '-q', 'HEAD'] : ['rm', '--cached', '-r', '--ignore-unmatch']), '--', ...paths]);
      }
      case 'commit': return run(repo, ['commit', '-m', text(p.message, 'Mensaje', 100000)]);
      case 'checkout': return run(repo, ['switch', ref(p.branch)]);
      case 'branch': {
        await run(repo, ['check-ref-format', '--branch', ref(p.branch)]);
        return run(repo, ['switch', '-c', p.branch]);
      }
      case 'deleteBranch': return run(repo, ['branch', '-d', ref(p.branch)]);
      case 'track': return run(repo, ['switch', '--track', ref(p.branch)]);
      case 'merge': return run(repo, ['merge', '--no-edit', ref(p.branch)]);
      case 'rebase': return run(repo, ['rebase', ref(p.branch)]);
      case 'cherryPick': return run(repo, ['cherry-pick', revision(p.commit)]);
      case 'fetch': return run(repo, ['fetch', '--all', '--prune'], { network: true });
      case 'pull': return run(repo, ['pull', '--ff-only'], { network: true });
      case 'push': {
        const remote = text(p.remote, 'Remoto', 512);
        const names = (await run(repo, ['remote'])).trim().split('\n');
        if (!names.includes(remote) || remote.startsWith('-')) throw new GitError('Remoto inválido.');
        return run(repo, ['push', '--set-upstream', remote, ref(p.branch)], { network: true });
      }
      case 'addRemote': {
        const name = ref(p.name);
        return run(repo, ['remote', 'add', name, this.remoteUrl(p.url)]);
      }
      case 'stash': return run(repo, ['stash', 'push', '--include-untracked', '-m', p.message || 'GitThor stash']);
      case 'stashApply': case 'stashDrop': {
        if (!/^stash@\{\d+\}$/.test(p.stash)) throw new GitError('Stash inválido.');
        return run(repo, ['stash', action === 'stashApply' ? 'apply' : 'drop', p.stash]);
      }
      case 'abort': case 'continue': {
        const operation = await this.operation(repo);
        if (!operation) throw new GitError('No hay una operación en curso.');
        if (action === 'continue' && operation === 'merge') return run(repo, ['commit', '--no-edit']);
        return run(repo, [operation, action === 'abort' ? '--abort' : '--continue']);
      }
      default: throw new GitError('Operación desconocida.');
    }
  }
  remoteUrl(value) {
    text(value, 'URL');
    if (!/^(https?:\/\/|ssh:\/\/|git:\/\/|[\w.-]+@[\w.-]+:)/i.test(value) && !path.isAbsolute(value)) throw new GitError('Usá una URL HTTPS/SSH o una ruta local absoluta.');
    if (/\s/.test(value) && !path.isAbsolute(value)) throw new GitError('La URL no puede contener espacios.');
    return value;
  }
  async clone(url, parent, name) {
    this.remoteUrl(url);
    text(name, 'Nombre', 128);
    if (!/^[\p{L}\p{N}_. -]+$/u.test(name) || name === '.' || name === '..' || name.endsWith('.') || name.endsWith(' ')) throw new GitError('Nombre de carpeta inválido.');
    const destination = path.join(parent, name);
    await run(parent, ['clone', '--', url, destination], { network: true });
    return this.root(destination);
  }
  async init(folder) { await run(folder, ['init', '-b', 'main']); return this.root(folder); }
}

module.exports = { GitService, GitError, run, parseStatus, parseLog };
