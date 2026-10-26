# GitThor

Cliente Git visual, open source e independiente, inspirado en los flujos de trabajo de GitKraken. Implementación propia con licencia MIT, sin servicios obligatorios ni suscripciones. No está afiliado a GitKraken y no usa su código ni sus recursos de marca.

**Mantenedor:** [@gabrielgnu](https://github.com/gabrielgnu). Repositorio del proyecto: [gabrielgnu/gitThor](https://github.com/gabrielgnu/gitThor).

## Acceso público y control de cambios

El repositorio es público: cualquier persona puede leerlo, descargarlo y crear un fork. La visibilidad pública no concede permiso para escribir en este repositorio, hacer push ni fusionar cambios. El mantenedor conserva el control de las incorporaciones y de los permisos de colaboración.

La licencia [MIT](LICENSE) permite usar, modificar y distribuir copias, incluidos los forks, conservando el aviso de licencia y copyright. Esto no otorga acceso de escritura al proyecto original. Los pull requests son propuestas: no cambian el código del proyecto hasta que una persona autorizada los incorpora.

## Obtener el código

```sh
git clone https://github.com/gabrielgnu/gitThor.git
cd gitThor
```

También podés descargar un ZIP desde **Code → Download ZIP**. El repositorio contiene el código fuente; los archivos de `dist/`, las dependencias y los perfiles de prueba no se versionan. Cuando haya una versión publicada, sus paquetes estarán en [Releases](https://github.com/gabrielgnu/gitThor/releases).

## Iniciar

Requisitos de desarrollo: **Node.js 22.12 o posterior** (se recomienda Node.js 24), npm y **Git 2.39 o posterior** en `PATH`.

```sh
npm ci
npm start
```

En Electron 45 el binario se descarga en el primer inicio o al empaquetar. Hace falta conexión a GitHub para esa descarga. Las operaciones locales funcionan sin conexión después de instalarlo.

La aplicación instalada solo requiere Git; no requiere Node.js. En Windows se puede instalar [Git for Windows](https://git-scm.com/download/win). En Debian y Ubuntu:

```sh
sudo apt update
sudo apt install git
```

Configurá la identidad que Git usará en tus commits:

```sh
git config --global user.name "Tu nombre"
git config --global user.email "tu@email.com"
```

## Funciones disponibles

- Abrir repositorios y worktrees, inicializar y clonar mediante HTTPS, SSH o una ruta local.
- Historial con grafo de padres y merges, autor, fecha, referencias y búsqueda entre commits cargados. Carga incremental hasta 5000 commits.
- Cambios locales y preparados por separado; preparar y quitar archivos individualmente o en conjunto.
- Diferencias de archivos, vista previa de archivos nuevos y detalle de commits.
- Commits con mensaje de varias líneas. Respeta la identidad, hooks y firma de Git del equipo.
- Crear y cambiar ramas, seguir ramas remotas y eliminar ramas integradas usando `git branch -d`.
- Merge, rebase y cherry-pick; detección de conflictos y controles para continuar o abortar. Los conflictos se editan con tu editor habitual y se preparan desde GitThor.
- Fetch con prune, pull mediante avance rápido y push sin force. Alta de remotos.
- Stash con archivos nuevos, aplicar conservando el stash y eliminación confirmada.
- Repositorios recientes, tema claro/oscuro, menús nativos y atajos `Ctrl+O`, `Ctrl+K`, `Ctrl+R` y `Ctrl+Enter`.

## Autenticación

GitThor usa Git instalado y su credential helper o agente SSH. Para remotos privados, configurá primero el acceso con Git desde una terminal. Los diálogos interactivos de credenciales de Git están desactivados para evitar procesos bloqueados; los errores se muestran en la aplicación. Nunca ingreses tokens en la URL: usá el administrador de credenciales de tu sistema.

Los repositorios son contenido de confianza: Git puede ejecutar los hooks, filtros y helpers configurados al realizar sus operaciones habituales. GitThor no expone una consola arbitraria al renderer. Usa `execFile` sin shell, aislamiento de contexto, sandbox, CSP y validación del emisor IPC. Las diferencias desactivan external diff y textconv.

## Empaquetar

```sh
# En Windows: ZIP x64 (extraer y abrir GitThor.exe)
npm run dist:win

# Autoextraíble portable (opcional)
npm run dist:win:portable

# Instalador NSIS (opcional)
npm run dist:win:installer

# En Linux: paquete Debian/Ubuntu y AppImage x64
npm run dist:linux
```

Los resultados quedan en `dist/`. Linux usa electron-builder para AppImage y `dpkg-deb` para `.deb`. Compilá cada plataforma en su sistema. La plantilla [ci/github-actions.yml](ci/github-actions.yml) está preparada para generar artefactos de Windows y Ubuntu y ejecutar pruebas dentro de Debian 12.

**GitHub Actions está inactivo en esta publicación.** Para activarlo, el mantenedor debe copiar la plantilla a `.github/workflows/build.yml` usando una sesión con permiso para administrar workflows. Se publicó como plantilla para conservar una autenticación sin el permiso OAuth adicional `workflow`. La plantilla no publica releases; guarda los resultados como artefactos de la ejecución.

Desde WSL podés ejecutar `bash scripts/linux-build.sh`: descarga Node 24 con comprobación SHA-256 y compila una copia aislada en `~/.cache/gitthor/`, sin cambiar Node ni los paquetes globales. Conserva esa carpeta para diagnóstico y copia los paquetes a `dist/`.

El objetivo es Windows 10/11 x64, Debian 12/13 x64 y Ubuntu 22.04/24.04 x64. La compatibilidad se debe confirmar ejecutando los artefactos en cada distribución; tener una configuración de build no equivale a una instalación validada. El instalador Windows no está firmado. AppImage puede requerir FUSE (`libfuse2` o `libfuse2t64`, según la distribución); el `.deb` usa las dependencias del sistema.

```sh
sudo apt install ./GitThor-0.1.0-linux-amd64.deb
# O, con AppImage:
chmod +x GitThor-0.1.0-linux-x86_64.AppImage
./GitThor-0.1.0-linux-x86_64.AppImage
```

## Verificar

```sh
npm run check
npm test
npm run test:ui
# Linux sin sesión gráfica:
xvfb-run --auto-servernum npm run test:ui
```

Las pruebas del motor crean repositorios temporales y remotos bare locales: commits, stage/unstage, renombres, espacios y Unicode, ramas, merge con conflicto y resolución, rebase, cherry-pick, stash, clone/fetch/push/pull y validación de entradas. No contactan repositorios de terceros. La prueba de escritorio maneja la aplicación Electron real y guarda capturas en `test-results/`.

Para probar un binario Windows ya empaquetado, ejecutá `node scripts/packaged-smoke.cjs dist/win-unpacked/GitThor.exe`. Inicia el proceso directamente, conecta con Chromium y verifica un commit real desde la interfaz. Las pruebas de escritorio Linux de Playwright desactivan el sandbox del navegador para su ejecución en contenedores; el cliente distribuido conserva `sandbox: true` y el paquete Debian configura `chrome-sandbox` y el perfil AppArmor de GitThor al instalarse.

El detalle de pruebas ejecutadas y límites de esta entrega está en [VALIDATION.md](VALIDATION.md).

## Alcance de 0.1

Primera versión funcional del cliente, no paridad completa con GitKraken. No incluye panel de pull requests/issues, cuentas de proveedores, editor de conflictos de tres vías, stage por hunk, rebase interactivo, submódulos, LFS, firma administrada desde la interfaz ni actualizaciones automáticas. Los cambios externos se refrescan al volver a enfocar la ventana o con `Ctrl+R`. El filtro busca en el historial cargado. La vista previa limita archivos nuevos a 1 MB y las diferencias a 4000 líneas; Git limita cada salida a 24 MB y las operaciones de red a 3 minutos.

## Estructura

```text
electron/main.cjs        Ventana, diálogos, permisos y persistencia local
electron/preload.cjs     API IPC acotada
electron/git-service.cjs Motor Git multiplataforma
src/                    Interfaz HTML/CSS/JS, sin dependencias de ejecución
tests/                  Integración con Git real
scripts/ui-smoke.cjs     Prueba de la aplicación Electron
ci/github-actions.yml   Plantilla inactiva de pruebas y paquetes multiplataforma
```

Las rutas recientes se guardan en `app.getPath('userData')/settings.json`. El tema se guarda en el almacenamiento local de Electron. No hay telemetría ni backend remoto de GitThor.

## Contribuir

Podés reportar problemas en [Issues](https://github.com/gabrielgnu/gitThor/issues) o trabajar en tu propio fork y proponer un pull request. Describí el problema y cómo reproducirlo, añadí una prueba si cambia el comportamiento de Git y ejecutá las verificaciones antes de enviar una contribución. La aceptación de propuestas corresponde al mantenedor; presentar una propuesta no concede permisos sobre el repositorio original.

No incluyas credenciales ni repositorios de clientes en capturas o fixtures. Código bajo [MIT](LICENSE).
