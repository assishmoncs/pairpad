const workspaceFileService = require('../src/services/workspaceFileService');
const WorkspaceFile = require('../src/models/WorkspaceFile');
const mongoose = require('mongoose');

jest.mock('../src/models/WorkspaceFile');

describe('workspaceFileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detectLanguage', () => {
    expect(workspaceFileService.detectLanguage('test.js')).toBe('javascript');
    expect(workspaceFileService.detectLanguage('test.py')).toBe('python');
    expect(workspaceFileService.detectLanguage('test.unknown')).toBe('javascript');
  });

  it('validateFilePath', () => {
    expect(workspaceFileService.validateFilePath('valid.js')).toBe('valid.js');
    try { workspaceFileService.validateFilePath('../invalid.js'); } catch {}
    try { workspaceFileService.validateFilePath('a'.repeat(300)); } catch {}
  });

  it('listFiles', async () => {
    WorkspaceFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });
    const mockLean = jest.fn().mockResolvedValue([{ _id: '1' }]);
    const mockSort = jest.fn().mockReturnValue({ lean: mockLean });
    const mockSelect = jest.fn().mockReturnValue({ sort: mockSort });
    WorkspaceFile.find.mockReturnValue({ select: mockSelect });

    await workspaceFileService.listFiles({ _id: 'room1', language: 'javascript' }, 'user1');
    expect(WorkspaceFile.find).toHaveBeenCalled();
  });

  it('findFile', async () => {
    const mockLean = jest.fn().mockResolvedValue({ _id: '1' });
    WorkspaceFile.findOne.mockReturnValue({ lean: mockLean });

    await workspaceFileService.findFile('room1', 'f1');
    expect(WorkspaceFile.findOne).toHaveBeenCalled();
  });

  it('createFile', async () => {
    WorkspaceFile.create.mockResolvedValue({ _id: '1', toObject: () => ({ _id: '1' }) });
    WorkspaceFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await workspaceFileService.createFile('room1', 'f1.js', 'js', 'content', 'u1');
    expect(WorkspaceFile.create).toHaveBeenCalled();
  });

  it('renameFile', async () => {
    const mockLean = jest.fn().mockResolvedValue({ _id: '1' });
    WorkspaceFile.findOneAndUpdate = jest.fn().mockReturnValue({ lean: mockLean });
    WorkspaceFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await workspaceFileService.renameFile('room1', 'f1.js', 'newF.js', 'u1');
    expect(WorkspaceFile.findOneAndUpdate).toHaveBeenCalled();
  });

  it('deleteFile', async () => {
    WorkspaceFile.findOneAndDelete = jest.fn().mockResolvedValue({ _id: '1', toObject: () => ({ _id: '1' }) });
    await workspaceFileService.deleteFile('room1', 'f1', 'u1');
    expect(WorkspaceFile.findOneAndDelete).toHaveBeenCalled();
  });
});
