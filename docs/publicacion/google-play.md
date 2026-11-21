# Google Play

Requisitos conocidos a noviembre de 2026. **Verificar** cada punto en la consola y en la ayuda oficial antes de enviar. Nada de esta lista está tramitado.

## Cuenta y ficha

- Cuenta de Play Console (personal o de organización). Una cuenta personal nueva puede exigir una prueba cerrada con 12 testers durante 14 días. Confirmar si esa regla sigue vigente y si aplica a esta cuenta.
- Ficha separada para DaminatoFit y otra para PupiApp. No reutilizar el nombre, el ícono ni las capturas.
- Application ID definitivo, no `com.example.*`.
- Firma de la app con Play App Signing. Las claves no van al repositorio.
- Política de privacidad en una URL pública.
- Clasificación de contenido (cuestionario IARC).
- Formulario de seguridad de los datos (Data safety), alineado con lo que la app realmente recoge.
- Público objetivo y si la app es para niños. Estas apps son para entrenadores y alumnos adultos; no declarar un público infantil si no es cierto.

## Nivel de API y permisos

- `targetSdk` mínimo exigido por Play en la fecha de envío. Cambia todos los años: verificar el número actual. No copiar un número viejo de memoria.
- Permiso `POST_NOTIFICATIONS` (Android 13+) porque la app puede pedir notificaciones. Declararlo en Data safety como opcional. La app funciona si la persona lo rechaza.
- No hay servicios en primer plano ni acceso a contactos, ubicación o SMS.
- El enlace de WhatsApp abre `https://wa.me/...`. No es la API de WhatsApp Business y no hay que declarar un envío masivo.

## Notificaciones

- En Data safety: identificador de dispositivo de push (token de Expo), asociado a la cuenta, usado para avisar avisos y mensajes.
- El texto de la notificación de un mensaje individual es genérico. No promete en la ficha un contenido que el payload no lleva.
- Hace falta un build con credenciales FCM / Expo para probar en un dispositivo real. Eso **no está hecho**.

## Contenido y cuentas

- Las cuentas se crean en la app. Play exige un camino de eliminación de cuenta si el usuario puede registrarse. Existe en Ajustes (confirmar `ELIMINAR` y contraseña). La URL o los pasos tienen que coincidir con la ficha.
- Los entrenadores publican texto (avisos y mensajes). Ver `privacidad-y-legales.md`: falta un mecanismo de denuncia antes de considerar la ficha completa.
- No hay compras dentro de la app en esta fase. No declarar productos de facturación.

## Material

- Ícono, gráfico de funciones y capturas de teléfono en los tamaños que pida la consola ese día.
- Texto de la ficha en el idioma de publicación. No usar capturas de otra marca.
