# App Store (Apple)

Requisitos conocidos a noviembre de 2026. **Verificar** en App Store Connect y en las App Review Guidelines vigentes. No hay cuenta, ni build, ni revisión iniciada.

## Cuenta y binario

- Apple Developer Program activo. Para PupiApp, la cuenta debería ser de quien tenga los derechos del nombre y del contenido (ver `pupiapp.md`).
- Bundle ID definitivo, no `com.example.*`.
- Firma, perfiles y clave APNs. No guardar certificados en el repositorio.
- Export compliance (cifrado): la app usa HTTPS del sistema. Confirmar el cuestionario en Connect; no asumir la respuesta.
- Clasificación por edades.

## Privacidad

- Nutrition labels (Privacy Nutrition) coherentes con los datos reales: cuenta, correo, contenido que escribe el entrenador, token de notificación, entrenamientos ya existentes.
- Política de privacidad en URL pública.
- Guideline 5.1.1: si hay registro, tiene que haber eliminación de cuenta dentro de la app. El flujo de Ajustes existe; hay que mostrarlo en la revisión y describirlo.
- El permiso de notificaciones se pide en la pantalla de comunicaciones, no al primer arranque. El texto del sistema debe explicar el uso (avisos del entrenador). Verificar el `NSUserNotificationsUsageDescription` / propósito que agregue el plugin de Expo en el build real.

## Notificaciones

- Capability Push Notifications y clave APNs (o el esquema que Expo pida en la fecha del build).
- Sin `EXPO_ACCESS_TOKEN`, sin project id de EAS y sin clave de Apple, **no hay push real**. No marcar la función como probada en dispositivo.
- El payload de un mensaje personal no incluye el texto del mensaje.

## Contenido generado por usuarios

Los avisos y mensajes los escribe el entrenador y los leen sus alumnos. Apple suele exigir, para contenido generado por usuarios, formas de filtrar contenido objetable, denunciar, bloquear al autor y un contacto del desarrollador (guideline 1.2). **Eso no está implementado.** Es un bloqueo conocido para enviar la app, no una función de esta fase.

## Rechazos que ya están identificados como riesgo

- Plantilla o spam (4.2.6 / 4.3) si PupiApp se percibe como un clon de DaminatoFit. Ver `pupiapp.md`.
- Pagos: no hay facturación en la app. Cuando exista, no se puede asumir que cobrar afuera esté permitido. Está pendiente y no forma parte de esta fase.

## Revisión

- Hace falta un usuario de entrenador y uno de alumno de demostración, con datos de prueba, no de personas reales.
- Esos usuarios **no están creados** para las tiendas.
- Indicar cómo llegar a avisos, mensajes, WhatsApp y eliminación de cuenta.
