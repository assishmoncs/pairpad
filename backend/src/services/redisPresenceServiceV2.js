const crypto = require('crypto');
const { getRedisClient, isRedisReady } = require('./redisService');

const INSTANCE_ID = process.env.PRESENCE_NODE_ID || crypto.randomUUID();
const TTL_MS = 90 * 1000;

const roomKey = (roomCode) => `pairpad:presence:${roomCode}`;
const dataKey = (roomCode) => `pairpad:presence:data:${roomCode}`;
const memberKey = (socketId) => `${INSTANCE_ID}:${socketId}`;

const isAvailable = () => Boolean(getRedisClient() && isRedisReady());

const prune = async (roomCode) => {
  if (!isAvailable()) return;
  const redis = getRedisClient();
  const now = Date.now();
  const expired = await redis.zrangebyscore(roomKey(roomCode), '-inf', now);
  if (expired.length) {
    await redis.zrem(roomKey(roomCode), ...expired);
    await redis.hdel(dataKey(roomCode), ...expired);
  }
};

const upsert = async (roomCode, socketId, payload) => {
  if (!isAvailable()) return false;
  const redis = getRedisClient();
  const member = memberKey(socketId);
  const expiresAt = Date.now() + TTL_MS;
  await redis.zadd(roomKey(roomCode), expiresAt, member);
  await redis.hset(dataKey(roomCode), member, JSON.stringify({ ...payload, socketId }));
  await redis.expire(roomKey(roomCode), Math.ceil(TTL_MS / 1000));
  await redis.expire(dataKey(roomCode), Math.ceil(TTL_MS / 1000));
  return true;
};

const remove = async (roomCode, socketId) => {
  if (!isAvailable()) return false;
  const redis = getRedisClient();
  const member = memberKey(socketId);
  await redis.zrem(roomKey(roomCode), member);
  await redis.hdel(dataKey(roomCode), member);
  return true;
};

const list = async (roomCode) => {
  if (!isAvailable()) return null;
  await prune(roomCode);
  const redis = getRedisClient();
  const values = await redis.hgetall(dataKey(roomCode));
  return Object.values(values).map((value) => JSON.parse(value));
};

const refresh = async (roomCode, socketId) => {
  if (!isAvailable()) return false;
  const redis = getRedisClient();
  const member = memberKey(socketId);
  await redis.zadd(roomKey(roomCode), Date.now() + TTL_MS, member);
  await redis.expire(roomKey(roomCode), Math.ceil(TTL_MS / 1000));
  await redis.expire(dataKey(roomCode), Math.ceil(TTL_MS / 1000));
  return true;
};

module.exports = { upsert, remove, list, refresh, isAvailable, INSTANCE_ID };
