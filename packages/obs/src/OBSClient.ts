import OBSWebSocket from 'obs-websocket-js';
import { createLogger, retryWithBackoff } from '@wanted/shared';
import type {
  OBSConnectionConfig,
  OBSRecordStatus,
  OBSScene,
  OBSSource,
  OBSStats,
  OBSStreamStatus,
  OBSVideoSettings,
} from '@wanted/shared';

export type OBSClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type OBSEventHandler = {
  onSceneChanged?: (sceneName: string, previous: string) => void;
  onStreamStarted?: () => void;
  onStreamStopped?: () => void;
  onRecordingStarted?: () => void;
  onRecordingStopped?: (path: string) => void;
  onStatsUpdated?: (stats: OBSStats) => void;
  onDisconnected?: (reason?: string) => void;
  onConnected?: () => void;
};

export class OBSClient {
  private readonly obs: OBSWebSocket;
  private readonly log = createLogger('OBSClient');
  private status: OBSClientStatus = 'disconnected';
  private config: OBSConnectionConfig;
  private handlers: OBSEventHandler = {};
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;

  constructor(config: OBSConnectionConfig) {
    this.config = config;
    this.obs = new OBSWebSocket();
    this.bindInternalEvents();
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;

    this.status = 'connecting';
    this.log.info('Connecting to OBS WebSocket', {
      host: this.config.host,
      port: this.config.port,
    });

    await retryWithBackoff(
      async () => {
        const url = `${this.config.secure ? 'wss' : 'ws'}://${this.config.host}:${this.config.port}`;
        await this.obs.connect(url, this.config.password);
      },
      3,
      1000,
    );
  }

