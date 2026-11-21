export type WorkoutSessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface WorkoutSession {
  id: string;
  clientId: string;
  routineVersionId: string;
  routineVersionDayId: string;
  startedAt: string;
  finishedAt: string | null;
  status: WorkoutSessionStatus;
  notes: string;
  dayName?: string | null;
  versionNumber?: number | null;
  planName?: string | null;
}

export interface WorkoutSetLog {
  id: string;
  clientId: string;
  sessionId: string;
  exerciseId: string;
  exerciseName?: string | null;
  routineVersionSetId: string | null;
  position: number;
  prescribedRepsMin: number | null;
  prescribedRepsMax: number | null;
  prescribedWeightKg: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  completed: boolean;
  notes: string;
  loggedAt: string;
  clientUpdatedAt: string;
}

export interface SetUpsertInput {
  clientId: string;
  exerciseId: string;
  routineVersionSetId?: string | null;
  position: number;
  prescribedRepsMin?: number | null;
  prescribedRepsMax?: number | null;
  prescribedWeightKg?: number | null;
  actualReps?: number | null;
  actualWeightKg?: number | null;
  completed: boolean;
  notes?: string;
  loggedAt?: string;
  clientUpdatedAt: string;
}

export interface SyncSetInput extends SetUpsertInput {
  sessionClientId: string;
}

export interface SyncSessionInput {
  clientId: string;
  routineVersionId: string;
  routineVersionDayId: string;
  startedAt?: string;
  notes?: string;
  status?: WorkoutSessionStatus;
  finishedAt?: string | null;
}

export interface StudentProgressPayload {
  summary: {
    completedSessions: number;
    abandonedSessions: number;
    inProgressSessions: number;
    totalSetsCompleted: number;
    totalVolumeKg: number;
  };
  exercises: {
    exerciseId: string;
    exerciseName: string | null;
    sessionsCount: number;
    maxWeightKg: number | null;
    maxReps: number | null;
    totalVolumeKg: number;
    lastLoggedAt: string | null;
  }[];
  weightHistory: {
    exerciseId: string;
    loggedAt: string;
    weightKg: number | null;
    reps: number | null;
    sessionId: string;
  }[];
  sessionCompliance: {
    sessionId: string;
    startedAt: string;
    dayName: string | null;
    prescribedSets: number;
    completedSets: number;
    matchedPrescription: number;
  }[];
}

export function newWorkoutClientId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sessionStatusLabel(status: WorkoutSessionStatus): string {
  switch (status) {
    case 'in_progress':
      return 'En curso';
    case 'completed':
      return 'Completada';
    case 'abandoned':
      return 'Abandonada';
    default:
      return status;
  }
}

export function isoNow(): string {
  return new Date().toISOString();
}
