const authRoutes = require('../src/routes/authRoutes');
const authSessionRoutes = require('../src/routes/authSessionRoutes');
const executeRoutes = require('../src/routes/executeRoutes');
const interviewRoutes = require('../src/routes/interviewRoutes');
const messageRoutes = require('../src/routes/messageRoutes');
const openApiRoutes = require('../src/routes/openApiRoutes');
const revisionRoutes = require('../src/routes/revisionRoutes');
const roomRoutes = require('../src/routes/roomRoutes');
const workspaceRoutes = require('../src/routes/workspaceRoutes');

describe('Routes', () => {
  it('should export routers', () => {
    expect(authRoutes).toBeDefined();
    expect(authSessionRoutes).toBeDefined();
    expect(executeRoutes).toBeDefined();
    expect(interviewRoutes).toBeDefined();
    expect(messageRoutes).toBeDefined();
    expect(openApiRoutes).toBeDefined();
    expect(revisionRoutes).toBeDefined();
    expect(roomRoutes).toBeDefined();
    expect(workspaceRoutes).toBeDefined();
  });
});
