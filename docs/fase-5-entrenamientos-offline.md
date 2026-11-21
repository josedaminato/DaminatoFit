# Fase 5 — Entrenamientos, progreso y offline

## Modelo

| Tabla              | Rol                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `workout_sessions` | Sesión fijada a `routine_version_id` + día. `client_id` único por tenant (idempotencia). Estados: `in_progress`, `completed`, `abandoned`. |
| `workout_set_logs` | Serie con prescrito + real. `client_id` único. LWW por `client_updated_at`; sobreescrituras auditadas.                                     |

Una sola sesión `in_progress` por membresía de alumno. Reanudar el mismo día reutiliza la activa.

## Sincronización offline (móvil)

1. Escritura local primero en SQLite (`local_sessions`, `local_set_logs`, `dirty=1`).
2. Caché de rutina en `cached_routines` (sin secretos).
3. Con red (`expo-network`): `POST /v1/workouts/sync` envía sesiones/series dirty.
4. El servidor aplica por `client_id` (sin duplicar) y rechaza escrituras obsoletas (`stale`).
5. Indicador de pendientes en la UI de sesión.
6. Si el entrenador publica otra versión, la sesión offline conserva la versión con la que empezó.

Temporizador de descanso: deadline (`endsAt`); al volver de segundo plano se recalcula el restante.

## Progreso

Derivado de registros reales: sesiones completadas, volumen (reps × kg cuando hay peso), máximo de peso/reps por ejercicio, historial de pesos, cumplimiento prescrito vs realizado. Sin IA ni métricas clínicas.
