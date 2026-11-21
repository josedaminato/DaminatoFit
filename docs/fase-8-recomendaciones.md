# Fase 8 — Recomendaciones y convenios del entrenador

DaminatoFit ofrece la herramienta. No negocia, no fija condiciones y no cobra comisión por estos acuerdos privados.

Un entrenador puede recomendar un negocio, producto, servicio o profesional por confianza, experiencia, amistad o un acuerdo. El acuerdo comercial es opcional. Si no hay beneficio, no hace falta declarar uno.

## Qué puede hacer el entrenador

En **Mis recomendaciones**:

- crear, editar, publicar, ocultar, reordenar y archivar;
- elegir categoría, nombre, descripción, enlace y matrícula opcional;
- asociar una imagen ya subida al espacio (`imageMediaId`, propósito `recommendation`). La pantalla todavía no incluye el selector de archivo; si la API devuelve una URL firmada, la tarjeta la muestra.
- si declara un beneficio: texto, código, condiciones y fecha de fin.

Estados: `draft`, `published`, `hidden`, `archived`. Archivar no borra la fila si hubo denuncias. No hay borrado físico desde la app.

Categorías iniciales: indumentaria, equipamiento, viandas, nutrición, kinesiología, fisioterapia, recuperación, gimnasios, otros servicios y Otros. Un administrador de plataforma puede sumar una categoría con `POST /v1/admin/recommendation-categories`. No hace falta una migración por cada alta. La categoría no certifica al proveedor.

## Enlaces

Destinos: sitio web, WhatsApp (`https://wa.me/<número>`), Instagram, Google Maps y otro enlace HTTPS público. Se rechazan `javascript:`, `data:`, `file:`, HTTP, usuario/clave en la URL, localhost y direcciones privadas.

No hay reservas, pagos ni compras. No se cargan scripts de terceros.

## WhatsApp

El alumno ve un borrador con el nombre vigente del perfil del entrenador. Si el beneficio sigue vigente y hay código, el texto los incluye. El alumno puede cambiarlo. La app abre `https://wa.me/` con `text=` codificado. No envía el mensaje, no usa la API comercial y no pide permisos extra.

## Alumno

**Recomendaciones de mi entrenador** muestra solo lo publicado del entrenador activo, y solo si la moderación no lo ocultó. Un beneficio con fecha anterior a hoy no se muestra como vigente; la tarjeta puede seguir. El código se copia en el dispositivo. Una nota explica que DaminatoFit no certifica ni verifica matrículas. Si el entrenador declaró un beneficio, la tarjeta lo dice. La matrícula figura como informada por el entrenador.

La interfaz usa los tokens de la Fase 5.1. PupiApp conserva su paleta propia.

## Denuncias y admin

Un alumno puede reportar una recomendación publicada: fraudulenta, engañosa, peligrosa, inapropiada o enlace sospechoso. Una denuncia por alumno y recomendación. El entrenador no puede listarlas ni borrarlas.

El panel admin, en **Recomendaciones**, cuenta publicadas y denuncias de DaminatoFit y de PupiApp por separado. Puede ocultar el contenido o cerrar la denuncia. No puede editar el texto comercial ni el código.

Esas operaciones corren como `app_user` y llaman funciones `SECURITY DEFINER` que exigen `app.user_id` de un `platform_admin` activo. No usan la conexión de superusuario del migrador. El panel general de la Fase 7 sigue usando esa conexión; eso no quedó resuelto.

Ocultar por moderación deja la recomendación invisible para alumnos. El entrenador no puede volver a publicarla mientras siga oculta.

## Datos

Migración `0010_recommendations.sql`:

- `recommendation_categories`
- `trainer_recommendations`
- `recommendation_reports`

RLS forzado. El alumno lee solo publicadas y no moderadas de su tenant. El entrenador escribe solo las suyas. No hay `DELETE` para `app_user`.

## API

Entrenador: `GET/POST /v1/recommendations`, `PATCH /v1/recommendations/:id`, `POST .../publish|hide|archive`, `POST /v1/recommendations/reorder`.

Alumno: `GET /v1/recommendations/published`, `GET /v1/recommendations/:id`, `POST .../report`.

Categorías: `GET /v1/recommendation-categories`.

Admin: `GET /v1/admin/recommendations/summary`, `GET /v1/admin/recommendations/reports`, `POST /v1/admin/recommendations/moderate`, `POST /v1/admin/recommendation-categories`.

## Fase 9 — Red DaminatoFit

No implementada. Podría incluir registro de proveedores, directorio por ciudad, búsqueda, solicitudes de colaboración, contacto entre entrenadores y proveedores, controles antifraude y herramientas comerciales. Esta fase no las incluye.

## Pendientes que siguen abiertos

- La API administrativa general de la Fase 7 sigue conectada con el rol migrador.
- MFA/TOTP no está implementado. Sigue siendo un bloqueo antes de exponer el admin a internet.
- No se verificó el recorrido en un teléfono ni en el navegador del panel. Las pruebas son automatizadas, con PostgreSQL real para la API.
- El producto no está listo para producción.

## Verificación manual, no hecha

En un dispositivo: crear las dos recomendaciones de demostración (nutricionista sin acuerdo y tienda ficticia con código `MARTIN15`), publicarlas, verlas como alumno, copiar el código, abrir WhatsApp, cambiar de entrenador, denunciar y ocultar desde el admin.
