export const redisConfig = {
  REDIS: {
    USER_EXPIRY: 86400,
    KEY_PREFIX: 'ws:',
    RETRY_MAX_TIME: 2000,
    MAX_RETRIES: 3,
  },
  CLEANUP: {
    INTERVAL: 3600000,
    THRESHOLD: 86400000,
  },
};
