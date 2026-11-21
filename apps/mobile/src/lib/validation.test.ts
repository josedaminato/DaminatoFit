import { isValidEmail, isValidPassword, validationMessage } from './validation';

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
});
