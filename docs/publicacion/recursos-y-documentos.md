# Recursos y documentos para la ficha

Nada de esta lista está producido para una tienda. No subir a este repositorio capturas con datos reales, contratos, pasaportes ni claves.

## Gráficos

| Pieza                                         | Estado                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ícono DaminatoFit de tienda (tamaños finales) | Pendiente. Los assets de `apps/mobile/assets` son de desarrollo.                                    |
| Ícono PupiApp de tienda                       | Pendiente y distinto del anterior.                                                                  |
| Gráfico de funciones de Play                  | Pendiente.                                                                                          |
| Capturas de teléfono por marca y por idioma   | Pendiente. Tienen que mostrar la app real, con los cinco estilos si se menciona la personalización. |
| Texto de descripción y novedades              | Pendiente.                                                                                          |

Verificar medidas y cantidad mínima en cada consola el día del envío.

## Capturas que conviene prever

- Inicio del alumno con el espacio del entrenador.
- Avisos y un mensaje individual, con el contador de no leídos.
- Contacto por WhatsApp (número de prueba).
- Panel del entrenador: aviso y mensaje.
- Ajustes, donde está la eliminación de cuenta.
- Una captura de PupiApp que no sea el mismo encuadre recoloreado de DaminatoFit.

## Credenciales de revisión

Crearlas recién en un entorno de revisión, nunca en este repositorio:

- Entrenador de demostración con WhatsApp de prueba, un aviso publicado y un mensaje.
- Alumno de demostración que vea ese espacio.
- Para PupiApp, el par equivalente en su marca.
- Anotar en la nota para el revisor cómo entrar y que las notificaciones del sistema pueden no estar activas si faltan credenciales push.

Hoy **no existen** esas cuentas de tienda.

## Pruebas en dispositivo

| Prueba                                             | Estado                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Flujos de API contra PostgreSQL local              | Cubiertos por la suite automatizada.                                            |
| Avisos, mensajes, lectura, aislamiento y cola mock | Cubiertos en Fase 6.                                                            |
| Push en un iPhone o Android real                   | **No hecho.** Falta proyecto Expo, token de acceso y credenciales Apple/Google. |
| Permiso de notificaciones denegado en un teléfono  | No hecho en dispositivo. La interfaz y el adaptador contemplan el rechazo.      |
| WhatsApp instalado y no instalado                  | No hecho en dispositivo. El enlace es `https://wa.me/`.                         |

No declarar en la ficha que las notificaciones fueron verificadas en teléfonos.
