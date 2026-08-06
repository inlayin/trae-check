# Tray and Window Lifecycle Design

## Goal

Keep TraeCheck running in the notification area after its main window is closed. The application menu is removed, and the user exits the process explicitly from the tray menu.

## Scope

- Remove Electron's default application menu, including the File menu.
- Create a tray icon using the existing packaged icon assets.
- A normal main-window close hides the window instead of ending the application.
- Clicking the tray icon restores and focuses the main window.
- The tray context menu provides **Show TraeCheck** and **Exit** commands.
- Exit is the sole normal path that closes the main window and terminates the process.

## Design

The Electron main process owns the tray and the window lifecycle. After `app.whenReady`, it clears the application menu, creates the main window, then creates a persistent `Tray` instance with the packaged icon. The tray click handler restores a hidden or minimized window and focuses it. Its context menu uses the same restoration operation and an explicit exit operation.

`BrowserWindow` close handling checks an `isQuitting` flag. Unless that flag is set, it prevents the close and hides the window. The Exit tray command sets the flag and calls `app.quit()`, allowing the normal close path to complete. The existing `activate` handler restores a hidden main window; it only creates a new one when no window exists.

## Error Handling

Window restoration is a no-op if no main window exists. The exit flag ensures that an explicit quit cannot be mistaken for a regular close. Keeping the tray in a module-level variable prevents it from being garbage-collected.

## Testing

Extract the lifecycle decisions into a small, dependency-injected helper that can be exercised with Node's built-in test runner. Tests cover the default close-to-hide behavior, tray restoration of a minimized window, and explicit exit permission. Electron wiring remains minimal and delegates to the tested helper.

## Acceptance Criteria

1. The running app has no File or other top-level Electron application menu.
2. Closing via the title-bar × hides the window and leaves the process running.
3. Clicking the tray icon shows, restores, and focuses the main window.
4. The tray menu has a visible exit command that terminates the application.
5. Existing scheduled tasks continue while the window is hidden.
