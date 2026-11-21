import { EXERCISE_VIDEO_SHOULD_AUTOPLAY } from '@/features/exercises/types';

export type RoutineKind = 'template' | 'assigned';
export type RoutineStatus = 'active' | 'archived';

/** Re-export product rule: routine screens use the same tap-to-play video behavior. */
export const ROUTINE_VIDEO_SHOULD_AUTOPLAY = EXERCISE_VIDEO_SHOULD_AUTOPLAY;

export interface RoutineListItem {
  id: string;
  kind: RoutineKind;
  name: string;
  description: string;
  status: RoutineStatus;
  currentVersionId: string | null;
  studentMembershipId: string | null;
  currentVersionNumber: number | null;
  currentVersionStatus: string | null;
  updatedAt: string;
}

export interface RoutineSet {
  id: string;
  position: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg: number | null;
  restSeconds: number | null;
}

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  exerciseRevisionId: string;
  position: number;
  notes: string;
  restSeconds: number | null;
  exerciseName: string;
  instructions: string;
  videoMediaId: string | null;
  sets: RoutineSet[];
}

export interface RoutineDay {
  id: string;
  name: string;
  weekIndex: number;
  position: number;
  notes: string;
  exercises: RoutineExercise[];
}

export interface RoutineVersionSummary {
  id: string;
  versionNumber: number;
  status: string;
  changeNote: string;
  publishedAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export interface RoutineDetail {
  id: string;
  kind: RoutineKind;
  name: string;
  description: string;
  status: RoutineStatus;
  currentVersionId: string | null;
  sourceVersionId: string | null;
  studentMembershipId: string | null;
  draftVersionId: string | null;
  versions: RoutineVersionSummary[];
  editingVersionId: string | null;
  days: RoutineDay[];
}

export interface StudentRoutineListItem {
  id: string;
  name: string;
  description: string;
  currentVersionId: string | null;
  versionNumber: number | null;
  startsOn: string | null;
  endsOn: string | null;
  status: RoutineStatus;
  isCurrent: boolean;
}

export interface StudentRoutineDetail {
  id: string;
  name: string;
  description: string;
  status: RoutineStatus;
  version: {
    id: string;
    versionNumber: number;
    status: string;
    startsOn: string | null;
    endsOn: string | null;
    changeNote: string;
  };
  days: RoutineDay[];
}

export interface DraftSetInput {
  clientKey: string;
  position: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg: number | null;
  restSeconds: number | null;
}

export interface DraftExerciseInput {
  clientKey: string;
  exerciseId: string;
  exerciseName: string;
  instructions: string;
  videoMediaId: string | null;
  position: number;
  notes: string;
  restSeconds: number | null;
  sets: DraftSetInput[];
}

export interface DraftDayInput {
  clientKey: string;
  name: string;
  weekIndex: number;
  position: number;
  notes: string;
  exercises: DraftExerciseInput[];
}

export interface RoutineDraftFormState {
  name: string;
  description: string;
  changeNote: string;
  days: DraftDayInput[];
}

export interface DraftWriteBody {
  name: string;
  description: string;
  changeNote: string;
  days: {
    name: string;
    weekIndex: number;
    position: number;
    notes: string;
    exercises: {
      exerciseId: string;
      position: number;
      notes: string;
      restSeconds?: number | null;
      sets: {
        position: number;
        targetRepsMin: number;
        targetRepsMax: number;
        targetWeightKg?: number | null;
        restSeconds?: number | null;
      }[];
    }[];
  }[];
}

export interface RoutineAssignmentRow {
  id: string;
  name: string;
  status: RoutineStatus;
  studentMembershipId: string;
  studentName: string | null;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  sourceVersionId: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export function routineKindLabel(kind: RoutineKind): string {
  return kind === 'template' ? 'Plantilla' : 'Asignada';
}

export function routineStatusLabel(status: RoutineStatus): string {
  return status === 'active' ? 'Activa' : 'Archivada';
}

let clientKeyCounter = 0;

export function newClientKey(prefix = 'k'): string {
  clientKeyCounter += 1;
  return `${prefix}_${clientKeyCounter}_${Date.now().toString(36)}`;
}

export function emptySet(position = 0): DraftSetInput {
  return {
    clientKey: newClientKey('set'),
    position,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: null,
    restSeconds: 90,
  };
}

export function emptyDay(position = 0, weekIndex = 1): DraftDayInput {
  return {
    clientKey: newClientKey('day'),
    name: `Día ${position + 1}`,
    weekIndex,
    position,
    notes: '',
    exercises: [],
  };
}

export function emptyExerciseDraft(input: {
  exerciseId: string;
  exerciseName: string;
  instructions?: string;
  videoMediaId?: string | null;
  position: number;
}): DraftExerciseInput {
  return {
    clientKey: newClientKey('ex'),
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    instructions: input.instructions ?? '',
    videoMediaId: input.videoMediaId ?? null,
    position: input.position,
    notes: '',
    restSeconds: null,
    sets: [emptySet(0)],
  };
}

export function hasMultipleWeeks(days: Pick<DraftDayInput, 'weekIndex'>[]): boolean {
  const weeks = new Set(days.map((d) => d.weekIndex));
  return weeks.size > 1 || [...weeks].some((w) => w > 1);
}

/** Prefix for day titles when weeks matter (e.g. "Semana 2 · Piernas"). */
export function dayWeekPrefix(weekIndex: number, days: Pick<DraftDayInput, 'weekIndex'>[]): string {
  if (!hasMultipleWeeks(days) && weekIndex <= 1) return '';
  return `Semana ${weekIndex} · `;
}

export function parseOptionalNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseIntField(text: string, fallback: number): number {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePositionsInWeek(days: DraftDayInput[], weekIndex: number): DraftDayInput[] {
  const inWeek = days
    .filter((d) => d.weekIndex === weekIndex)
    .sort((a, b) => a.position - b.position)
    .map((d, index) => ({ ...d, position: index }));
  const other = days.filter((d) => d.weekIndex !== weekIndex);
  return [...other, ...inWeek];
}

export function normalizeAllDayPositions(days: DraftDayInput[]): DraftDayInput[] {
  const weekIndexes = [...new Set(days.map((d) => d.weekIndex))].sort((a, b) => a - b);
  let result = [...days];
  for (const w of weekIndexes) {
    result = normalizePositionsInWeek(result, w);
  }
  return result.sort((a, b) => a.weekIndex - b.weekIndex || a.position - b.position);
}

export function moveDayInWeek(
  days: DraftDayInput[],
  clientKey: string,
  delta: -1 | 1,
): DraftDayInput[] {
  const day = days.find((d) => d.clientKey === clientKey);
  if (!day) return days;
  const weekDays = days
    .filter((d) => d.weekIndex === day.weekIndex)
    .sort((a, b) => a.position - b.position);
  const idx = weekDays.findIndex((d) => d.clientKey === clientKey);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= weekDays.length) return days;

  const swapped = [...weekDays];
  const tmp = swapped[idx]!;
  swapped[idx] = swapped[target]!;
  swapped[target] = tmp;

  const repositioned = swapped.map((d, position) => ({ ...d, position }));
  const rest = days.filter((d) => d.weekIndex !== day.weekIndex);
  return normalizeAllDayPositions([...rest, ...repositioned]);
}

export function duplicateDayInDraft(days: DraftDayInput[], clientKey: string): DraftDayInput[] {
  const source = days.find((d) => d.clientKey === clientKey);
  if (!source) return days;

  const clone: DraftDayInput = {
    clientKey: newClientKey('day'),
    name: `${source.name} (copia)`,
    weekIndex: source.weekIndex,
    position: source.position + 1,
    notes: source.notes,
    exercises: source.exercises.map((ex, exPos) => ({
      ...ex,
      clientKey: newClientKey('ex'),
      position: exPos,
      sets: ex.sets.map((s, sPos) => ({
        ...s,
        clientKey: newClientKey('set'),
        position: sPos,
      })),
    })),
  };

  const bumped = days.map((d) =>
    d.weekIndex === source.weekIndex && d.position > source.position
      ? { ...d, position: d.position + 1 }
      : d,
  );

  return normalizeAllDayPositions([...bumped, clone]);
}

export function routineDaysToDraft(days: RoutineDay[]): DraftDayInput[] {
  return days.map((day) => ({
    clientKey: newClientKey('day'),
    name: day.name,
    weekIndex: day.weekIndex,
    position: day.position,
    notes: day.notes,
    exercises: day.exercises.map((ex) => ({
      clientKey: newClientKey('ex'),
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      instructions: ex.instructions,
      videoMediaId: ex.videoMediaId,
      position: ex.position,
      notes: ex.notes,
      restSeconds: ex.restSeconds,
      sets: ex.sets.map((s) => ({
        clientKey: newClientKey('set'),
        position: s.position,
        targetRepsMin: s.targetRepsMin,
        targetRepsMax: s.targetRepsMax,
        targetWeightKg: s.targetWeightKg,
        restSeconds: s.restSeconds,
      })),
    })),
  }));
}

export function draftToWriteBody(form: RoutineDraftFormState): DraftWriteBody {
  const days = normalizeAllDayPositions(form.days).map((day) => ({
    name: day.name.trim(),
    weekIndex: day.weekIndex,
    position: day.position,
    notes: day.notes,
    exercises: [...day.exercises]
      .sort((a, b) => a.position - b.position)
      .map((ex, exIndex) => ({
        exerciseId: ex.exerciseId,
        position: exIndex,
        notes: ex.notes,
        restSeconds: ex.restSeconds,
        sets: [...ex.sets]
          .sort((a, b) => a.position - b.position)
          .map((s, setIndex) => ({
            position: setIndex,
            targetRepsMin: s.targetRepsMin,
            targetRepsMax: s.targetRepsMax,
            targetWeightKg: s.targetWeightKg,
            restSeconds: s.restSeconds,
          })),
      })),
  }));

  return {
    name: form.name.trim(),
    description: form.description,
    changeNote: form.changeNote,
    days,
  };
}

export function validateDraft(form: RoutineDraftFormState): string | null {
  if (!form.name.trim()) return 'El nombre de la rutina es obligatorio.';
  if (form.name.trim().length > 160) return 'El nombre es demasiado largo.';
  if (form.description.length > 4000) return 'La descripción es demasiado larga.';
  if (form.changeNote.length > 1000) return 'La nota de cambio es demasiado larga.';
  if (form.days.length === 0) return 'Agregá al menos un día de entrenamiento.';

  for (const day of form.days) {
    if (!day.name.trim()) return 'Cada día necesita un nombre.';
    if (day.name.trim().length > 120) return `El día "${day.name}" tiene un nombre muy largo.`;
    if (day.weekIndex < 1 || day.weekIndex > 52) return 'Semana inválida en un día.';
    if (day.notes.length > 4000) return `Las notas del día "${day.name}" son demasiado largas.`;
    if (day.exercises.length > 40) return `Demasiados ejercicios en "${day.name}".`;

    for (const ex of day.exercises) {
      if (!ex.exerciseId) return 'Hay ejercicios sin identificar.';
      if (ex.notes.length > 4000) return `Notas demasiado largas en ${ex.exerciseName}.`;
      if (ex.sets.length === 0)
        return `Cada ejercicio necesita al menos una serie (${ex.exerciseName}).`;
      if (ex.sets.length > 30) return `Demasiadas series en ${ex.exerciseName}.`;

      for (const s of ex.sets) {
        if (s.targetRepsMin < 0 || s.targetRepsMax < 0)
          return 'Las repeticiones no pueden ser negativas.';
        if (s.targetRepsMax < s.targetRepsMin) {
          return `Repeticiones inválidas en ${ex.exerciseName} (máx. menor que mín.).`;
        }
        if (s.targetRepsMin > 500 || s.targetRepsMax > 500) return 'Repeticiones fuera de rango.';
        if (s.targetWeightKg !== null && (s.targetWeightKg < 0 || s.targetWeightKg > 2000)) {
          return 'Peso inválido en una serie.';
        }
        if (s.restSeconds !== null && (s.restSeconds < 0 || s.restSeconds > 3600)) {
          return 'Descanso inválido en una serie.';
        }
      }
    }
  }

  return null;
}

export function setsSummary(
  set: Pick<RoutineSet, 'targetRepsMin' | 'targetRepsMax' | 'targetWeightKg'>,
): string {
  const reps =
    set.targetRepsMin === set.targetRepsMax
      ? `${set.targetRepsMin} rep`
      : `${set.targetRepsMin}–${set.targetRepsMax} rep`;
  const weight = set.targetWeightKg !== null ? ` · ${set.targetWeightKg} kg` : '';
  return `${reps}${weight}`;
}
