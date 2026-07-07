export const AGENT_IDS = {
  CEO: 'ceo',
  PRODUCER: 'producer',
  OBS: 'obs',
  MODERATOR: 'moderator',
  ANALYTICS: 'analytics',
  CLIP: 'clip',
  YOUTUBE: 'youtube',
  SHORTS: 'shorts',
  TIKTOK: 'tiktok',
  THUMBNAIL: 'thumbnail',
  SPONSOR: 'sponsor',
  COMMUNITY: 'community',
  TREND: 'trend',
  MEMORY: 'memory',
  REVENUE: 'revenue',
} as const;

export const PLATFORMS = {
  TWITCH: 'twitch',
  YOUTUBE: 'youtube',
  KICK: 'kick',
  TIKTOK: 'tiktok',
} as const;

export const DEFAULT_OBS_CONFIG = {
  host: 'localhost',
  port: 4455,
  secure: false,
  reconnectIntervalMs: 5_000,
  maxReconnectAttempts: 10,
} as const;

export const CLIP_DEFAULTS = {
  minDurationSeconds: 15,
  maxDurationSeconds: 60,
  shortsDurationSeconds: 60,
  tiktokDurationSeconds: 30,
  detectWindowSeconds: 30,
  minTriggerScore: 0.65,
} as const;

export const MEMORY_DEFAULTS = {
  shortTermTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  embeddingDimension: 1536,
  maxConversationLength: 50,
  importanceDecayDays: 30,
} as const;

export const AI_DEFAULTS = {
  defaultModel: 'claude-sonnet-4-6',
  fastModel: 'claude-haiku-4-5-20251001',
  embeddingModel: 'text-embedding-3-large', // OpenAI embeddings — Anthropic has no embedding API
  maxTokens: 4096,
  temperature: 0.7,
  topP: 1,
} as const;

export const RATE_LIMITS = {
  chatModeration: 100,
  aiRequests: 60,
  apiRequests: 1000,
  clipCreation: 10,
  uploadQueue: 5,
} as const;

export const WEBSOCKET_EVENTS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
