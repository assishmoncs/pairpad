const Revision = require('../src/models/Revision');

describe('Revision schema', () => {
  test('uses safe defaults and expected limits', () => {
    const revision = new Revision({
      room: '64f000000000000000000001',
      author: '64f000000000000000000002',
      content: 'console.log("hello")',
      language: 'javascript',
    });

    expect(revision.message).toBe('Automatic checkpoint');
    expect(revision.source).toBe('automatic');
    expect(revision.content.length).toBeLessThanOrEqual(524288);
  });

  test('rejects unsupported languages', () => {
    const revision = new Revision({
      room: '64f000000000000000000001',
      author: '64f000000000000000000002',
      content: 'hello',
      language: 'brainfuck',
    });

    const error = revision.validateSync();
    expect(error.errors.language).toBeDefined();
  });
});
