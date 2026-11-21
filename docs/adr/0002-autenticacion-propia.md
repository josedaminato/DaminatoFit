# ADR 0002 — Autenticación propia

- **Estado:** **reemplazada** (21/11/2026, revisión 2 de la arquitectura) por Better Auth con un reino de identidad por app independiente. Ver la sección 2.3 de `ARQUITECTURA_DAMINATOFIT.md`.
- **Motivo del reemplazo:** Better Auth admite esquemas de PostgreSQL separados, así que se pueden mantener cuentas independientes por marca sin escribir código de autenticación propio, que era el mayor riesgo de seguridad de esta opción.
- **Se conserva abajo como registro histórico.**

## Contexto

- Las cuentas de DaminatoFit y PupiApp son **independientes**: el mismo correo puede tener una cuenta en cada marca, sin mezclarse.
- Los clientes son apps móviles nativas (sin cookies de navegador).
- Cada request autenticado debe llevar el contexto de usuario, tenant y rol para la autorización en la API y para Row Level Security en PostgreSQL.
- Se busca evitar servicios pagos y dependencia de terceros para la identidad.

## Opciones consideradas

| Opción                             | A favor                                                                                             | En contra                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Servicio gestionado (Clerk, Auth0) | Rápido, seguro                                                                                      | Costo por usuario, datos fuera de nuestra base, migración difícil                                             |
| Supabase Auth                      | Gratuito al inicio                                                                                  | Acopla la base de datos al proveedor                                                                          |
| Better Auth (librería)             | Flujos ya resueltos, plugins                                                                        | Asume correo único global; su modelo de organizaciones se superpone con nuestros tenants; orientado a cookies |
| **Propia con librerías estándar**  | Correo único por marca, tokens pensados para móvil, contexto de tenant nativo, sin costo ni lock-in | Más código a mantener y probar                                                                                |

## Decisión

Autenticación propia, aislada en `apps/api/src/modules/auth`:

- Contraseñas con **argon2id** (`@node-rs/argon2`, binarios precompilados, sin compilación nativa).
- **Access token JWT** de vida corta (`jose`), con `sub`, `brand`, `tenant` activo y `role`.
- **Refresh token** opaco y rotativo, guardado solo como hash en `sessions`; si se reutiliza un token ya rotado, se revoca toda la familia de sesiones.
- Límite de intentos con `@fastify/rate-limit` en login, registro y recuperación de contraseña.
- Tokens en el dispositivo con `expo-secure-store`.
- Correo único por (`brand_id`, `email`).

## Consecuencias

- La Fase 2 incluye una batería de pruebas de seguridad específica (reutilización de tokens, expiración, rate limiting, enumeración de usuarios).
- Si en el futuro conviene una librería, el reemplazo queda acotado al módulo `auth`.
