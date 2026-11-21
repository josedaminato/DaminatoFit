const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && EMAIL_RE.test(trimmed);
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128;
}

export function validationMessage(
  field: 'email' | 'password' | 'name' | 'businessName',
  value: string,
): string | null {
  switch (field) {
    case 'email':
      return isValidEmail(value) ? null : 'Ingresá un email válido.';
    case 'password':
      return isValidPassword(value) ? null : 'La contraseña debe tener al menos 8 caracteres.';
    case 'name':
    case 'businessName':
      return value.trim().length > 0 ? null : 'Este campo es obligatorio.';
    default:
      return null;
  }
}
