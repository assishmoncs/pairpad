const fs = require('fs');
const path = require('path');

describe('OpenAPI contract', () => {
  const document = fs.readFileSync(path.resolve(__dirname, '../../docs/openapi.yaml'), 'utf8');

  test('declares the OpenAPI version and required security scheme', () => {
    expect(document).toContain('openapi: 3.1.0');
    expect(document).toContain('bearerAuth:');
    expect(document).toContain('scheme: bearer');
  });

  test('documents the critical REST surfaces', () => {
    [
      '/api/auth/register:',
      '/api/auth/login:',
      '/api/auth/refresh:',
      '/api/auth/logout:',
      '/api/auth/logout-all:',
      '/api/auth/me:',
      '/api/rooms:',
      '/api/rooms/{roomCode}/history:',
      '/api/messages/room/{roomCode}:',
      '/api/execute:',
      '/health:',
      '/ready:',
    ].forEach((route) => expect(document).toContain(route));
  });

  test('matches implementation safety limits', () => {
    expect(document).toContain("name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 50 }");
    expect(document).toContain("name: roomCode, in: path, required: true, schema: { type: string, pattern: '^[A-Z0-9]{6}$' }");
    expect(document).toContain('maxLength: 524288');
    expect(document).toContain('maxLength: 10000');
  });
});
