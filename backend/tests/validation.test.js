const {
  sanitizeString,
  isValidEmail,
  validatePassword,
  validateRoomName,
  validateLanguage,
  validateChatMessage,
  validateSourceCode,
} = require('../src/utils/validation');

describe('sanitizeString', () => {
  it('returns an empty string for non-string input', () => {
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(42)).toBe('');
    expect(sanitizeString({})).toBe('');
  });

  it('trims whitespace and strips null bytes', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
    expect(sanitizeString('he\0llo')).toBe('hello');
    expect(sanitizeString('\0  spaced \0')).toBe('spaced');
  });

  it('truncates input longer than 10000 characters', () => {
    const long = 'a'.repeat(10050);
    expect(sanitizeString(long)).toHaveLength(10000);
  });

  it('leaves input at the length limit untouched', () => {
    const exact = 'a'.repeat(10000);
    expect(sanitizeString(exact)).toHaveLength(10000);
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co.uk')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('no@domain')).toBe(false);
    expect(isValidEmail('spaces in@example.com')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
  });

  it('rejects addresses longer than 254 characters', () => {
    const local = 'a'.repeat(250);
    expect(isValidEmail(`${local}@example.com`)).toBe(false);
  });
});

describe('validatePassword', () => {
  it('accepts a password of allowed length', () => {
    expect(validatePassword('password123')).toEqual({ valid: true });
    expect(validatePassword('abcdef')).toEqual({ valid: true });
  });

  it('rejects non-string input', () => {
    expect(validatePassword(123456)).toEqual({
      valid: false,
      error: 'Password must be a string.',
    });
  });

  it('rejects passwords shorter than 6 characters', () => {
    const result = validatePassword('12345');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 6 characters/);
  });

  it('rejects passwords longer than 128 characters', () => {
    const result = validatePassword('a'.repeat(129));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/128 characters/);
  });
});

describe('validateRoomName', () => {
  it('accepts and trims a valid name', () => {
    expect(validateRoomName('  Team Room-1_A  ')).toEqual({
      valid: true,
      value: 'Team Room-1_A',
    });
  });

  it('rejects non-string input', () => {
    expect(validateRoomName(null)).toEqual({
      valid: false,
      error: 'Room name must be a string.',
    });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateRoomName('   ').error).toBe('Room name cannot be empty.');
  });

  it('rejects a name longer than 50 characters', () => {
    expect(validateRoomName('a'.repeat(51)).error).toMatch(/50 characters/);
  });

  it('rejects names with disallowed characters', () => {
    expect(validateRoomName('room!@#').valid).toBe(false);
    expect(validateRoomName('<script>').valid).toBe(false);
  });
});

describe('validateLanguage', () => {
  const allowed = ['javascript', 'python', 'go'];

  it('accepts an allowed language, normalized to lowercase', () => {
    expect(validateLanguage('  Python ', allowed)).toEqual({
      valid: true,
      value: 'python',
    });
  });

  it('rejects non-string input', () => {
    expect(validateLanguage(undefined, allowed)).toEqual({
      valid: false,
      error: 'Language must be a string.',
    });
  });

  it('rejects a language outside the allowed list', () => {
    const result = validateLanguage('cobol', allowed);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid language. Allowed: javascript, python, go');
  });
});

describe('validateChatMessage', () => {
  it('accepts and trims a valid message', () => {
    expect(validateChatMessage('  hi there  ')).toEqual({
      valid: true,
      value: 'hi there',
    });
  });

  it('rejects non-string input', () => {
    expect(validateChatMessage({}).error).toBe('Message must be a string.');
  });

  it('rejects an empty message', () => {
    expect(validateChatMessage('    ').error).toBe('Message cannot be empty.');
  });

  it('rejects a message longer than 2000 characters', () => {
    expect(validateChatMessage('a'.repeat(2001)).error).toMatch(/2000 characters/);
  });
});

describe('validateSourceCode', () => {
  it('accepts non-empty code within the size limit', () => {
    expect(validateSourceCode('console.log(1);')).toEqual({ valid: true });
  });

  it('rejects non-string input', () => {
    expect(validateSourceCode(null).error).toBe('Source code must be a string.');
  });

  it('rejects empty code', () => {
    expect(validateSourceCode('').error).toBe('Source code cannot be empty.');
  });

  it('rejects code larger than 50KB', () => {
    expect(validateSourceCode('a'.repeat(51201)).error).toMatch(/50KB/);
  });
});
