import { ipcMain } from "electron";
import { ChromeTestModeService } from "../services/mcp/chrome-test-mode-service";
import { IPC_CHANNELS } from "./channels";

export class ChromeTestModeIPCHandlers {
  private chromeTestMode = ChromeTestModeService.getInstance();

  constructor() {
    ipcMain.handle(IPC_CHANNELS.CHROME_TEST_MODE_GET_STATUS, async () => {
      return this.chromeTestMode.getStatus();
    });

    ipcMain.handle(IPC_CHANNELS.CHROME_TEST_MODE_OPEN_BROWSER, async () => {
      return this.chromeTestMode.openMonitoredChrome();
    });
  }
}
