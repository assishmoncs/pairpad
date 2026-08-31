const WorkspaceFile = require('../src/models/WorkspaceFile');

describe('WorkspaceFile model', () => {
  test('has a unique room/path index and supported language enum', () => {
    const pathIndex = WorkspaceFile.schema.indexes().find(([fields, options]) => fields.room === 1 && fields.path === 1 && options?.unique);
    expect(pathIndex).toBeTruthy();
    expect(WorkspaceFile.schema.path('language').enumValues).toEqual(expect.arrayContaining(['javascript', 'python', 'cpp', 'rust']));
  });
});
