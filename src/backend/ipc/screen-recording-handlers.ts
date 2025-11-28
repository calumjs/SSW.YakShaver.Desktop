import { ipcMain } from "electron";
import { RecordingControlBarWindow } from "../services/recording/control-bar-window";
import { RecordingService } from "../services/recording/recording-service";
import { IPC_CHANNELS } from "./channels";
import { ChromeTestModeService } from "../services/mcp/chrome-test-mode-service";

export class ScreenRecordingIPCHandlers {
  private service = RecordingService.getInstance();
  private controlBar = RecordingControlBarWindow.getInstance();
  private chromeTestMode = ChromeTestModeService.getInstance();

  constructor() {
    Object.entries({
      [IPC_CHANNELS.START_SCREEN_RECORDING]: async (_: unknown, sourceId?: string) => {
        const result = await this.service.handleStartRecording(sourceId);
        if (result.success) {
          await this.chromeTestMode.handleRecordingStart();
        }
        return result;
      },
      [IPC_CHANNELS.STOP_SCREEN_RECORDING]: async (_: unknown, videoData: Uint8Array) => {
        const result = await this.service.handleStopRecording(videoData);
        if (result.success) {
          await this.chromeTestMode.handleRecordingStop(result.filePath);
        } else {
          await this.chromeTestMode.handleRecordingStop();
        }
        return result;
      },
      [IPC_CHANNELS.LIST_SCREEN_SOURCES]: () => this.service.listSources(),
      [IPC_CHANNELS.CLEANUP_TEMP_FILE]: (_: unknown, filePath: string) =>
        this.service.cleanupTempFile(filePath),
      [IPC_CHANNELS.TRIGGER_TRANSCRIPTION]: (_: unknown, filePath: string) =>
        this.service.triggerTranscription(filePath),
      [IPC_CHANNELS.SHOW_CONTROL_BAR]: () =>
        this.controlBar.showForRecording(this.service.getCurrentRecordingDisplayId()),
      [IPC_CHANNELS.HIDE_CONTROL_BAR]: () => this.controlBar.hideWithSuccess(),
      [IPC_CHANNELS.STOP_RECORDING_FROM_CONTROL_BAR]: () =>
        this.controlBar.stopRecordingFromControlBar(),
    }).forEach(([channel, handler]) => ipcMain.handle(channel, handler));
  }
}
