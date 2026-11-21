# Fase 3 — Biblioteca de ejercicios y videos

## Límites técnicos provisionales (configurables)

No son política comercial. Ajustables por entorno:

| Variable                         | Default                     | Motivo                                                           |
| -------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `MEDIA_MAX_BYTES`                | 52 428 800 (50 MiB)         | Caber en móviles sin transcodificar; control de costo.           |
| `MEDIA_MAX_DURATION_MS`          | 180 000 (3 min)             | Videos de apoyo cortos; duración verificada con ffprobe.         |
| `MEDIA_UPLOAD_URL_TTL_SECONDS`   | 900 (15 min)                | Ventana de PUT firmado.                                          |
| `MEDIA_PLAYBACK_URL_TTL_SECONDS` | 300 (5 min)                 | Lectura firmada de corta duración.                               |
| `MEDIA_PROBE_TIMEOUT_MS`         | 15 000                      | Timeout del proceso ffprobe.                                     |
| `DEFAULT_STORAGE_QUOTA_BYTES`    | 536 870 912 (512 MiB)       | Tope técnico por entrenador; base para cuotas futuras.           |
| `FFPROBE_PATH`                   | opcional (`ffprobe-static`) | **Obligatorio** para `ready`. Sin binario → `probe_unavailable`. |

Formatos aceptados tras inspección en el servidor: contenedor detectado por magic bytes **y** ffprobe con duración > 0. Sin verificación completa el archivo no queda disponible.

## Flujo local de carga y reproducción

1. `pnpm infra:up` (PostgreSQL + RustFS + Mailpit).
2. `pnpm db:migrate` (incluye seed de ~6 ejercicios globales y catálogos).
3. `pnpm dev:api`.
4. Entrenador autenticado → `POST /v1/media/uploads` → `PUT` a la URL firmada → `POST /v1/media/:id/confirm`.
5. El confirm descarga el objeto, calcula SHA-256, valida magic/tamaño/**ffprobe obligatorio**, deduplica por tenant y marca `ready` (o rechaza).
6. Reproducción: `GET /v1/media/:id/playback-url` → URL firmada; la app **no** autoplay (`autoplay: false` / `shouldPlay={false}`).
7. Consola RustFS: http://127.0.0.1:9001 (credenciales de `.env`).

## Recorrido funcional (API real)

1. Login entrenador (registro DaminatoFit o sesión existente).
2. `GET /v1/exercises?scope=global` — biblioteca general (solo lectura).
3. `GET /v1/exercises/:id` — detalle.
4. `POST /v1/exercises` — ejercicio propio.
5. Subida de video (pasos 4–5 del flujo de media).
6. Confirmar `status: ready` y `GET .../playback-url`.
7. `POST /v1/exercises/:globalId/customize` — personalización sin mutar el original.
8. `GET /v1/exercises?scope=mine` — aparece la personalización.
9. Otro entrenador: `404` al leer el ejercicio/video privado.

**Dispositivo/emulador:** si no hay emulador local, la UI móvil se verifica con pruebas de helpers + revisión de pantallas; el recorrido de datos se valida con la suite de integración API + RustFS.

## Deduplicación y huérfanos

- Un mismo SHA-256 `ready` se reutiliza dentro del tenant (y global para biblioteca de plataforma).
- `DELETE /v1/media/:id` responde `409 still_referenced` si alguna revisión de ejercicio lo usa.
- Uso acumulado en `tenant_usage.storage_bytes`.
