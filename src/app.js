/* Renderer has no Node.js access. All repository operations cross the narrow preload API. */
const $ = id => document.getElementById(id);
const api = window.gitthor;
const state = { repo: null, data: null, selected: null, busy: false, limit: 400, query: '', info: null, tab: 'changes', diffToken: 0, refreshToken: 0 };
const palette = ['#b0ed83', '#aa98f1', '#79c9df', '#e3b773', '#e893b1', '#8bafef'];
let toastTimer;
function el(tag, className, content) { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; }
function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = 'toast' + (error ? ' error' : ''); $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, error ? 14000 : 4500); }
async function unwrap(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.data; }
async function task(label, work) {
  if (state.busy) return;
  state.busy = true; document.body.classList.add('busy'); $('status-text').textContent = label; updateButtons();
  try { return await work(); }
  catch (error) { toast(error.message, true); if (state.repo) await refresh().catch(() => {}); }
  finally { state.busy = false; document.body.classList.remove('busy'); $('status-text').textContent = state.repo ? 'Repositorio local · Listo' : 'Listo para construir'; updateButtons(); }
}
function updateButtons() {
  document.querySelectorAll('.file-toggle').forEach(button => button.disabled = state.busy);
  for (const id of ['fetch', 'pull', 'push', 'stage-all', 'unstage-all', 'new-branch', 'branch-actions', 'new-stash', 'add-remote', 'continue-operation', 'abort-operation']) $(id).disabled = state.busy || !state.repo;
  const staged = state.data?.files.filter(f => f.staged).length || 0;
  $('commit').disabled = state.busy || !staged || !$('commit-message').value.trim() || state.data?.files.some(f => f.conflict) || ['rebase', 'cherry-pick'].includes(state.data?.operation);
  $('stage-all').disabled ||= !state.data?.files.some(f => f.unstaged);
  $('unstage-all').disabled ||= !staged;
}
function modal({ title, description = '', fields = [], submit = 'Continuar' }) {
  if ($('modal').open) return Promise.resolve(null);
  $('modal-title').textContent = title; $('modal-description').textContent = description; $('modal-submit').textContent = submit; $('modal-fields').replaceChildren();
  for (const field of fields) {
    const group = el('div', 'modal-field'); const label = el('label', '', field.label); label.htmlFor = 'field-' + field.name;
    const input = el(field.options ? 'select' : 'input'); input.id = label.htmlFor; input.name = field.name; input.required = field.required !== false;
    if (field.options) for (const option of field.options) { const item = el('option', '', typeof option === 'string' ? option : option.label); item.value = typeof option === 'string' ? option : option.value; input.append(item); }
    else { input.type = 'text'; input.placeholder = field.placeholder || ''; input.value = field.value || ''; input.autocomplete = 'off'; input.maxLength = field.maxLength || 4096; }
    group.append(label, input); $('modal-fields').append(group);
  }
  $('modal').showModal();
  return new Promise(resolve => {
    let result = null;
    const onSubmit = event => { event.preventDefault(); result = Object.fromEntries(new FormData($('modal-form'))); $('modal').close(); };
    const onClose = () => { $('modal-form').removeEventListener('submit', onSubmit); $('modal').removeEventListener('close', onClose); resolve(result); };
    $('modal-form').addEventListener('submit', onSubmit); $('modal').addEventListener('close', onClose);
  });
}
async function confirm(title, description, submit) { return (await modal({ title, description, submit })) !== null; }
async function openRepo(method = 'open', payload) {
  if (!api) return toast('Abrí GitThor con npm start para acceder a tus repositorios.');
  await task(method === 'clone' ? 'Clonando repositorio…' : 'Abriendo repositorio…', async () => {
    const repo = await unwrap(api[method](payload)); if (!repo) return;
    state.repo = repo; state.selected = null; state.limit = 400; state.query = ''; $('search').value = ''; $('commit-message').value = ''; closeDiff();
    await refresh();
    state.info = await unwrap(api.info()); renderRecent();
    $('welcome').hidden = true; $('workspace').hidden = false;
  });
}
async function cloneRepo() {
  const p = await modal({ title: 'Un nuevo punto de partida.', description: 'Cloná por HTTPS o SSH. La autenticación usa las credenciales de Git y tu agente SSH del sistema.', fields: [{ name: 'url', label: 'URL del repositorio', placeholder: 'https://github.com/equipo/proyecto.git' }, { name: 'name', label: 'Nombre de la carpeta', placeholder: 'mi-proyecto', maxLength: 128 }], submit: 'Elegir destino y clonar' });
  if (p) await openRepo('clone', p);
}
async function refresh() {
  if (!state.repo || !api) return;
  const repo = state.repo, token = ++state.refreshToken;
  const data = await unwrap(api.snapshot(repo, state.limit));
  if (token !== state.refreshToken || repo !== state.repo) return;
  state.data = data; render();
}
async function mutate(action, payload = {}, message = 'Operación completada') {
  return task('Git · ' + ({ commit: 'Creando commit…', fetch: 'Consultando remotos…', pull: 'Descargando cambios…', push: 'Enviando cambios…' }[action] || 'Aplicando cambios…'), async () => {
    await unwrap(api.mutate(state.repo, action, payload));
    if (action === 'commit') { $('commit-message').value = ''; $('message-length').textContent = '0'; }
    closeDiff(); await refresh(); toast(message);
  });
}
function render() {
  const d = state.data;
  $('repo-name').textContent = d.name; $('repo-switch').title = d.repo; $('current-branch').textContent = d.branch;
  $('status-repo').textContent = d.repo; $('ahead').textContent = d.ahead || ''; $('behind').textContent = d.behind || '';
  $('changes-count').textContent = d.files.length; $('file-count').textContent = d.files.length + ' archivos';
  $('working-count').textContent = d.files.length + ' archivos'; $('working-summary').textContent = d.files.length ? `${d.files.filter(f => f.staged).length} preparados · ${d.files.filter(f => f.unstaged).length} con cambios locales${d.files.some(f => f.conflict) ? ' · Hay conflictos' : ''}` : 'Tu árbol de trabajo está limpio';
  $('commit-total').textContent = d.commits.length + (d.commits.length >= state.limit ? '+' : '') + ' commits';
  $('history-status').textContent = `Rama ${d.branch} · ${d.ahead} por enviar, ${d.behind} por recibir`;
  $('operation-banner').hidden = !d.operation; $('operation-label').textContent = d.operation ? `${d.operation} en curso · Resolvé y prepará los archivos antes de continuar.` : '';
  renderBranches(); renderHistory(); renderFiles(); updateButtons();
}
function branchButton(label, symbol, onClick, current = false) {
  const button = el('button', 'branch-item' + (current ? ' current' : '')); button.title = label;
  button.append(el('span', 'branch-symbol', symbol), el('span', '', label));
  if (current) button.append(el('span', 'branch-marker', '✓'));
  button.addEventListener('click', () => { if (!state.busy) onClick(); }); return button;
}
function renderBranches() {
  const d = state.data;
  for (const id of ['local-branches', 'remote-branches', 'tags', 'stashes']) $(id).replaceChildren();
  const locals = d.refs.filter(r => r.name.startsWith('refs/heads/'));
  for (const r of locals) {
    const name = r.name.slice(11);
    $('local-branches').append(branchButton(name, '⑂', async () => { if (name !== d.branch && await confirm(`Cambiar a ${name}`, 'Git conservará los cambios compatibles y bloqueará el cambio si pudiera sobrescribir archivos.', 'Cambiar rama')) mutate('checkout', { branch: name }, `Rama activa: ${name}`); }, r.current));
  }
  if (!locals.length) $('local-branches').append(el('div', 'empty-small', 'Aparecerán con el primer commit'));
  for (const name of d.remotes) {
    $('remote-branches').append(el('div', 'remote-label', '⌄ ' + name));
    for (const r of d.refs.filter(r => r.name.startsWith(`refs/remotes/${name}/`) && !r.name.endsWith('/HEAD'))) {
      const remoteBranch = r.name.slice(13);
      $('remote-branches').append(branchButton(remoteBranch, '⑂', async () => { if (await confirm('Seguir rama remota', `Se creará una rama local siguiendo ${remoteBranch}.`, 'Crear y cambiar')) mutate('track', { branch: remoteBranch }, 'Rama remota vinculada'); }));
    }
  }
  if (!d.remotes.length) $('remote-branches').append(el('div', 'empty-small', 'Sin remotos configurados'));
  for (const r of d.refs.filter(r => r.name.startsWith('refs/tags/'))) $('tags').append(branchButton(r.name.slice(10), '◇', () => selectCommit(r.hash)));
  if (!$('tags').childElementCount) $('tags').append(el('div', 'empty-small', 'Sin etiquetas'));
  for (const stash of d.stashes) $('stashes').append(branchButton(stash.subject, '▤', () => stashActions(stash)));
  if (!d.stashes.length) $('stashes').append(el('div', 'empty-small', 'Nada guardado por ahora'));
}
function graphSvg(row, filtered) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(Math.max(90, row.width * 15 + 20))); svg.setAttribute('height', '51'); svg.setAttribute('aria-hidden', 'true');
  const x = lane => 12 + lane * 15;
  const line = (d, color) => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('stroke', palette[color]); p.setAttribute('stroke-width', '1.5'); p.setAttribute('fill', 'none'); svg.append(p); };
  if (!filtered) {
    line(`M ${x(row.lane)} 0 L ${x(row.lane)} 25.5`, row.color);
    for (const e of row.edges) line(`M ${x(e.from)} ${e.start === 'top' ? 0 : 25.5} C ${x(e.from)} 38 ${x(e.to)} 38 ${x(e.to)} 51`, e.color);
  }
  const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', String(x(row.lane))); circle.setAttribute('cy', '25.5'); circle.setAttribute('r', '4'); circle.setAttribute('fill', palette[row.color]); svg.append(circle); return svg;
}
function relativeDate(value) {
  const date = new Date(value), days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return 'hoy'; if (days === 1) return 'ayer'; if (days > 1 && days < 30) return `hace ${days} días`;
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
function renderHistory() {
  $('commit-list').replaceChildren();
  const d = state.data, rows = GitGraph.layout(d.commits), query = state.query.toLocaleLowerCase();
  const visible = d.commits.map((commit, i) => ({ commit, row: rows[i] })).filter(({ commit: c }) => !query || [c.subject, c.author, c.email, c.hash, c.body].join(' ').toLocaleLowerCase().includes(query));
  for (const { commit: c, row } of visible) {
    const button = el('button', 'commit-row' + (state.selected === c.hash ? ' selected' : '')); button.setAttribute('role', 'listitem'); button.title = c.subject;
    const graph = el('div', 'graph-cell'); graph.append(graphSvg(row, !!query));
    const message = el('div', 'commit-message'); message.append(el('span', 'subject', c.subject)); const meta = el('div', 'commit-meta');
    const refs = d.refs.filter(r => r.hash === c.hash && !r.name.endsWith('/HEAD'));
    for (const r of refs.slice(0, 3)) meta.append(el('span', 'ref-badge' + (r.current ? ' head' : ''), (r.name.startsWith('refs/tags/') ? '◇ ' : '⑂ ') + r.name.replace(/^refs\/(heads|remotes|tags)\//, '')));
    const time = el('time', '', relativeDate(c.date)); time.dateTime = c.date; time.title = new Date(c.date).toLocaleString('es'); meta.append(time); message.append(meta);
    const author = el('div', 'commit-author'); author.append(el('span', 'author-dot', c.author.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()), el('span', 'author-name', c.author));
    button.append(graph, message, author, el('span', 'commit-sha', c.hash.slice(0, 7))); button.addEventListener('click', () => selectCommit(c.hash)); $('commit-list').append(button);
  }
  if (!visible.length) { const empty = el('div', 'history-empty'); empty.append(el('strong', '', query ? 'Ningún commit coincide.' : 'Toda gran historia empieza acá.'), el('span', '', query ? 'Probá con otro autor, mensaje o identificador.' : 'Prepará tus archivos y creá el primer commit.')); $('commit-list').append(empty); }
  $('load-more').hidden = d.commits.length < state.limit || state.limit >= 5000;
}
function fileRow(file, staged, commit) {
  const row = el('div', 'file-row'), button = el('button', 'file-open'); button.title = file.path;
  const status = file.conflict ? '!' : commit ? file.status : staged ? file.index : file.index === '?' ? 'A' : file.worktree;
  const code = ['A', '?'].includes(status) ? 'added' : status === 'D' ? 'deleted' : file.conflict ? 'conflict' : '';
  button.append(el('span', 'file-status ' + code, status));
  const name = el('span', 'file-name', file.path); button.append(name); button.addEventListener('click', () => showDiff({ path: file.path, staged, ...(commit ? { commit } : {}) })); row.append(button);
  if (!commit) { const toggle = el('button', 'file-toggle', staged ? '−' : '＋'); toggle.title = staged ? 'Quitar del próximo commit' : 'Preparar archivo'; toggle.disabled = state.busy; toggle.addEventListener('click', () => mutate(staged ? 'unstage' : 'stage', { paths: file.original ? [file.path, file.original] : [file.path] }, staged ? 'Archivo retirado del área de preparación' : 'Archivo preparado')); row.append(toggle); }
  return row;
}
function renderFiles() {
  const files = state.data.files;
  for (const [id, staged] of [['unstaged', false], ['staged', true]]) {
    const list = files.filter(f => staged ? f.staged : f.unstaged); $(id + '-count').textContent = list.length; $(id + '-files').replaceChildren();
    for (const file of list) $(id + '-files').append(fileRow(file, staged));
    if (!list.length) $(id + '-files').append(el('div', 'empty-files', staged ? 'Los archivos preparados aparecerán acá.' : '✓ No hay cambios pendientes.'));
  }
}
function setTab(tab) {
  state.tab = tab; $('changes-panel').hidden = tab !== 'changes'; $('commit-panel').hidden = tab !== 'commit';
  $('tab-changes').classList.toggle('active', tab === 'changes'); $('tab-commit').classList.toggle('active', tab === 'commit');
}
async function selectCommit(hash) {
  const c = state.data?.commits.find(c => c.hash === hash); if (!c) return toast('El commit no está en el historial cargado. Cargá más commits para verlo.');
  state.selected = hash; renderHistory(); setTab('commit'); closeDiff(); const panel = $('commit-panel'); panel.replaceChildren();
  panel.append(el('h3', 'commit-detail-subject', c.subject)); if (c.body) panel.append(el('div', 'commit-detail-body', c.body));
  const facts = el('div', 'commit-facts'); for (const [label, value] of [['Commit', c.hash], ['Autor', c.author], ['Email', c.email], ['Fecha', new Date(c.date).toLocaleString('es')], ['Padres', c.parents.map(h => h.slice(0, 7)).join(', ') || 'Commit inicial']]) facts.append(el('span', '', label), el('strong', '', value)); panel.append(facts);
  const actions = el('div', 'commit-detail-actions'), copy = el('button', 'secondary', 'Copiar SHA'), cherry = el('button', 'secondary', 'Cherry-pick');
  copy.addEventListener('click', () => navigator.clipboard.writeText(hash).then(() => toast('SHA copiado'), () => toast('No se pudo copiar al portapapeles', true)));
  cherry.addEventListener('click', async () => { if (await confirm('Aplicar este commit', `Se aplicará ${hash.slice(0, 7)} sobre ${state.data.branch}. Si hay conflictos, Git detendrá la operación.`, 'Cherry-pick')) mutate('cherryPick', { commit: hash }, 'Commit aplicado'); }); actions.append(copy, cherry); panel.append(actions, el('div', 'file-section-heading', 'ARCHIVOS DEL COMMIT'));
  const list = el('div', 'commit-files'); panel.append(list);
  try {
    const output = await unwrap(api.diff(state.repo, { commit: hash }));
    if (state.selected !== hash) return;
    const parts = output.split('\0');
    for (let i = 0; i + 1 < parts.length; i += 2) if (parts[i]) list.append(fileRow({ status: parts[i], path: parts[i + 1] }, false, hash));
    if (!list.childElementCount) list.append(el('div', 'empty-files', c.parents.length > 1 ? 'Commit de merge. Seleccioná sus padres para inspeccionar los cambios.' : 'Este commit no modifica archivos.'));
  } catch (error) { toast(error.message, true); }
}
function closeDiff() { state.diffToken++; $('diff-panel').hidden = true; }
async function showDiff(payload) {
  const token = ++state.diffToken; $('diff-title').textContent = payload.path + (payload.staged ? ' · preparado' : ''); $('diff-panel').hidden = false; $('diff-content').replaceChildren(el('div', 'diff-empty', 'Cargando diferencias…'));
  try {
    const output = await unwrap(api.diff(state.repo, payload)); if (token !== state.diffToken) return;
    $('diff-content').replaceChildren(); if (!output) return $('diff-content').append(el('div', 'diff-empty', 'Sin diferencias de texto. Puede tratarse de un cambio de permisos o de nombre.'));
    const lines = output.split('\n'); const visible = lines.slice(0, 4000);
    visible.forEach((line, i) => { const row = el('div', 'diff-line' + (line.startsWith('@@') ? ' hunk' : line.startsWith('+') ? ' add' : line.startsWith('-') ? ' remove' : '')); row.append(el('span', 'diff-number', String(i + 1)), el('span', '', line)); $('diff-content').append(row); });
    if (lines.length > 4000) $('diff-content').append(el('div', 'diff-empty', 'Vista limitada a 4000 líneas. El archivo completo permanece en el repositorio.'));
  } catch (error) { if (token === state.diffToken) $('diff-content').replaceChildren(el('div', 'diff-empty', error.message)); }
}
async function createBranch() {
  const result = await modal({ title: 'Dale espacio a tu próxima idea.', description: 'Se creará una rama desde el commit actual y se cambiará a ella.', fields: [{ name: 'branch', label: 'Nombre de la rama', placeholder: 'feature/mi-idea' }], submit: 'Crear rama' });
  if (result) await mutate('branch', result, 'Rama creada');
}
async function branchActions() {
  const branches = state.data.refs.filter(r => r.name.startsWith('refs/heads/') && !r.current).map(r => r.name.slice(11));
  if (!branches.length) return toast('Creá otra rama para combinarla o cambiar su base.');
  const p = await modal({ title: 'Trabajá con tus ramas.', description: `Rama actual: ${state.data.branch}. Merge combina historiales. Rebase reescribe los commits locales. La eliminación usa Git -d y protege ramas sin integrar.`, fields: [{ name: 'action', label: 'Operación', options: [{ value: 'merge', label: 'Merge · combinar en la rama actual' }, { value: 'rebase', label: 'Rebase · cambiar la base de la rama actual' }, { value: 'deleteBranch', label: 'Eliminar rama integrada' }] }, { name: 'branch', label: 'Rama', options: branches }], submit: 'Revisar operación' });
  if (p && await confirm('Confirmar operación', `${p.action}: ${p.branch}\nRama actual: ${state.data.branch}`, 'Ejecutar')) await mutate(p.action, { branch: p.branch });
}
async function stashActions(stash) {
  const p = await modal({ title: 'Cambios guardados.', description: stash.subject, fields: [{ name: 'action', label: 'Operación', options: [{ value: 'stashApply', label: 'Aplicar y conservar el stash' }, { value: 'stashDrop', label: 'Eliminar el stash' }] }], submit: 'Continuar' });
  if (!p) return;
  if (p.action === 'stashDrop' && !await confirm('Eliminar stash', `Se eliminará ${stash.name}. Esta acción puede perder los cambios guardados.`, 'Eliminar stash')) return;
  await mutate(p.action, { stash: stash.name });
}
function renderRecent() {
  const recent = state.info?.recent || []; $('recent-section').hidden = !recent.length; $('recent-list').replaceChildren();
  for (const repo of recent.slice(0, 5)) { const b = el('button', 'recent-item'); const label = el('div'); label.append(el('strong', '', repo.split(/[\\/]/).pop()), el('small', '', repo)); b.append(el('span', '', '▣'), label, el('span', '', '↗')); b.addEventListener('click', () => openRepo('recent', repo)); $('recent-list').append(b); }
}
async function switchRepo() {
  const options = [{ value: 'open', label: 'Abrir otra carpeta…' }, { value: 'clone', label: 'Clonar repositorio…' }, { value: 'init', label: 'Crear repositorio…' }, ...(state.info?.recent || []).map(repo => ({ value: repo, label: repo }))];
  const result = await modal({ title: 'Tu espacio de trabajo.', fields: [{ name: 'repo', label: 'Repositorio', options }], submit: 'Abrir' });
  if (!result) return; if (result.repo === 'clone') return cloneRepo();
  await openRepo(['open', 'init'].includes(result.repo) ? result.repo : 'recent', result.repo);
}
$('modal-close').onclick = $('modal-cancel').onclick = () => $('modal').close();
$('welcome-open').onclick = () => openRepo(); $('welcome-clone').onclick = cloneRepo;
$('welcome-init').onclick = async () => { if (await confirm('Crear repositorio', 'Elegí una carpeta para inicializar Git con la rama main. Sus archivos existentes se conservarán.', 'Elegir carpeta')) openRepo('init'); };
$('repo-switch').onclick = switchRepo;
document.querySelector('.brand').onclick = e => { e.preventDefault(); $('workspace').hidden = true; $('welcome').hidden = false; };
$('theme-toggle').onclick = () => { document.body.classList.toggle('light'); localStorage.setItem('gitthor-theme', document.body.classList.contains('light') ? 'light' : 'dark'); };
if (localStorage.getItem('gitthor-theme') === 'light') document.body.classList.add('light');
$('about').onclick = () => modal({ title: 'GitThor. Tu Git, sin límites.', description: `Versión ${state.info?.version || '0.1.0'} · MIT\nCliente Git independiente para Windows y Linux.\nInspirado en el flujo de trabajo de los clientes visuales. No afiliado a GitKraken.\n\n${state.info?.gitVersion || ''}`, submit: 'Volver al código' });
$('refresh').onclick = () => task('Actualizando…', refresh);
$('search').oninput = event => { state.query = event.target.value; renderHistory(); };
$('load-more').onclick = () => task('Cargando historial…', async () => { state.limit += 400; await refresh(); });
$('new-branch').onclick = createBranch; $('branch-actions').onclick = branchActions;
$('fetch').onclick = () => mutate('fetch', {}, 'Referencias remotas actualizadas');
$('pull').onclick = async () => { if (await confirm('Recibir cambios', 'Se ejecutará pull --ff-only. Si el historial diverge, Git se detendrá para que elijas cómo integrarlo.', 'Recibir cambios')) mutate('pull', {}, 'Rama actualizada'); };
$('push').onclick = async () => {
  if (!state.data.remotes.length) return toast('Agregá un remoto con el botón + de la barra lateral.');
  const p = await modal({ title: 'Compartí tu trabajo.', description: `Se enviará la rama ${state.data.branch}. No se fuerza la actualización del remoto.`, fields: [{ name: 'remote', label: 'Remoto de destino', options: state.data.remotes }], submit: 'Push' });
  if (p) await mutate('push', { remote: p.remote, branch: state.data.branch }, 'Cambios enviados');
};
$('add-remote').onclick = async () => { const p = await modal({ title: 'Conectá tu repositorio.', fields: [{ name: 'name', label: 'Nombre', value: 'origin' }, { name: 'url', label: 'URL del remoto', placeholder: 'https://github.com/equipo/proyecto.git' }], submit: 'Agregar remoto' }); if (p) mutate('addRemote', p, 'Remoto agregado'); };
$('new-stash').onclick = async () => { const p = await modal({ title: 'Guardá la idea para después.', description: 'Se guardarán los cambios preparados, locales y archivos nuevos. Los archivos ignorados permanecen en su lugar.', fields: [{ name: 'message', label: 'Descripción', value: 'Trabajo en progreso' }], submit: 'Guardar stash' }); if (p) mutate('stash', p, 'Cambios guardados'); };
$('stage-all').onclick = () => mutate('stage', { paths: state.data.files.filter(f => f.unstaged).flatMap(f => f.original ? [f.path, f.original] : [f.path]) }, 'Archivos preparados');
$('unstage-all').onclick = () => mutate('unstage', { paths: state.data.files.filter(f => f.staged).flatMap(f => f.original ? [f.path, f.original] : [f.path]) }, 'Archivos retirados del área de preparación');
$('commit-message').oninput = () => { $('message-length').textContent = $('commit-message').value.length; updateButtons(); };
$('commit').onclick = () => { if (!$('commit').disabled) mutate('commit', { message: $('commit-message').value.trim() }, 'Un nuevo capítulo. Commit creado.'); };
$('continue-operation').onclick = () => mutate('continue');
$('abort-operation').onclick = async () => { if (await confirm('Abortar operación', 'Git volverá al estado anterior a la operación en curso. Revisá los archivos antes de continuar.', 'Abortar')) mutate('abort'); };
$('working-row').onclick = $('view-changes').onclick = () => { setTab('changes'); closeDiff(); $('commit-message').focus(); };
$('view-history').onclick = () => $('search').focus();
$('tab-changes').onclick = () => { setTab('changes'); closeDiff(); };
$('tab-commit').onclick = () => { if (state.selected) selectCommit(state.selected); else toast('Seleccioná un commit del historial.'); };
$('close-diff').onclick = closeDiff;
$('reveal').onclick = () => { if (api && state.repo) unwrap(api.reveal(state.repo)).catch(e => toast(e.message, true)); };
document.addEventListener('keydown', event => {
  if ($('modal').open) return;
  if (event.ctrlKey || event.metaKey) {
    if (event.key === '1' && state.repo) { event.preventDefault(); $('search').focus(); }
    if (event.key.toLowerCase() === 'o') { event.preventDefault(); openRepo(); }
    if (event.key.toLowerCase() === 'k' && state.repo) { event.preventDefault(); $('search').focus(); }
    if (event.key.toLowerCase() === 'r' && state.repo) { event.preventDefault(); task('Actualizando…', refresh); }
    if (event.key === 'Enter' && state.repo) { event.preventDefault(); $('commit').click(); }
  }
});
api?.onCommand(command => { if (command === 'open') openRepo(); if (command === 'clone') cloneRepo(); if (command === 'refresh') task('Actualizando…', refresh); });
window.addEventListener('focus', () => { if (state.repo && !state.busy && !$('modal').open) refresh().catch(e => toast(e.message, true)); });
if (api) unwrap(api.info()).then(info => { state.info = info; $('git-version').textContent = info.gitVersion; $('app-version').textContent = info.version; renderRecent(); }).catch(e => toast(e.message, true));
else { $('browser-notice').hidden = false; $('git-version').textContent = 'Vista de presentación'; }
updateButtons();
