# Seguridad de GitThor

## Versiones y mantenimiento

La revisión de seguridad se aplica al código de **0.1.1**. Los binarios 0.1.0 anteriores no contienen estos refuerzos y deben actualizarse o recompilarse. Esta primera versión no ofrece actualizaciones automáticas: verificá las publicaciones del mantenedor y mantené actualizado Git y el sistema operativo.

## Informar una vulnerabilidad

Usá el canal privado **Security → Report a vulnerability** del repositorio:

[Enviar un reporte privado](https://github.com/gabrielgnu/gitThor/security/advisories/new).

Incluí la versión, sistema operativo, pasos mínimos, impacto y, si podés, un repositorio sintético que reproduzca el problema. No publiques contraseñas, tokens ni información de clientes en issues públicos. No hay un programa de recompensas ni se promete un plazo de resolución.

## Controles incluidos

- Renderer con Node deshabilitado, aislamiento de contexto y sandbox configurado; CSP sin scripts inline, conexiones, frames ni workers externos.
- API de preload acotada. El proceso principal valida ventana, frame, URL y autorización del repositorio en cada llamada IPC.
- Navegaciones externas, popups y webviews bloqueados. Solicitudes web HTTP/HTTPS/WS/WSS de la sesión de la interfaz canceladas.
- Permisos sensibles denegados. La única excepción es la escritura de texto en el portapapeles de la ventana principal, usada al copiar un SHA.
- Corrector ortográfico desactivado para evitar las descargas automáticas de diccionarios.
- Git se ejecuta mediante `execFile`, sin shell, con argumentos separados, límites de tiempo y salida, y pathspecs literales en las operaciones sobre archivos.
- Validación de rutas, referencias, revisiones, acciones y nombres de carpetas. Las vistas previas rechazan enlaces fuera del repositorio seleccionado.
- Diff y textconv externos desactivados en las vistas de diferencias; fsmonitor externo desactivado; transporte ejecutable `ext` deshabilitado incluso si el repositorio lo configura.
- Rechazo de credenciales en URLs HTTP/HTTPS nuevas y de contraseñas en URLs SSH; ocultamiento de formatos habituales de secretos en errores. Los nombres de usuario SSH, como `git@servidor`, siguen permitidos. Ningún filtro de texto debe considerarse un detector universal de secretos.
- Texto del repositorio renderizado como texto, sin interpretarlo como HTML. El historial usa separadores NUL para que los caracteres de control de los mensajes no creen filas falsas.

## Ejecutar las pruebas

```sh
npm ci
npm run check
npm test
npm run test:security
npm run test:security:ui
npm audit --audit-level=low
```

En Linux sin sesión gráfica, usá `xvfb-run --auto-servernum npm run test:security:ui`. Las pruebas crean repositorios, perfiles y archivos canario sintéticos en directorios temporales, y un servidor HTTP canario que solo escucha en `127.0.0.1`. No atacan repositorios ni servicios de terceros. La auditoría de npm sí consulta su registro y verifica los paquetes del lockfile.

Las pruebas de IPC y permisos incluyen un harness aislado del proceso principal. Además, las pruebas de interfaz ejecutan una ventana Electron real e intentan inyectar HTML, invocar IPC desde otra ventana, navegar fuera y conectar con el servidor canario. El informe de esa ejecución queda en `test-results/security-ui-<plataforma>.json`.

## Límites relevantes

GitThor es un cliente para repositorios de confianza, no un sandbox para ejecutar proyectos desconocidos. Git puede ejecutar hooks, filtros clean/smudge, herramientas de firma, credential helpers y comandos SSH configurados en el equipo o repositorio al realizar las operaciones habituales. No se bloquean todos esos mecanismos porque forman parte de Git; no abras ni operes repositorios preparados por terceros sin revisarlos.

La conexión a los remotos la realiza Git y depende de sus protocolos y configuración. Preferí HTTPS o SSH y una versión mantenida de Git. El bloqueo de red de la interfaz no constituye un firewall para Git, el sistema operativo ni otras aplicaciones.

Las pruebas Linux automatizadas con Playwright ejecutan Chromium con `--no-sandbox`. Por eso no acreditan el funcionamiento del sandbox de una instalación normal de `.deb` o AppImage. La configuración distribuida mantiene el sandbox y no incluye ese flag de pruebas.

Los binarios actuales no tienen firma propia del proyecto. El checksum permite comprobar coincidencia con un artefacto publicado, pero no reemplaza una firma ni garantiza quién lo produjo. La auditoría de npm solo informa vulnerabilidades conocidas por ese servicio en ese momento. No se afirma que el software sea invulnerable ni que exista una auditoría independiente.

La información que permanece local y los intercambios con remotos se detallan en [PRIVACY.md](PRIVACY.md).
