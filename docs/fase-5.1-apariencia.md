# Fase 5.1 — Personalización visual del entrenador

## Resumen

Cada entrenador de **DaminatoFit** (`distribution: platform`) puede personalizar la apariencia del espacio que ven sus alumnos: estilo, color, tipografía y logotipo. PupiApp conserva su identidad de marca embebida; no aplica overlay de entrenadores externos.

## Cinco estilos

| ID             | Nombre      | Idea visual                                       |
| -------------- | ----------- | ------------------------------------------------- |
| `minimal`      | Minimalista | Espacios amplios, radios bajos, progreso fino     |
| `sport`        | Deportivo   | Mayor contraste, bordes acentuados, progreso alto |
| `wellness`     | Wellness    | Radios grandes, sensación suave                   |
| `professional` | Profesional | Compacto, sobrio, bordes discretos                |
| `dynamic`      | Dinámico    | Radios expresivos y mayor elevación               |

Todos comparten los mismos componentes y pantallas; solo cambian tokens (`layout` + `colors`).

## Diez colores principales

| ID        | Hex       | Etiqueta    |
| --------- | --------- | ----------- |
| turquoise | `#0D9488` | Turquesa    |
| blue      | `#2563EB` | Azul        |
| violet    | `#7C3AED` | Violeta     |
| pink      | `#DB2777` | Rosa        |
| red       | `#DC2626` | Rojo        |
| orange    | `#EA580C` | Naranja     |
| green     | `#15803D` | Verde       |
| navy      | `#1E3A8A` | Azul marino |
| graphite  | `#334155` | Grafito     |
| gold      | `#A16207` | Dorado      |

Se derivan `onPrimary` (contraste WCAG AA), superficies, bordes y textos. `danger` / `success` son fijos e independientes del color elegido.

## Cinco tipografías (empaquetadas)

| ID      | Familia            | Licencia    | Paquete Expo                            |
| ------- | ------------------ | ----------- | --------------------------------------- |
| modern  | DM Sans            | SIL OFL 1.1 | `@expo-google-fonts/dm-sans`            |
| classic | Source Serif 4     | SIL OFL 1.1 | `@expo-google-fonts/source-serif-4`     |
| sport   | Barlow Condensed   | SIL OFL 1.1 | `@expo-google-fonts/barlow-condensed`   |
| elegant | Cormorant Garamond | SIL OFL 1.1 | `@expo-google-fonts/cormorant-garamond` |
| compact | IBM Plex Sans      | SIL OFL 1.1 | `@expo-google-fonts/ibm-plex-sans`      |

Las fuentes se cargan en build/runtime local con `expo-font` (`FontsGate`). No hay descarga desde CDN en tiempo de ejecución.

## Logotipos

- Propósito de media: `purpose: 'logo'` → `kind: image`.
- Formatos: JPEG, PNG, WebP (sin SVG).
- Validación real con `file-type` + `image-size` (no se confía en MIME/extensión del cliente).
- Límites env: `MEDIA_LOGO_MAX_BYTES` (2 MiB), `MEDIA_LOGO_MAX_DIMENSION` (2048).
- Clave S3: `tenants/{tenantId}/media/{assetId}/original.{ext}` (UUID, nunca el nombre original).
- FK `tenants.logo_media_id` + JSON `branding.logoMediaId`.
- No se puede borrar un asset referenciado como logo (`409 still_referenced`).
- Al reemplazar o restaurar predeterminados, el logo anterior sin referencias pasa a `orphaned` y se elimina del bucket.

## API

| Método | Ruta                      | Quién                               |
| ------ | ------------------------- | ----------------------------------- |
| GET    | `/v1/appearance/catalog`  | Público autenticable                |
| GET    | `/v1/me/appearance`       | Miembro del tenant (alumno o owner) |
| PUT    | `/v1/me/appearance`       | Solo owner + marca platform         |
| POST   | `/v1/me/appearance/reset` | Solo owner + marca platform         |
| POST   | `/v1/media/uploads`       | Owner, `purpose: logo`              |
| POST   | `/v1/media/:id/confirm`   | Owner                               |

Migración: `0007_tenant_appearance.sql`.

## Multi-entrenador y PupiApp

- El tema activo depende del `activeMembership` / tenant seleccionado.
- Al cambiar de entrenador se recarga `GET /v1/me/appearance` (sin mezclar branding entre tenants).
- PupiApp (`standalone`): `AppearanceProvider` no aplica overlay; el configurador muestra que no está disponible.
- Jerarquía: identidad de app → apariencia del espacio (solo platform) → preferencias de accesibilidad del dispositivo.

## Móvil

- `AppearanceProvider` fusiona tokens en `useBrand()`.
- Configurador: `trainer/appearance` (desde perfil del entrenador).
- Preview live con `AppearancePreview` (inicio, rutina, ejercicio, progreso) sin persistir hasta Guardar.

## Publicación en tiendas (pendiente de carpeta)

`docs/publicacion/` aún no existe. Al crearla, incluir:

- Uso de logotipos e imágenes subidos por entrenadores (UGC).
- Derechos de marcas de terceros y responsabilidad del entrenador sobre el material.
- Diferencia entre personalización interna multi-tenant y publicar apps independientes (PupiApp / white-label).
- Declaraciones de privacidad sobre almacenamiento de logos en object storage privado con URLs firmadas.
