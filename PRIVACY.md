# Privacidad de GitThor

Actualizado: 26 de octubre de 2026.

**No recopilamos ni enviamos datos de usuario a servidores de GitThor.** La aplicación no tiene backend propio, registro obligatorio, telemetría, analítica, publicidad, rastreadores ni envío automático de errores o informes de fallos.

## Datos que se procesan en tu equipo

GitThor necesita leer el repositorio que abrís: rutas, archivos, diferencias, ramas, historial y datos de autoría que ya existen en Git. Esa información se usa localmente para mostrar la interfaz y ejecutar las operaciones que solicitás. No se envía al mantenedor del proyecto.

La aplicación guarda localmente las rutas de hasta 12 repositorios recientes en `settings.json`, y el tema claro u oscuro en el almacenamiento local de Electron. Electron también puede crear archivos locales de caché y sesión en su perfil. Los repositorios recientes pueden contener tu nombre de usuario dentro de sus rutas: esos datos permanecen en el equipo y no se cifran específicamente por GitThor.

El perfil está en `app.getPath('userData')`; normalmente corresponde a `%APPDATA%/GitThor` en Windows y `~/.config/GitThor` en Linux. `GITTHOR_PROFILE`, si lo configuraste, cambia esa ubicación. Para borrar preferencias y caché, cerrá la aplicación y eliminá únicamente su perfil; eso no elimina los repositorios Git ubicados fuera de él.

## Conexiones que elegís realizar

Al solicitar clone, fetch, pull o push, el proceso Git instalado en tu equipo se conecta al remoto configurado. Un push puede enviar archivos, historial, mensajes y los nombres y correos de los autores incluidos en los commits. El servidor Git y su proveedor aplican sus propias políticas de privacidad y pueden registrar la conexión.

La interfaz de GitThor bloquea sus solicitudes HTTP, HTTPS, WebSocket y WSS. El corrector ortográfico de Electron está desactivado para evitar descargas automáticas de diccionarios. Este bloqueo no afecta al proceso Git, que necesita conectarse a los remotos elegidos por vos.

La descarga del código, los instaladores y las dependencias de desarrollo involucra a los servicios de distribución que elijas, como GitHub y npm. Sus políticas de privacidad son independientes. Si publicás un issue, comentario o pull request, vos decidís qué información compartir en GitHub; no incluyas credenciales ni datos privados.

## Credenciales y portapapeles

GitThor no ofrece un formulario de contraseñas ni un almacén de tokens. La autenticación de Git depende del credential helper o agente SSH que configuraste en el sistema. Los remotos nuevos con credenciales incrustadas en URLs HTTP/HTTPS se rechazan y se ocultan formatos habituales de secretos en los errores mostrados.

La aplicación permite copiar el identificador de un commit cuando usás el botón correspondiente. No necesita permisos de lectura programática del portapapeles, cámara, micrófono, geolocalización, notificaciones, USB ni puerto serie.

## Verificación

El código fuente es público y las pruebas se pueden ejecutar localmente. La política de seguridad y el alcance de la verificación están en [SECURITY.md](SECURITY.md). Estas pruebas verifican controles concretos; no son una garantía de ausencia total de fallos ni sustituyen una auditoría independiente.
