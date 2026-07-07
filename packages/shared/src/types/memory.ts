export type MemoryType = 'short_term' | 'long_term' | 'episodic' | 'semantic' | 'procedural';

export type MemoryScope = 'session' | 'stream' | 'creator' | 'viewer' | 'global';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  key: string;
  content: string;
  embedding?: number[];
  tags: string[];
  importance: number;
  accessCount: number;
  lastAccessedAt: Date;
  expiresAt?: Date;
  sourceAgentId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchQuery {
  query: string;
  type?: MemoryType;
  scope?: MemoryScope;
  tags?: string[];
  limit?: number;
  minImportance?: number;
  sessionId?: string;
  similarityThreshold?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  similarity: number;
  relevanceScore: number;
}

export interface ConversationMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
  tokens?: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ConversationHistory {
  id: string;
  agentId: string;
  sessionId?: string;
  messages: ConversationMessage[];
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatorProfile {
  id: string;
  name: string;
  brand: string;
  niche: string[];
  targetAudience: string;
  tone: string;
  keyPhrases: string[];
  sponsors: SponsorInfo[];
  goals: string[];
  schedule: StreamSchedule;
  platforms: PlatformProfile[];
  totalRevenue: number;
  totalStreams: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorInfo {
  name: string;
  contactEmail?: string;
  dealValue?: number;
  notes?: string;
  activeSince?: Date;
}

export interface StreamSchedule {
  timezone: string;
  days: Array<{
    day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    startTime: string;
    durationHours: number;
  }>;
}

export interface PlatformProfile {
  platform: string;
  channelName: string;
  followers: number;
  subscribers: number;
  averageViewers: number;
  totalViews: number;
}
