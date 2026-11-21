# Fase 4 — Plantillas, versiones y asignaciones de rutinas

## Modelo

| Concepto         | Tabla / campo                                             | Comportamiento                                                   |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Plantilla        | `routine_plans.kind = template`                           | Independiente de alumnos; reutilizable.                          |
| Asignación       | `routine_plans.kind = assigned` + `student_membership_id` | Copia publicada de una versión de plantilla.                     |
| Versión          | `routine_versions`                                        | `draft` / `published` / `superseded`. Un solo borrador por plan. |
| Día / sesión     | `routine_version_days`                                    | `name` libre + `week_index` (≥1) para programas multi-semana.    |
| Ejercicio fijado | `routine_version_exercises.exercise_revision_id`          | Congela instrucciones/video de ese momento.                      |
| Series           | `routine_version_sets`                                    | Reps min/max, peso opcional (kg), descanso.                      |

## Ciclo de vida

1. **Crear plantilla** → plan + borrador v1 vacío.
2. **Guardar borrador** (`PUT /v1/routines/:id/draft`) → reemplazo transaccional del árbol del draft.
3. **Publicar** → draft → `published`; versión previa → `superseded`; actualiza `current_version_id`.
4. **Asignar** → crea plan `assigned` por alumno (copia publicada); si `replaceActive`, archiva asignaciones previas y cierra `ends_on` (historial conservado).
5. **Personalizar** → `new-draft` en el plan del alumno → editar → publicar; no altera plantilla ni otros alumnos.
6. **Nueva versión de plantilla** → no se propaga sola; hace falta asignar/actualizar explícitamente.

Versiones `published`/`superseded` son inmutables (triggers). Los alumnos solo leen versiones publicadas de sus planes asignados.

## Endpoints

- Entrenador: `GET/POST /v1/routines`, `GET /v1/routines/:id`, `PUT .../draft`, `POST .../publish`, `.../new-draft`, `.../duplicate`, `.../archive`, `.../assign`, `GET .../assignments`
- Alumno: `GET /v1/student/routines`, `GET /v1/student/routines/:id`

## Validación de videos (cierre Fase 3)

- `ffprobe` es **obligatorio** antes de marcar un video `ready`.
- Por defecto se usa el binario de `ffprobe-static`; override con `FFPROBE_PATH`.
- Sin validador: rechazo `probe_unavailable` (no se acepta en silencio).
- Timeout: `MEDIA_PROBE_TIMEOUT_MS` (default 15 s).
