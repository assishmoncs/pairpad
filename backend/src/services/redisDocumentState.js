const { getRedisClient, isRedisReady } = require('./redisService');
const { deserializeState, serializeState, applyReplaceOperation, visibleText } = require('./textCrdt');

const PREFIX = process.env.REDIS_DOCUMENT_PREFIX || 'pairpad:document:';
const TTL_SECONDS = Number(process.env.REDIS_DOCUMENT_TTL_SECONDS || 86400);
const MAX_RETRIES = 5;

const keyFor = (roomCode) => `${PREFIX}${roomCode}`;

const getState = async (roomCode) => {
  if (!isRedisReady()) return null;
  const value = await getRedisClient().get(keyFor(roomCode));
  return value || null;
};

const setState = async (roomCode, serializedState) => {
  if (!isRedisReady()) return false;
  await getRedisClient().set(keyFor(roomCode), serializedState, 'EX', TTL_SECONDS);
  return true;
};

const deleteState = async (roomCode) => {
  if (!isRedisReady()) return false;
  await getRedisClient().del(keyFor(roomCode));
  return true;
};

const applyOperationAtomic = async (roomCode, operation) => {
  if (!isRedisReady()) return null;
  const redis = getRedisClient();
  const key = keyFor(roomCode);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await redis.watch(key);
    try {
      const current = await redis.get(key);
      if (!current) {
        await redis.unwatch();
        return null;
      }
      const nodes = deserializeState(current);
      const changed = applyReplaceOperation(nodes, operation);
      const nextState = serializeState(nodes);
      const transaction = redis.multi();
      transaction.set(key, nextState, 'EX', TTL_SECONDS);
      const result = await transaction.exec();
      if (result !== null) {
        return { changed, state: nextState, text: visibleText(nodes) };
      }
    } catch (error) {
      try { await redis.unwatch(); } catch {}
      throw error;
    }
  }

  throw new Error('Could not atomically apply collaborative operation after retries.');
};

module.exports = { keyFor, getState, setState, deleteState, applyOperationAtomic };
