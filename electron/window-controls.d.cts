export interface WindowControlWindow {
  minimize(): void
  isMaximized(): boolean
  maximize(): void
  unmaximize(): void
  close(): void
  webContents: { send(channel: 'window:maximized-changed', value: boolean): void }
  on(event: 'maximize' | 'unmaximize', listener: () => void): void
}

export function registerWindowControls(
  ipcMain: { handle(channel: string, listener: () => unknown): void },
  getWindow: () => WindowControlWindow | null
): void
