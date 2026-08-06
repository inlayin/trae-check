export interface WindowLifecycleWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
}

export interface WindowLifecycle {
  showWindow(): void
  handleClose(event: { preventDefault(): void }): void
  exit(): void
}

export function createWindowLifecycle(
  getWindow: () => WindowLifecycleWindow | null,
  quit?: () => void
): WindowLifecycle
