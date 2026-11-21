export interface SetInputValues {
  actualReps: number | null;
  actualWeightKg: number | null;
}

export function validateSetInputs(values: SetInputValues): string | null {
  const { actualReps, actualWeightKg } = values;
  if (actualReps !== null && (actualReps < 0 || actualReps > 500)) {
    return 'Las repeticiones deben estar entre 0 y 500.';
  }
  if (actualWeightKg !== null && (actualWeightKg < 0 || actualWeightKg > 2000)) {
    return 'El peso no puede ser negativo.';
  }
  return null;
}

export function parseSetNumberField(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
