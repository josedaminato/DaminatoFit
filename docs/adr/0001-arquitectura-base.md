# ADR 0001 — Arquitectura base

- **Estado:** aceptada (21/11/2026)
- **Contexto completo:** `ARQUITECTURA_DAMINATOFIT.md`

## Decisión

- Monorepo pnpm con `apps/` (mobile, api) y `packages/` (brand, contracts, config).
- App móvil con Expo + React Native + TypeScript y Expo Router; una sola base de código genera las apps DaminatoFit y PupiApp según `APP_BRAND`.
- API Node.js como monolito modular con Fastify; PostgreSQL multi-tenant con `tenant_id` + Row Level Security.
- Videos en almacenamiento compatible con S3, accedido con URLs prefirmadas.
- Todo configurable por variables de entorno y empaquetado en contenedores para poder migrar de proveedor sin cambios de código.
- No se usa el VPS de AppMédica ni se comparte ningún recurso con AppMédica.

## Notas de implementación (Fase 0)

- `nodeLinker: hoisted` en pnpm: varias herramientas de React Native todavía asumen `node_modules` plano.
- TypeScript 6.0 (no 7.x): `typescript-eslint` todavía no soporta TypeScript 7.
- ESLint 9 (no 10): `eslint-config-expo` y sus plugins todavía apuntan a ESLint 9.
- Almacenamiento local: **RustFS** (Apache 2.0) en lugar de MinIO, porque MinIO dejó de publicar imágenes Docker de la edición comunitaria. Es solo para desarrollo; el destino sigue siendo Cloudflare R2 o Backblaze B2.
- PostgreSQL local publicado en el puerto **5442** para no chocar con otros proyectos locales (AppMédica usa 5432).
- La API se empaqueta en un único archivo con `tsup`, así la imagen de producción no necesita `node_modules`.
- El JavaScript de la app no contiene datos de marca: la marca activa se embebe en `extra.brand` al compilar.
