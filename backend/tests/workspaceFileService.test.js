const workspaceFileService = require('../src/services/workspaceFileService');
const WorkspaceFile = require('../src/models/WorkspaceFile');
jest.mock('../src/models/WorkspaceFile', () => ({
  findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }) }),
  create: jest.fn().mockResolvedValue({ _id: '1', toObject: () => ({ _id: '1' }) })
}));
describe('workspaceFileService', () => {
  it('exports methods', () => {
    expect(workspaceFileService).toBeDefined();
  });
  it('listFiles', async () => {
    await workspaceFileService.listFiles({ _id: '1', language: 'javascript' }, 'user1');
  });
});
