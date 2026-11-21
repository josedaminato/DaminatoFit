# DaminatoFit / PupiApp

Plataforma móvil para entrenadores personales y alumnos. Una sola base de código genera dos apps: **DaminatoFit** y **PupiApp**.

- Arquitectura y plan: [`ARQUITECTURA_DAMINATOFIT.md`](./ARQUITECTURA_DAMINATOFIT.md)
- Decisiones: [`docs/adr/`](./docs/adr)

## Estado

| Fase                                  | Estado                  |
| ------------------------------------- | ----------------------- |
| 0 Fundaciones                         | Completada              |
| 0.1 Alineación (marcas, seguridad CI) | Completada              |
| 1 Base de datos + RLS                 | Completada              |
| 2 Autenticación (Better Auth)         | Pendiente de aprobación |

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
| API               | http://localhost:3000/health                                |
| PostgreSQL        | `localhost:5442` (migrator: `daminatofit`; API: `app_user`) |
| Almacenamiento S3 | http://localhost:9000 (consola :9001)                       |
| Correo de prueba  | http://localhost:8025                                       |

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
apps/api            API Fastify + Drizzle + migraciones + pruebas RLS
apps/mobile         App Expo (DaminatoFit y PupiApp)
packages/brand      Marcas, distribution, authRealm, contraste
packages/contracts  Esquemas Zod compartidos
packages/config     TypeScript base
infra/docker        Compose de desarrollo
```

## Infraestructura remota

El VPS de AppMédica **no se modifica ni se usa en estas fases**. El diseño contempla un escenario inicial compartido (con aislamiento) y migración futura a infraestructura propia. Ver `docs/adr/0003-infraestructura-inicial.md`.
