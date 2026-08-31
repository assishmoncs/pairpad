const { getRedisClient, isRedisReady } = require('./redisService');

const keyFor = (roomCode) => `pairpad:presence:${roomCode}`;

const setMember = async (roomCode, userId, payload, ttlSeconds = 90) => {
  const redis = getRedisClient();
  if (!redis || !isRedisReady()) return false;
  const key = keyFor(roomCode);
  await redis.hset(key, String(userId), JSON.stringify(payload));
  await redis.expire(key, ttlSeconds);
  return true;
};

const removeMember = async (roomCode, userId) => {
  const redis = getRedisClient();
  if (!redis || !isRedisReady()) return false;
  const key = keyFor(roomCode);
  await redis.hdel(key, String(userId));
  return true;
};

const getMembers = async (roomCode) => {
  const redis = getRedisClient();
  if (!redis || !isRedisReady()) return null;
  const values = await redis.hgetall(keyFor(roomCode));
  return Object.values(values).map((value) => JSON.parse(value));
};

const touch = async (roomCode, ttlSeconds = 90) => {
  const redis = getRedisClient();
  if (!redis || !isRedisReady()) return false;
  await redis.expire(keyFor(roomCode), ttlSeconds);
  return true;
};

module.exports = { setMember, removeMember, getMembers, touch };
