# PupiApp como aplicación independiente

PupiApp comparte código con DaminatoFit y se publica como **otra app**, con su marca, su bundle id y su ficha. No es un cambio de tema dentro de DaminatoFit.

## Qué ya separa el producto

- Marca embebida propia (nombre, ícono, esquema `pupiapp://`).
- Reino de autenticación distinto. Una sesión de DaminatoFit no abre PupiApp.
- Tope de un espacio de entrenador y alta de ese entrenador por bootstrap, no por registro público.
- La personalización visual de entrenadores de la Fase 5.1 no pisa la marca de PupiApp.

## Qué hay que resolver antes de una ficha

Nada de esto está contratado ni presentado.

- Cuenta de desarrollador de Apple y de Google a nombre de quien tenga derechos sobre el nombre PupiApp, la imagen y los contenidos. Confirmar titular con la persona responsable.
- Bundle id e application id propios, distintos de DaminatoFit y distintos de `com.example.pupiapp`.
- Política de privacidad propia, aunque el texto técnico se parezca. La responsable de los datos de sus alumnos tiene que estar identificada. Eso es una decisión legal, no un texto inventado acá.
- Ícono, capturas y descripción que no sean una copia de DaminatoFit. Apple 4.2.6 y 4.3 sancionan apps que parecen plantilla o spam. El riesgo está anotado en la arquitectura y **no está resuelto** con una presentación.
- Credenciales de revisión del espacio PupiApp (entrenador bootstrap de prueba y un alumno). No crearlas con datos personales reales ni subirlas al repositorio.
- Las recomendaciones se pueden denunciar en ambas marcas. Avisos y mensajes siguen sin denuncia ni bloqueo. La ficha no está completa por eso.
- Notificaciones: mismo adaptador y mismas credenciales ausentes. Un token de PupiApp no sirve para DaminatoFit porque el reino y la marca son otros.

## Qué no hacer

- No publicar PupiApp desde la cuenta personal de otra marca «para probar».
- No reutilizar capturas, política ni ficha de DaminatoFit.
- No tratar la personalización multi-entrenador de DaminatoFit como si fuera una tienda de apps blancas.
