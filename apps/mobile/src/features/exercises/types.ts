export type ExerciseScope = 'global' | 'tenant';

export interface ExerciseRevision {
  id: string;
  number: number;
  name: string;
  description: string;
  instructions: string;
  primaryMuscleGroupId: string | null;
  secondaryMuscleGroupIds: string[];
  equipmentId: string | null;
  videoMediaId: string | null;
}

export interface Exercise {
  id: string;
  scope: ExerciseScope;
  basedOnExerciseId: string | null;
  archivedAt: string | null;
  revision: ExerciseRevision;
}

export interface MuscleGroup {
  id: string;
  slug: string;
  name: string;
}

export interface EquipmentItem {
  id: string;
  slug: string;
  name: string;
}

export interface ExerciseWriteBody {
  name: string;
  description: string;
  instructions: string;
  primaryMuscleGroupId: string | null;
  secondaryMuscleGroupIds: string[];
  equipmentId: string | null;
  videoMediaId: string | null;
}

export type ExerciseListScope = 'global' | 'mine' | 'all';

export interface PlaybackUrlResponse {
  url: string;
  expiresInSeconds: number;
  autoplay: false;
}

export function scopeBadgeLabel(scope: ExerciseScope): string {
  return scope === 'global' ? 'Global' : 'Propio';
}

/** In-app player must never autoplay (product rule for beginner-support videos). */
export const EXERCISE_VIDEO_SHOULD_AUTOPLAY = false;

export function validateExerciseWrite(input: {
  name: string;
  description: string;
  instructions: string;
}): string | null {
  if (!input.name.trim()) return 'El nombre es obligatorio.';
  if (input.name.trim().length > 120) return 'El nombre es demasiado largo.';
  if (input.description.length > 4000) return 'La descripción es demasiado larga.';
  if (input.instructions.length > 8000) return 'Las instrucciones son demasiado largas.';
  return null;
}
