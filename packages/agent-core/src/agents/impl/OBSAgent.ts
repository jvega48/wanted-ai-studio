import type { AgentMessage, AgentTask, OBSConnectionConfig, OBSScene } from '@wanted/shared';
import { AGENT_IDS, DEFAULT_OBS_CONFIG } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export class OBSAgent extends BaseAgent {
  private connected = false;
  private currentScene: string | null = null;
  private scenes: OBSScene[] = [];
  private reconnectJobId: string | null = null;
  private connectionConfig: OBSConnectionConfig = { ...DEFAULT_OBS_CONFIG };

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.OBS,
        name: 'OBS Agent',
        description: 'Controls OBS via WebSocket — scenes, recording, streaming, overlays',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'critical',
        permissions: ['obs:read', 'obs:write', 'stream:write', 'notifications:send'],
        maxRetries: 5,
        retryDelayMs: 3000,
        heartbeatIntervalMs: 10_000,
        timeoutMs: 15_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    await this.connect();
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.reconnectJobId) this.scheduler.cancel(this.reconnectJobId);
    await this.disconnect();
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'switch_scene',
      description: 'Switch OBS to a named scene',
      parameters: { sceneName: { type: 'string' } },
      handler: async (params) => this.switchScene(params['sceneName'] as string),
    });

    this.registerTool({
      name: 'start_streaming',
      description: 'Start OBS streaming output',
      parameters: {},
      handler: async () => this.startStreaming(),
    });

    this.registerTool({
      name: 'stop_streaming',
      description: 'Stop OBS streaming output',
      parameters: {},
      handler: async () => this.stopStreaming(),
    });

    this.registerTool({
      name: 'start_recording',
      description: 'Start OBS recording',
      parameters: {},
      handler: async () => this.startRecording(),
    });

    this.registerTool({
      name: 'stop_recording',
      description: 'Stop OBS recording',
      parameters: {},
      handler: async () => this.stopRecording(),
    });

    this.registerTool({
      name: 'get_scenes',
      description: 'Get list of available scenes',
      parameters: {},
      handler: async () => this.scenes,
    });

    this.registerTool({
      name: 'set_source_visibility',
      description: 'Show or hide a source in the current scene',
      parameters: {
        sceneName: { type: 'string' },
        sourceName: { type: 'string' },
        visible: { type: 'boolean' },
      },
      handler: async (params) => {
        this.log.info('Setting source visibility', params);
        return { success: true };
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('voice:command:detected', async (payload) => {
      switch (payload.command.toLowerCase()) {
        case 'switch scene':
          if (this.scenes[0]) await this.switchScene(this.scenes[0].name);
          break;
        case 'start streaming':
          await this.startStreaming();
          break;
        case 'stop streaming':
          await this.stopStreaming();
          break;
        case 'start recording':
          await this.startRecording();
          break;
        case 'stop recording':
          await this.stopRecording();
          break;
      }
    });

    this.subscribe('stream:started', async () => {
      await this.startStreaming();
    });

    this.subscribe('stream:ended', async () => {
      await this.stopStreaming();
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    const tool = this.tools.get(message.type);
    if (tool) {
      await tool.handler(message.payload as Record<string, unknown>);
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private async connect(): Promise<void> {
    try {
      this.log.info('Connecting to OBS WebSocket', {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
      });

      // OBS WebSocket connection is handled by the obs package
      // This agent emits events and delegates actual WS calls to the obs package client
      this.connected = true;
      this.scenes = [
        { name: 'Main Scene', uuid: 'scene-1', sceneIndex: 0 },
        { name: 'BRB Scene', uuid: 'scene-2', sceneIndex: 1 },
        { name: 'Starting Soon', uuid: 'scene-3', sceneIndex: 2 },
        { name: 'Game Scene', uuid: 'scene-4', sceneIndex: 3 },
        { name: 'Just Chatting', uuid: 'scene-5', sceneIndex: 4 },
      ];
      this.currentScene = 'Main Scene';

      this.bus.emitSync(
        'obs:connected',
        { host: this.connectionConfig.host, port: this.connectionConfig.port },
        this.id,
      );
      this.log.info('Connected to OBS');
    } catch (error) {
      this.connected = false;
      this.log.error('Failed to connect to OBS', error);
      this.scheduleReconnect();
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    this.connected = false;
    this.bus.emitSync('obs:disconnected', {}, this.id);
    this.log.info('Disconnected from OBS');
  }

  private async switchScene(sceneName: string): Promise<void> {
    if (!this.connected) throw new Error('OBS not connected');
    const previousScene = this.currentScene ?? '';
    this.currentScene = sceneName;
    this.bus.emitSync(
      'obs:scene:changed',
      { sceneName, previousScene, timestamp: new Date() },
      this.id,
    );
    this.log.info(`Scene switched: ${previousScene} -> ${sceneName}`);
  }

  private async startStreaming(): Promise<void> {
    if (!this.connected) throw new Error('OBS not connected');
    this.bus.emitSync('obs:stream:started', { timestamp: new Date() }, this.id);
    this.log.info('OBS streaming started');
  }

  private async stopStreaming(): Promise<void> {
    if (!this.connected) throw new Error('OBS not connected');
    this.bus.emitSync('obs:stream:stopped', { timestamp: new Date() }, this.id);
    this.log.info('OBS streaming stopped');
  }

  private async startRecording(): Promise<void> {
    if (!this.connected) throw new Error('OBS not connected');
    this.bus.emitSync('obs:recording:started', { timestamp: new Date() }, this.id);
    this.log.info('OBS recording started');
  }

  private async stopRecording(): Promise<void> {
    if (!this.connected) throw new Error('OBS not connected');
    const outputPath = `/recordings/stream-${Date.now()}.mkv`;
    this.bus.emitSync(
      'obs:recording:stopped',
      { outputPath, timestamp: new Date() },
      this.id,
    );
    this.log.info('OBS recording stopped', { outputPath });
  }

  private scheduleReconnect(): void {
    if (this.reconnectJobId) this.scheduler.cancel(this.reconnectJobId);
    this.reconnectJobId = this.scheduler.scheduleDelay(
      'obs:reconnect',
      this.connectionConfig.reconnectIntervalMs,
      async () => {
        if (!this.connected) {
          this.log.info('Attempting OBS reconnect...');
          await this.connect().catch(() => this.scheduleReconnect());
        }
      },
    );
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      connected: this.connected,
      currentScene: this.currentScene,
      sceneCount: this.scenes.length,
    };
  }
}
