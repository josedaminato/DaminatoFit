# ADR 0004 — Better Auth por reino (Fase 2)

- **Estado:** aceptada (21/11/2026)
- **Supersede:** confirma el reemplazo de ADR 0002

## Decisión

1. Una instancia de Better Auth por reino (`daminatofit`, `pupiapp`) montada en `/auth/<reino>/*`.
2. Tablas en esquemas PostgreSQL separados: `auth_daminatofit` y `auth_pupiapp`.
3. Plugins mínimos: `@better-auth/expo` + `bearer` (sin organizations, sin caché de sesión).
4. Autorización de dominio propia: `users`, `tenants`, `memberships`, invitaciones y RLS.
5. Alta de entrenador DaminatoFit vía `POST /v1/trainers/register` (transacción con `app.provision_trainer`).
6. PupiApp: registro libre de entrenadores bloqueado; bootstrap idempotente con `PUPIAPP_BOOTSTRAP_SECRET`.
7. Invitaciones con token hasheado, vencimiento, revocación y un solo uso.

## Consecuencias

- El mismo correo puede existir en ambos reinos sin compartir sesión.
- `x-app-brand` selecciona el reino; la sesión debe existir en ese esquema.
- `x-tenant-id` solo se acepta con membresía activa del mismo reino/marca.
