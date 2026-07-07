import type { ConversationMessage } from '@wanted/shared';
import { generateId, MEMORY_DEFAULTS } from '@wanted/shared';

export class ConversationHistory {
  private readonly histories = new Map<string, ConversationMessage[]>();
  private readonly maxLength: number;

  constructor(maxLength = MEMORY_DEFAULTS.maxConversationLength) {
    this.maxLength = maxLength;
  }

  append(historyId: string, message: ConversationMessage): void {
    const messages = this.histories.get(historyId) ?? [];
    messages.push(message);

    if (messages.length > this.maxLength) {
      const systemMessages = messages.filter((m) => m.role === 'system');
      const nonSystem = messages.filter((m) => m.role !== 'system');
      const trimmed = nonSystem.slice(-Math.max(this.maxLength - systemMessages.length, 1));
      this.histories.set(historyId, [...systemMessages, ...trimmed]);
    } else {
      this.histories.set(historyId, messages);
    }
  }

  get(historyId: string): ConversationMessage[] {
    return this.histories.get(historyId) ?? [];
  }

  addUserMessage(historyId: string, content: string): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.append(historyId, msg);
    return msg;
  }

  addAssistantMessage(historyId: string, content: string, tokens?: number): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      tokens,
    };
    this.append(historyId, msg);
    return msg;
  }

  addSystemMessage(historyId: string, content: string): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId(),
      role: 'system',
      content,
      timestamp: new Date(),
    };
    const messages = this.histories.get(historyId) ?? [];
    messages.unshift(msg);
    this.histories.set(historyId, messages);
    return msg;
  }

  clear(historyId: string): void {
    this.histories.delete(historyId);
  }

  getTokenCount(historyId: string): number {
    return (this.histories.get(historyId) ?? []).reduce((sum, m) => sum + (m.tokens ?? 0), 0);
  }

  listIds(): string[] {
    return Array.from(this.histories.keys());
  }
}
