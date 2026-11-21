# DaminatoFit / PupiApp

Plataforma móvil para entrenadores personales y alumnos. Una sola base de código genera dos apps: **DaminatoFit** y **PupiApp**.

- Arquitectura y plan: [`ARQUITECTURA_DAMINATOFIT.md`](./ARQUITECTURA_DAMINATOFIT.md)
- Decisiones: [`docs/adr/`](./docs/adr)

## Requisitos

- Node.js 22 (`.nvmrc`) y pnpm 10 (`corepack enable`)
- Docker Desktop

## Primer arranque

```powershell
pnpm install
Copy-Item .env.example .env
Copy-Item apps/mobile/.env.example apps/mobile/.env
pnpm infra:up        # PostgreSQL, almacenamiento S3 (RustFS) y Mailpit
pnpm dev:api         # API en http://localhost:3000/health
pnpm mobile:daminatofit   # o: pnpm mobile:pupiapp
```

Docker Compose usa los mismos valores por defecto que `.env.example`. Para cambiarlos, creá `infra/docker/.env`.

| Servicio                   | Dirección local                                 |
| -------------------------- | ----------------------------------------------- |
| API                        | http://localhost:3000/health                    |
| PostgreSQL                 | `localhost:5442` (usuario y base `daminatofit`) |
| Almacenamiento S3          | http://localhost:9000 (consola en :9001)        |
| Correo de prueba (Mailpit) | http://localhost:8025                           |

## Comandos

| Comando                                                                  | Qué hace                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| `pnpm check`                                                             | Lint + typecheck + pruebas de todo el monorepo     |
| `pnpm test`                                                              | Pruebas (Vitest en API y paquetes, Jest en la app) |
| `pnpm format`                                                            | Formatea con Prettier                              |
| `pnpm infra:down`                                                        | Detiene la infraestructura local                   |
| `pnpm --filter @daminatofit/mobile config:pupiapp`                       | Muestra la configuración final de la app PupiApp   |
| `docker compose -f infra/docker/compose.yml --profile api up -d --build` | Levanta la API desde su imagen Docker              |

## Estructura

```
apps/api        API Node.js (Fastify)
apps/mobile     App Expo (DaminatoFit y PupiApp)
packages/brand      Configuración y colores de cada marca
packages/contracts  Esquemas Zod compartidos entre API y app
packages/config     Configuración base de TypeScript
infra/docker    Docker Compose de desarrollo
```
