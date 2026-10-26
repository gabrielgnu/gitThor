// Native Debian packaging avoids requiring a fictitious public project homepage.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pkg = require('../package.json');
async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Generá estos paquetes desde Linux x64.');
  const root = path.resolve(__dirname, '..');
  execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--linux', 'AppImage', '--x64', '--publish', 'never'], { cwd: root, stdio: 'inherit' });
  const staging = await fs.mkdtemp(path.join(root, 'dist/deb-staging-'));
  const target = name => path.join(staging, name);
  await fs.mkdir(target('DEBIAN'), { recursive: true });
  await fs.mkdir(target('opt'), { recursive: true });
  await fs.cp(path.join(root, 'dist/linux-unpacked'), target('opt/GitThor'), { recursive: true });
  for (const dir of ['usr/bin', 'usr/share/applications', 'usr/share/icons/hicolor/512x512/apps', 'usr/share/doc/gitthor']) await fs.mkdir(target(dir), { recursive: true });
  await fs.symlink('/opt/GitThor/gitthor', target('usr/bin/gitthor'));
  await fs.copyFile(path.join(root, 'assets/icon.png'), target('usr/share/icons/hicolor/512x512/apps/gitthor.png'));
  await fs.copyFile(path.join(root, 'LICENSE'), target('usr/share/doc/gitthor/copyright'));
  await fs.copyFile(path.join(root, 'README.md'), target('usr/share/doc/gitthor/README.md'));
  for (const name of ['PRIVACY.md', 'SECURITY.md']) await fs.copyFile(path.join(root, name), target('usr/share/doc/gitthor/' + name));
  await fs.cp(path.join(root, 'docs'), target('usr/share/doc/gitthor/docs'), { recursive: true });
  await fs.writeFile(target('usr/share/applications/gitthor.desktop'), '[Desktop Entry]\nType=Application\nName=GitThor\nComment=Visual Git client\nExec=/opt/GitThor/gitthor %U\nIcon=gitthor\nTerminal=false\nCategories=Development;RevisionControl;\nStartupWMClass=gitthor\n');
  await fs.writeFile(target('DEBIAN/control'), `Package: gitthor\nVersion: ${pkg.version}\nSection: devel\nPriority: optional\nArchitecture: amd64\nMaintainer: GitThor contributors\nDepends: ${pkg.build.deb.depends.join(', ')}\nDescription: Open source visual Git client\n Local history graph, branches, diffs, commits, stash and remote operations.\n`);
  await fs.writeFile(target('opt/GitThor/resources/apparmor-profile'), 'abi <abi/4.0>,\ninclude <tunables/global>\nprofile gitthor /opt/GitThor/gitthor flags=(unconfined) {\n  userns,\n}\n');
  await fs.writeFile(target('DEBIAN/postinst'), `#!/bin/sh\nset -e\nif [ "$1" = configure ]; then\n  chmod 4755 /opt/GitThor/chrome-sandbox\n  if command -v apparmor_parser >/dev/null 2>&1 && test -f /etc/apparmor.d/abi/4.0; then\n    cp /opt/GitThor/resources/apparmor-profile /etc/apparmor.d/gitthor\n    apparmor_parser -r /etc/apparmor.d/gitthor || true\n  fi\n  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database /usr/share/applications || true; fi\nfi\n`);
  await fs.writeFile(target('DEBIAN/postrm'), `#!/bin/sh\nset -e\nif [ "$1" = remove ] || [ "$1" = purge ]; then\n  if test -f /etc/apparmor.d/gitthor; then\n    if command -v apparmor_parser >/dev/null 2>&1; then apparmor_parser -R /etc/apparmor.d/gitthor || true; fi\n    rm -f /etc/apparmor.d/gitthor\n  fi\n  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database /usr/share/applications || true; fi\nfi\n`);
  await fs.chmod(target('DEBIAN/postinst'), 0o755); await fs.chmod(target('DEBIAN/postrm'), 0o755);
  const artifact = path.join(root, `dist/GitThor-${pkg.version}-linux-amd64.deb`);
  execFileSync('dpkg-deb', ['--build', '--root-owner-group', staging, artifact], { stdio: 'inherit' });
  // Staging is a fresh directory created above, inside this project's dist directory.
  if (path.dirname(staging) === path.join(root, 'dist') && path.basename(staging).startsWith('deb-staging-')) await fs.rm(staging, { recursive: true, force: true });
  console.log('Debian package:', artifact);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
