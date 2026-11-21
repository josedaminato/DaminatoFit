# Política de eliminación de cuenta (Fase 2.1)

Documento de producto/técnico. **No constituye asesoramiento legal.** Las obligaciones locales (p. ej. ARCO / GDPR) deben validarse con asesoramiento externo antes de producción.

## Distinciones

| Acción                           | Qué hace                                                                                               | Qué no hace                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Eliminar identidad**           | Borra credenciales Better Auth del reino, revoca sesiones y marca el perfil de dominio como eliminado  | No borra automáticamente el historial de otros usuarios en espacios compartidos |
| **Desvincular alumno**           | Archiva la membresía del alumno con un entrenador                                                      | No elimina la cuenta del alumno ni el espacio del entrenador                    |
| **Archivar espacio profesional** | Pasa el tenant del entrenador a `archived` y archiva membresías/invitaciones pendientes de ese espacio | No elimina filas históricas (eventos, avisos, mensajes) ni cuentas de alumnos   |

## Comportamiento implementado al eliminar cuenta

1. El usuario confirma y reautentica con su **contraseña** (Better Auth `deleteUser`).
2. `app.soft_delete_identity` (antes del borrado de auth):
   - `users.deleted_at` + `status = disabled` + nombre anonimizado.
   - Membresías del usuario → `archived`.
   - Tenants donde es propietario → `archived`; membresías e invitaciones pendientes de esos tenants se archivan/revocan.
3. Better Auth elimina el usuario del esquema `auth_<reino>` y sus sesiones/cuentas.
4. El mismo correo puede volver a registrarse en ese reino (nueva identidad).

## Pendiente de definición comercial/legal

- Plazos de retención de backups y logs.
- Exportación de datos previos a la eliminación.
- Conservación de facturación / comprobantes cuando existan (Fase comercial).
- Si un entrenador con alumnos activos debe poder eliminarse sin transferir el espacio (hoy se archiva el espacio).

Hasta definir esas reglas, no se inventan plazos ni borrados en cascada adicionales.
