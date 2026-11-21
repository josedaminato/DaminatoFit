# Privacidad y puntos legales para las tiendas

Esto no es asesoramiento jurídico. Sirve para no olvidar qué tiene que decir la política pública y qué ya hace el sistema. La jurisdicción (por ejemplo Ley 25.326 si se opera en Argentina) sigue pendiente de confirmación.

## Datos que la app maneja hoy

- Cuenta: nombre, correo, contraseña (en el proveedor de autenticación, no en texto plano de dominio).
- Membresía con un entrenador.
- Rutinas, entrenamientos y progreso (fases anteriores).
- Apariencia y logotipo del entrenador (Fase 5.1), en almacenamiento privado con URL firmada.
- Avisos y mensajes de texto del entrenador hacia sus alumnos (Fase 6).
- Token de notificaciones del dispositivo, si la persona lo acepta. No identifica un solo gimnasio: va con la cuenta.
- Número de WhatsApp que el entrenador carga en su perfil. La app solo arma el enlace. No lee ni guarda la conversación.

El payload push no incluye el texto del mensaje individual, ni pesos, ni rutinas.

## Eliminación de cuenta

Implementada en Ajustes: la persona escribe `ELIMINAR` y su contraseña.

Efecto técnico, ya documentado en `docs/privacy-account-deletion.md`:

- Se borran las credenciales y las sesiones de esa marca.
- Se archivan sus membresías y, si es entrenador, su espacio.
- No se borran en cascada los historiales que otras personas necesitan (por ejemplo el aviso que ya leyeron otros alumnos).
- Desde la Fase 6 también se revocan los tokens de push y se cancelan envíos pendientes de esa cuenta.

Las tiendas piden que este camino exista y que la ficha lo describa. Falta la URL pública de la política y la revisión legal del plazo de backups.

## Contenido generado por entrenadores

Avisos y mensajes son texto del entrenador. La app no los interpreta como HTML.

Para las recomendaciones de un entrenador ya existe una denuncia (fraudulenta, engañosa, peligrosa, inapropiada o enlace sospechoso) y el panel admin puede ocultarlas. Sigue faltando, y no está construido para avisos y mensajes:

- Denunciar un aviso o un mensaje.
- Bloquear a un entrenador desde el alumno más allá de dejar de usar el espacio.
- Un contacto público del responsable de PupiApp. El de DaminatoFit es info@daminatofit.com y WhatsApp +54 9 11 2765-4198.

Hasta eso, no conviene presentar las fichas como listas.

El entrenador es responsable del texto que publica a sus alumnos. La política pública tiene que decirlo con el alcance que defina el asesoramiento, no con una frase inventada acá.

## Logotipos y marcas

- El ícono de cada app (DaminatoFit y PupiApp) tiene que ser de quien publica. No hay en este repositorio una cesión de derechos.
- El logotipo que sube un entrenador es para su espacio dentro de DaminatoFit, no una licencia para registrarlo como ícono de la tienda.
- No se incorporan documentos personales, DNI ni contratos al repositorio.

## Notificaciones

- El permiso es opcional y posterior al uso de la sección de comunicaciones.
- Hay que declararlo en Data safety y en Privacy Nutrition.
- Sin credenciales de Expo, Apple y Google el canal no está activo en producción. No afirmar lo contrario en la ficha.

## WhatsApp

Canal externo, iniciado por el alumno, con el número del entrenador activo. No es un producto de mensajería de Meta integrado por API. La política puede mencionarlo como salida voluntaria de la app.
