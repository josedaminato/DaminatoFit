import { isValidEmail, isValidPassword, passwordsMatch, validationMessage } from './validation';

describe('validation', () => {
  it('validates email format', () => {
    expect(isValidEmail('coach@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(validationMessage('email', 'bad')).toMatch(/email/i);
  });

  it('requires password length >= 8', () => {
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('longenough')).toBe(true);
    expect(validationMessage('password', '123')).toMatch(/8/);
  });

  it('checks password confirmation', () => {
    expect(passwordsMatch('password123', 'password123')).toBe(true);
    expect(passwordsMatch('password123', 'password999')).toBe(false);
  });
});
