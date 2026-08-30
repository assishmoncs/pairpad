const { detectLanguage, validateFilePath } = require('../src/services/workspaceFileService');

describe('workspace file service', () => {
  test('detects supported languages from extensions', () => {
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('src/App.tsx')).toBe('javascript');
    expect(detectLanguage('main.cpp')).toBe('cpp');
    expect(detectLanguage('main.rs')).toBe('rust');
  });

  test('rejects traversal and unsafe paths', () => {
    expect(() => validateFilePath('../secret.js')).toThrow();
    expect(() => validateFilePath('src/../../secret.js')).toThrow();
    expect(() => validateFilePath('src/file name.js')).toThrow();
  });

  test('normalizes valid relative paths', () => {
    expect(validateFilePath('/src//helper.js/')).toBe('src/helper.js');
  });
});
