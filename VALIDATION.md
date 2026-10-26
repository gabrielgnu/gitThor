# Validación de GitThor 0.1.0

Esta sección conserva la validación inicial de 0.1.0. La revisión posterior **0.1.1**, con refuerzos de seguridad y pruebas de privacidad, está documentada en [docs/security-tests.md](docs/security-tests.md). Usá 0.1.1 para obtener esos cambios.

Ejecución local: 26 de octubre de 2026. Fixtures sintéticos; no se usaron repositorios de clientes ni remotos de terceros para las pruebas Git.

| Validación | Entorno | Resultado |
| --- | --- | --- |
| Sintaxis del proceso principal, preload, motor e interfaz | Windows / Ubuntu | Correcta |
| 13 pruebas del motor Git | Windows, Git 2.52.0 | 13/13 |
| 13 pruebas del motor Git | Ubuntu 24.04 WSL2, Git 2.43.0 | 13/13 |
| Interfaz Electron en desarrollo | Windows, Electron 45 | Correcta |
| Binario Windows empaquetado | Windows, inicio directo con CDP | Historial, diff, stage y commit real correctos |
| Binario Linux empaquetado | Ubuntu 24.04 WSLg | Correcto |
| ZIP Windows x64 | Binario empaquetado verificado | Generado y comprobado |
| AppImage Linux x86_64 | Ubuntu WSL2 | Generado |
| Paquete Debian amd64 | dpkg-deb en Ubuntu WSL2 | Generado; control y dependencias inspeccionados |

El motor cubre repositorio vacío, mensajes multilínea, separación de index y working tree, Unicode y espacios, renombres, pathspecs literales, ramas, tags anotados, stash, remotos locales, clone/fetch/pull/push, merge con conflictos, aborto y continuación, rebase, cherry-pick, serialización de cambios al index y worktrees vinculados.

La interfaz de escritorio cubre abrir, historial y grafo, diferencias, stage/unstage individual y global, commit con comprobación en Git, detalle del commit, búsqueda, crear y cambiar ramas, ambos temas y ventana mínima. Se verificó la ausencia de errores JavaScript/CSP, Node deshabilitado en el renderer y preferencias de aislamiento. Las capturas quedan en `test-results/` y `test-results/linux/`.

## Condiciones y pendientes

- Ubuntu se probó en WSLg, no en un equipo Linux físico. Se descargaron `libnspr4`, `libnss3` y `libasound2t64` a una caché exclusiva de pruebas; no se instalaron paquetes globales ni se modificaron las bibliotecas del sistema.
- La prueba Linux de Playwright usa `--no-sandbox` para automatización. No acredita por sí sola el funcionamiento del sandbox de una instalación normal. El `.deb` incluye la configuración necesaria para el sandbox y AppArmor; su instalación debe validarse en un entorno limpio.
- Las pruebas de interfaz usan los binarios de `win-unpacked` y `linux-unpacked`. El ZIP contiene el binario Windows verificado. FUSE de AppImage y los scripts de instalación/desinstalación del `.deb` no se dieron por verificados solo por compilar.
- El instalador NSIS no se generó correctamente en este entorno y el autoextraíble portable generado no pudo iniciarse con `spawn EPERM`. Se entregó un ZIP con la aplicación Windows verificada; siguen disponibles los scripts opcionales de NSIS y portable para otros entornos.
- El modo de lanzamiento empaquetado de Playwright mediante shell falló en Windows. La prueba `packaged-smoke.cjs` evita shell y el inspector Node, e hizo pasar el flujo real sobre el ejecutable empaquetado.
- No se ejecutó todavía la interfaz en Debian. La plantilla `ci/github-actions.yml` incluye Debian 12 en contenedor y Ubuntu 24.04; no está activa como workflow. La publicación se hizo sin conceder el permiso OAuth adicional `workflow`.
- No se validaron servidores privados, autenticación HTTPS/SSH, GPG, hooks externos, repositorios masivos ni versiones anteriores de Windows/Linux.
- Los binarios no tienen firma propia del proyecto. El código se entrega bajo licencia MIT. El repositorio público previsto es `gabrielgnu/gitThor`; no se publicaron releases con binarios.

## Referencias de implementación

- [Aislamiento y seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security/)
- [Formatos de distribución de electron-builder](https://www.electron.build/docs/targets/)

Estas referencias orientaron la implementación; los resultados de la tabla provienen de ejecuciones locales.
