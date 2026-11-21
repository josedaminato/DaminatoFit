# Fase 6 — Comunicación, avisos y notificaciones

Comunicación **unidireccional**: el entrenador publica avisos y envía mensajes. El alumno los lee en el espacio del entrenador activo y, si quiere responder, usa WhatsApp. No hay chat ni endpoint de respuesta.

## Modelo

Un aviso es **una fila** en `announcements`. No se copia por alumno.

| Estado    | Regla                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Borrador  | `published_at` y `archived_at` nulos. Solo lo ve el entrenador.                                               |
| Publicado | `published_at` definido y `archived_at` nulo. Lo ven los alumnos activos, también los que se sumaron después. |
| Archivado | `archived_at` definido. Deja de verse para alumnos. El entrenador conserva el historial.                      |

Un aviso publicado no se edita. El título admite hasta 120 caracteres y el cuerpo hasta 4000. El texto se guarda y se muestra como texto plano: no hay HTML.

`announcement_reads` guarda la primera lectura de cada membresía. Marcar como leído otra vez no crea otra fila ni cambia la fecha.

`direct_messages` es un mensaje del entrenador a **una** membresía de alumno activa de su tenant. El cuerpo admite hasta 2000 caracteres y no se puede editar. `read_at` lo estampa solo el alumno destinatario, una sola vez. No hay respuesta.

## Quién ve qué

La API usa la membresía activa (`x-tenant-id` validado contra la sesión). No acepta un tenant elegido por el cliente si no hay membresía activa en esa marca.

- El alumno ve avisos publicados y sus mensajes de **ese** entrenador.
- Al cambiar de entrenador cambian avisos, mensajes, no leídos y el número de WhatsApp.
- Otro alumno no puede leer un mensaje cambiando el id.
- Otro entrenador no puede leer avisos ajenos.
- DaminatoFit y PupiApp siguen separados por reino: una sesión de una marca no abre la otra.

Los no leídos salen de PostgreSQL (`GET /v1/communications/unread`). La app los refresca al abrir la sección y al volver a primer plano. No hay WebSocket ni polling periódico.

## Notificaciones push

La fuente de verdad es la base. El push solo avisa.

Cola `notification_deliveries`, idempotente por `kind + aviso/mensaje + usuario + dispositivo`. Un reintento actualiza la misma fila. Un fallo de envío no borra el aviso ni el mensaje.

El payload permitido es fijo:

- Aviso: «Nuevo aviso» / «Tenés un aviso nuevo de tu entrenador.»
- Mensaje: «Nuevo mensaje» / «Tenés un nuevo mensaje de tu entrenador.»
- Datos: `kind`, `entityId`, `tenantId`.

No entra el texto del mensaje, ni rutinas, ni progreso. El worker rechaza cualquier otro texto. Al pulsar, la app abre el detalle solo si la membresía sigue activa y la API autoriza la lectura.

Tokens en `push_devices`: pertenecen a la **cuenta y al dispositivo**, no a un tenant. Se pueden revocar. Un token que Expo marca como inválido pasa a `invalid` y no se reintenta. Si la membresía deja de estar activa, la entrega queda `skipped`.

Preferencias por cuenta: avisos y mensajes, por separado. Si están apagadas, no se encola el push. El contenido sigue en la app.

La app pide permiso **en la pantalla de comunicaciones**, no al abrir. Si la persona rechaza, la app sigue funcionando.

### Qué no está verificado en un teléfono

`PUSH_PROVIDER=mock` (valor local) no llama a Expo ni a Apple/Google. Un ticket `mock-*` significa que el adaptador de prueba aceptó el payload.

`PUSH_PROVIDER=expo` usa `POST https://exp.host/--/api/v2/push/send` y exige `EXPO_ACCESS_TOKEN`. Sin ese token el envío queda en reintento y no se declara entregado. Tampoco hay `EXPO_PUBLIC_EAS_PROJECT_ID`: sin él el teléfono no obtiene un token.

No se contrataron servicios ni se cargaron credenciales de producción.

La cola se procesa al publicar o enviar (si `PUSH_AUTOPROCESS=true`) y con `pnpm --filter @daminatofit/api notifications:once`, pensado para un cron corto. No hay proceso residente ni WebSocket.

Límites por defecto, configurables: 20 avisos publicados por tenant cada 24 h, 40 mensajes por hora y 10 mensajes por alumno cada 24 h. También hay un tope de 30 borradores abiertos.

## WhatsApp

Se reutiliza `trainer_profiles.whatsapp_e164` del entrenador activo. El enlace es `https://wa.me/<número>`. No se envía un mensaje automático, no se usa la API comercial y no se guardan chats externos. Si el número no está, la pantalla lo dice. Si el sistema no puede abrir el enlace, la app lo informa y sigue usable.

## Retención

No se inventa un plazo de borrado.

- Eliminar la cuenta (Fase 2.1) archiva membresías y el espacio del entrenador. Los avisos y mensajes históricos **no se borran**: dejan de ser accesibles porque la membresía ya no está activa.
- En la misma operación se revocan los tokens de ese usuario y se omiten los pushes pendientes (`account_deleted`).
- Archivar un alumno o un aviso no borra filas. El alumno archivado deja de recibir pushes y de ver el espacio.
- Backups y plazos legales siguen pendientes de asesoramiento. Ver `docs/privacy-account-deletion.md`.

## Migración

`apps/api/src/db/migrations/0008_communications.sql`.

Tablas nuevas con RLS forzado: `push_devices`, `notification_preferences`, `notification_deliveries`. La cola no tiene política de lectura para `app_user`: el cliente no la consulta.
