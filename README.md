# DaminatoFit / PupiApp

Plataforma móvil para entrenadores personales y alumnos. Una sola base de código genera dos apps: **DaminatoFit** y **PupiApp**.

- Arquitectura y plan: [`ARQUITECTURA_DAMINATOFIT.md`](./ARQUITECTURA_DAMINATOFIT.md)
- Decisiones: [`docs/adr/`](./docs/adr)

## Estado

| Fase                                    | Estado     |
| --------------------------------------- | ---------- |
| 0 Fundaciones                           | Completada |
| 0.1 Alineación (marcas, seguridad CI)   | Completada |
| 1 Base de datos + RLS                   | Completada |
| 2 Autenticación, cuentas e invitaciones | Completada |
| 2.1 Cierre (reset + borrado de cuenta)  | Completada |
| 3 Biblioteca y videos                   | Completada |
| 4 Rutinas versionadas                   | Completada |
| 5 Entrenamientos y progreso             | Completada |

## Requisitos

- Node.js 22 (`.nvmrc`) y pnpm 10 (`corepack enable`)
- Docker Desktop

## Primer arranque

```powershell
pnpm install
Copy-Item .env.example .env
Copy-Item apps/mobile/.env.example apps/mobile/.env
pnpm infra:up
pnpm db:migrate
pnpm check
pnpm dev:api
pnpm mobile:daminatofit   # o: pnpm mobile:pupiapp
```

| Servicio          | Dirección local                                             |
| ----------------- | ----------------------------------------------------------- |
| API               | http://127.0.0.1:3000/health                                |
| Auth              | `/auth/daminatofit/*` y `/auth/pupiapp/*`                   |
| PostgreSQL        | `localhost:5442` (migrator: `daminatofit`; API: `app_user`) |
| Almacenamiento S3 | http://localhost:9000 (consola :9001)                       |
| Correo de prueba  | http://localhost:8025                                       |

## Fase 2 / 2.1 — recorridos

- **Entrenador (DaminatoFit):** registro → perfil/WhatsApp → invitar alumno → listar → cerrar sesión.
- **Alumno:** invitación → cuenta o login → aceptar → contacto WhatsApp → cerrar sesión.
- **Recuperación:** `scheme://reset-password?token=…` → nueva contraseña (un solo uso).
- **Eliminación:** Ajustes → confirmar `ELIMINAR` + contraseña (ver `docs/privacy-account-deletion.md`).
- **PupiApp:** sin alta libre de entrenadores; bootstrap con `PUPIAPP_BOOTSTRAP_SECRET`.
- **Verificación en dispositivo:** `docs/fase-2.1-verificacion-manual.md`

## Fase 3 — biblioteca y videos

- Biblioteca **global** (solo lectura) + biblioteca **personal** del entrenador.
- Personalizar un ejercicio global sin mutar el original (revisión propia + `based_on_exercise_id`).
- Videos: PUT firmado a RustFS → confirmación con validación en servidor (magic bytes, tamaño, SHA-256 y **ffprobe obligatorio** vía `ffprobe-static`) → URL firmada **sin autoplay**.
- Deduplicación por tenant, rechazo de borrado si el archivo sigue referenciado, uso en `tenant_usage`.
- Límites técnicos y recorrido local: [`docs/fase-3-media-y-biblioteca.md`](./docs/fase-3-media-y-biblioteca.md).

## Fase 4 — rutinas

- Plantillas versionadas, borrador/publicación, días con `week_index`, series prescritas.
- Asignación a varios alumnos; personalización individual sin afectar al resto; historial al reemplazar.
- Detalle: [`docs/fase-4-rutinas.md`](./docs/fase-4-rutinas.md).

## Fase 5 — entrenamientos y progreso

- Sesión de gimnasio: series reales vs prescritas, temporizador por deadline, finalizar/abandonar.
- Offline: SQLite local + `POST /v1/workouts/sync` idempotente (`client_id`); sesión fijada a la versión iniciada.
- Historial y progreso (volumen, pesos, cumplimiento) para alumno y entrenador.
- Detalle: [`docs/fase-5-entrenamientos-offline.md`](./docs/fase-5-entrenamientos-offline.md).
- **Emulador/dispositivo:** no verificado en esta máquina; integración API + PostgreSQL reales.

## Comandos

| Comando                        | Qué hace                                                                   |
| ------------------------------ | -------------------------------------------------------------------------- |
| `pnpm check`                   | Formato + lint + types + pruebas + auditoría de dependencias de producción |
| `pnpm test`                    | Pruebas de todo el monorepo (incluye aislamiento RLS con PostgreSQL real)  |
| `pnpm db:migrate`              | Aplica migraciones SQL versionadas                                         |
| `pnpm secrets:scan`            | Escaneo de secretos con Gitleaks (Docker)                                  |
| `pnpm deps:audit`              | Auditoría de dependencias de producción (umbral: high)                     |
| `pnpm infra:up` / `infra:down` | Infraestructura local                                                      |

## Estructura

```
apps/api            Fastify + Better Auth + Drizzle + RLS + pruebas
apps/mobile         Expo (auth, entrenador, alumno, invitaciones)
packages/brand      Marcas, distribution, authRealm, contraste
packages/contracts  Esquemas Zod compartidos
packages/config     TypeScript base
infra/docker        Compose de desarrollo
```

## Infraestructura remota

El VPS de AppMédica **no se modifica ni se usa en estas fases**. El diseño contempla un escenario inicial compartido (con aislamiento) y migración futura a infraestructura propia. Ver `docs/adr/0003-infraestructura-inicial.md`.