  async disconnect(): Promise<void> {
    this.stopStatsPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.obs.disconnect();
    this.status = 'disconnected';
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  getStatus(): OBSClientStatus {
    return this.status;
  }

  setHandlers(handlers: OBSEventHandler): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  async getScenes(): Promise<OBSScene[]> {
    this.assertConnected();
    const response = await this.obs.call('GetSceneList');
    return (response.scenes as Array<{ sceneName: string; sceneUuid: string; sceneIndex: number }>).map((s) => ({
      name: s.sceneName,
      uuid: s.sceneUuid,
      sceneIndex: s.sceneIndex,
    }));
  }

  async getCurrentScene(): Promise<string> {
    this.assertConnected();
    const response = await this.obs.call('GetCurrentProgramScene');
    return response.currentProgramSceneName;
  }

  async setCurrentScene(sceneName: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetCurrentProgramScene', { sceneName });
    this.log.info(`Scene switched to: ${sceneName}`);
  }

  async getInputList(): Promise<OBSSource[]> {
    this.assertConnected();
    const response = await this.obs.call('GetInputList');
    return (response.inputs as Array<{
      inputName: string;
      inputUuid: string;
      inputKind: string;
    }>).map((i) => ({
      name: i.inputName,
      uuid: i.inputUuid,
      inputKind: i.inputKind,
      isActive: true,
      volume: 1,
      muted: false,
    }));
  }

  async setSourceVisible(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    this.assertConnected();
    const response = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
    await this.obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: response.sceneItemId,
      sceneItemEnabled: visible,
    });
  }

  async startStream(): Promise<void> {
    this.assertConnected();
    await this.obs.call('StartStream');
    this.log.info('OBS stream started');
  }

  async stopStream(): Promise<void> {
    this.assertConnected();
    await this.obs.call('StopStream');
    this.log.info('OBS stream stopped');
  }

  async getStreamStatus(): Promise<OBSStreamStatus> {
    this.assertConnected();
    const r = await this.obs.call('GetStreamStatus');
    return {
      outputActive: r.outputActive,
      outputReconnecting: r.outputReconnecting,
      outputTimecode: r.outputTimecode,
      outputDuration: r.outputDuration,
      outputCongestion: r.outputCongestion,
      outputBytes: r.outputBytes,
      outputSkippedFrames: r.outputSkippedFrames,
      outputTotalFrames: r.outputTotalFrames,
    };
  }

  async startRecording(): Promise<void> {
    this.assertConnected();
    await this.obs.call('StartRecord');
    this.log.info('OBS recording started');
  }

  async stopRecording(): Promise<string> {
    this.assertConnected();
    const r = await this.obs.call('StopRecord');
    this.log.info('OBS recording stopped', { path: r.outputPath });
    return r.outputPath;
  }

  async getRecordStatus(): Promise<OBSRecordStatus> {
    this.assertConnected();
    const r = await this.obs.call('GetRecordStatus');
    return {
      outputActive: r.outputActive,
      outputPaused: r.outputPaused,
      outputTimecode: r.outputTimecode,
      outputDuration: r.outputDuration,
      outputBytes: r.outputBytes,
    };
  }

  async getVideoSettings(): Promise<OBSVideoSettings> {
    this.assertConnected();
    const r = await this.obs.call('GetVideoSettings');
    return {
      fpsNumerator: r.fpsNumerator,
      fpsDenominator: r.fpsDenominator,
      baseWidth: r.baseWidth,
      baseHeight: r.baseHeight,
      outputWidth: r.outputWidth,
      outputHeight: r.outputHeight,
    };
  }

  async getStats(): Promise<OBSStats> {
    this.assertConnected();
    const r = await this.obs.call('GetStats');
    return {
      cpuUsage: r.cpuUsage,
      memoryUsage: r.memoryUsage,
      availableDiskSpace: r.availableDiskSpace,
      activeFps: r.activeFps,
      averageFrameRenderTime: r.averageFrameRenderTime,
      renderSkippedFrames: r.renderSkippedFrames,
      renderTotalFrames: r.renderTotalFrames,
      outputSkippedFrames: r.outputSkippedFrames,
      outputTotalFrames: r.outputTotalFrames,
    };
  }

  async setInputMute(inputName: string, muted: boolean): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetInputMute', { inputName, inputMuted: muted });
  }

  async setInputVolume(inputName: string, volumeDb: number): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetInputVolume', { inputName, inputVolumeDb: volumeDb });
  }

  async sendStreamCaption(captionText: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SendStreamCaption', { captionText });
  }

  startStatsPolling(intervalMs = 5000): void {
    this.stopStatsPolling();
    this.statsTimer = setInterval(async () => {
      if (!this.isConnected()) return;
      try {
        const stats = await this.getStats();
        this.handlers.onStatsUpdated?.(stats);
      } catch {
        // Stats polling failures are non-fatal
      }
    }, intervalMs);
  }

  stopStatsPolling(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private bindInternalEvents(): void {
    this.obs.on('ConnectionOpened', () => {
      this.status = 'connected';
      this.reconnectCount = 0;
      this.log.info('OBS WebSocket connected');
      this.handlers.onConnected?.();
      this.startStatsPolling();
    });

    this.obs.on('ConnectionClosed', (event) => {
      this.status = 'disconnected';
      this.stopStatsPolling();
      this.log.warn('OBS WebSocket disconnected', { code: event.code, reason: event.reason });
      this.handlers.onDisconnected?.(event.reason);
      this.scheduleReconnect();
    });

    this.obs.on('ConnectionError', (err) => {
      this.status = 'error';
      this.log.error('OBS WebSocket connection error', err);
    });

    this.obs.on('CurrentProgramSceneChanged', (event) => {
      this.handlers.onSceneChanged?.(event.sceneName, '');
    });

    this.obs.on('StreamStateChanged', (event) => {
      if (event.outputActive) {
        this.handlers.onStreamStarted?.();
      } else {
        this.handlers.onStreamStopped?.();
      }
    });

    this.obs.on('RecordStateChanged', (event) => {
      if (event.outputActive) {
        this.handlers.onRecordingStarted?.();
      } else {
        this.handlers.onRecordingStopped?.(event.outputPath ?? '');
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectCount >= this.config.maxReconnectAttempts) {
      this.log.error('Max reconnect attempts reached, giving up');
      return;
    }

    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(1.5, this.reconnectCount),
      60_000,
    );

    this.reconnectCount++;
    this.log.info(`Scheduling reconnect attempt ${this.reconnectCount} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this.log.error('Reconnect failed', err);
      });
    }, delay);
  }

  private assertConnected(): void {
    if (!this.isConnected()) {
      throw new Error('OBS WebSocket is not connected');
    }
  }
}
