export interface OBSScene {
  name: string;
  uuid: string;
  sceneIndex: number;
}

export interface OBSSource {
  name: string;
  uuid: string;
  inputKind: string;
  isActive: boolean;
  volume: number;
  muted: boolean;
}

export interface OBSStreamStatus {
  outputActive: boolean;
  outputReconnecting: boolean;
  outputTimecode: string;
  outputDuration: number;
  outputCongestion: number;
  outputBytes: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
}

export interface OBSRecordStatus {
  outputActive: boolean;
  outputPaused: boolean;
  outputTimecode: string;
  outputDuration: number;
  outputBytes: number;
}

export interface OBSVideoSettings {
  fpsNumerator: number;
  fpsDenominator: number;
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
}

export interface OBSStats {
  cpuUsage: number;
  memoryUsage: number;
  availableDiskSpace: number;
  activeFps: number;
  averageFrameRenderTime: number;
  renderSkippedFrames: number;
  renderTotalFrames: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
}

export interface OBSConnectionConfig {
  host: string;
  port: number;
  password?: string;
  secure: boolean;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
}
