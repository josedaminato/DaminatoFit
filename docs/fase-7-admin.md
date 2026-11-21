# Fase 7 — Panel de administración central de DaminatoFit

Panel web privado (`apps/admin`) y API `/v1/admin/*` para el propietario de la plataforma. **No convierte entrenadores en administradores globales.** PupiApp queda fuera de las métricas comerciales.

## Acceso

- Rol de dominio: `users.platform_role = platform_admin` en el reino `daminatofit`.
- Autenticación: Better Auth del reino DaminatoFit + comprobación en backend.
- No hay registro público de administradores (`POST /v1/admin/register` → 404).
- Un entrenador no puede escalar privilegios cambiando su perfil ni una petición HTTP.

### Provisionar el primer administrador (local)

```powershell
# Definir PLATFORM_ADMIN_PROVISION_SECRET en .env (fuera del repo en producción)
pnpm --filter @daminatofit/api admin:provision -- --email ops@example.com --password '********' --name 'Ops' --secret $env:PLATFORM_ADMIN_PROVISION_SECRET
```

No existe una cuenta predeterminada. El secreto de provisión no debe publicarse.

### MFA / TOTP

**No implementado en esta fase.** Es un **bloqueo explícito** antes de exponer el panel a internet. El endpoint `/v1/admin/me` lo declara (`mfa.requiredBeforeInternetExposure: true`).

## Suspensión vs cuenta

| Concepto             | Campo                       | Efecto                                                                |
| -------------------- | --------------------------- | --------------------------------------------------------------------- |
| Suspender entrenador | `tenants.status = paused`   | Deja de aparecer en membresías activas; historial intacto; reversible |
| Archivar entrenador  | `tenants.status = archived` | Fuera de operación; historial intacto                                 |
| Desactivar usuario   | `users.status = disabled`   | Cuenta de identidad; no es el botón de suspensión del panel           |

El panel suspende/reactiva **tenants** de DaminatoFit. No permite modificar el tenant propio del administrador si también fuera owner.

## Comercial

- Estimación: USD 2 por alumno simulado / mes, tope USD 20 (`200` / `2000` centavos).
- Base actual: membresías de alumno **activas** en tenants **activos**, etiquetada como simulación.
- Cobrado real: siempre `0` hasta una fase de cobros.
- Reglas versionadas en `commercial_rule_versions`; los cambios no aplican retroactivamente.
- Referidos: documentados y tabla `referral_attributions` preparada; **sin** códigos públicos ni descuentos automáticos.

## Snapshots

`platform_metric_snapshots` guarda totales diarios de DaminatoFit hacia adelante. No se inventan series históricas anteriores a la captura.

## Auditoría

`platform_admin_audit` es append-only. No admite `UPDATE`/`DELETE` por API ni por SQL de aplicación. No guarda secretos, cookies ni tokens.

## Separación de marcas

Todas las agregaciones comerciales y de trainers del panel filtran `brands.slug = 'daminatofit'`. PupiApp no cuenta como cliente facturable de DaminatoFit.

## Arranque local del panel

```powershell
pnpm dev:api
pnpm dev:admin
```

`VITE_API_URL` apunta a la API. Orígenes del SPA: `ADMIN_WEB_ORIGINS`.
