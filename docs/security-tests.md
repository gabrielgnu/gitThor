# Pruebas de seguridad y privacidad — 0.1.1

Fecha: **26 de octubre de 2026**. Pruebas realizadas por el desarrollo del proyecto sobre fixtures sintéticos. No se evaluaron repositorios de clientes ni servicios de terceros.

## Resultados

| Comprobación | Windows | Ubuntu 24.04 / WSLg |
| --- | --- | --- |
| Regresión funcional con Git real | 13/13 | 13/13 |
| Seguridad del motor, IPC y preload | 9/9 | 9/9 |
| Seguridad en ventana Electron real | 8/8 | 8/8 |
| Solicitudes recibidas por el servidor HTTP canario | 0 | 0 |

Windows ejecutó los escenarios de seguridad con Electron en modo de desarrollo. Ubuntu los ejecutó sobre el binario empaquetado. Los controles incluyen pruebas con harness aislado y pruebas de integración reales; se distinguen a continuación.

El binario Windows 0.1.1 se reconstruyó, pero los dos intentos de inicio directo con `scripts/packaged-smoke.cjs` devolvieron `spawn EPERM` en este entorno. **No se da por validado el arranque del paquete Windows 0.1.1.** No se modificaron las protecciones del sistema para intentar hacerlo funcionar. La validación empaquetada previa de 0.1.0 se conserva separadamente en `VALIDATION.md` y no se traslada a 0.1.1.

La consulta de **`npm audit` informó 0 vulnerabilidades conocidas**, incluyendo dependencias de desarrollo, para las dependencias del lockfile de esta revisión. Esto no equivale a afirmar que no existen vulnerabilidades en el producto, en Electron, en Git o en el sistema operativo.

Evidencia reproducible:

- [Informe de la ventana Windows](security-ui-windows.json).
- [Informe de la ventana Ubuntu](security-ui-ubuntu.json).
- [Resultado de auditoría de dependencias](dependency-audit-2026-10-26.json).
- [Pruebas del motor y de los límites IPC](../tests/security.test.cjs).
- [Pruebas reales de la interfaz](../scripts/security-ui.cjs).

## Nueve pruebas del motor y los límites de confianza

1. Rechazo de traversal, rutas externas, revisiones y acciones no admitidas. Los pathspecs `*` y `:(glob)**` no preparan todo el repositorio accidentalmente.
2. Mensajes con metacaracteres permanecen como texto literal en un commit; no crean archivos canario como si se hubieran ejecutado en una shell. Los archivos cuyo nombre empieza con `-` se manejan como rutas.
3. Diff, textconv, fsmonitor y transporte `ext` externos no ejecutan el helper canario al operar desde GitThor, aunque el repositorio configure esos mecanismos.
4. URLs nuevas con transportes ejecutables, tokens HTTP, contraseñas HTTP/SSH y nombres de carpeta reservados se rechazan. Los usuarios SSH legítimos continúan permitidos.
5. Los formatos habituales de credenciales se ocultan en errores, incluidos errores reales de Git. Se usan secretos sintéticos, nunca credenciales verdaderas.
6. Una vista previa no puede seguir un enlace fuera del repositorio elegido. Se verifica con enlace simbólico en Linux y junction en Windows.
7. El harness del proceso principal rechaza IPC de otras ventanas, frames o URLs, y repositorios que no se abrieron. Una llamada legítima sí llega al motor.
8. El harness verifica bloqueo de navegación, popups, red y permisos sensibles, y la excepción acotada para escribir texto en el portapapeles.
9. El preload expone únicamente los métodos previstos y no entrega el evento privilegiado de Electron a los callbacks del renderer.

## Ocho escenarios de la interfaz real

1. HTML y scripts dentro del historial y las diferencias aparecen como texto; no crean nodos ejecutables. Los caracteres de separación dentro de mensajes tampoco agregan filas falsas al historial.
2. El renderer no dispone de Node ni IPC sin filtrar; no puede solicitar un repositorio ajeno sin autorización.
3. Una segunda ventana creada por la prueba con el mismo preload no obtiene acceso al repositorio de la ventana principal.
4. La CSP bloquea scripts inline y el intento de `fetch` del renderer.
5. La sesión de Electron cancela un `fetch` HTTP antes de que llegue al servidor canario local; esto prueba el bloqueo adicional a la CSP.
6. Se deniegan notificaciones, se verifican las preferencias de aislamiento y se comprueba mediante la API de la sesión que el corrector ortográfico está desactivado.
7. Las preferencias propias solo contienen rutas recientes y tema; el contenido canario del repositorio no aparece en `settings.json`. El almacenamiento local probado solo contiene la clave del tema.
8. Popups y navegación a otra URL no sacan al usuario de la aplicación local ni llegan al servidor canario.

## Cambios que se verificaron

Se agregó el bloqueo de red de la interfaz y el control completo de permisos; se desactivó el corrector de la ventana y de la sesión para evitar descargas de diccionarios; se reforzaron validación de URLs, nombres y rutas, y el ocultamiento de credenciales en errores. Se desactivaron fsmonitor externo y transporte `ext`. El historial ahora usa separadores NUL para aceptar caracteres de control como texto sin alterar los registros.

## Alcance y límites

No se realizó una auditoría independiente, análisis completo de tráfico del sistema operativo, pentest de servidores remotos, revisión de Git/Chromium nativos, prueba de todos los credential helpers ni validación de instalación en Debian. Las pruebas no garantizan ausencia de vulnerabilidades.

Playwright agrega `--no-sandbox` en la automatización Linux. La prueba comprueba preferencias y controles de la aplicación, pero no acredita el sandbox de Chromium en una instalación normal. `.deb` y AppImage se generan con el sandbox configurado; instalación, integración AppArmor y FUSE requieren validación adicional.

Los hooks, filtros de Git y agentes SSH/credenciales siguen siendo herramientas de confianza del equipo. El bloqueo HTTP de Electron no bloquea el proceso Git ni otros procesos del sistema. Los límites se detallan en [SECURITY.md](../SECURITY.md), y el tratamiento de información en [PRIVACY.md](../PRIVACY.md).

La plantilla de CI fue ampliada con estas pruebas y permanece inactiva; no se solicitó un permiso OAuth `workflow` adicional para publicar esta revisión.
