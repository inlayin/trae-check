# README Accuracy Rewrite Design

## Scope

Rewrite `README.md` so its user-facing guidance matches the current Electron
application implementation.

## Content model

- Describe TRAE desktop-account import on Windows as the account source.
- Explain that manual, batch, and scheduled check-in share the same desktop
  credential flow: check status, then claim if needed.
- State the actual prerequisites: Windows, a logged-in TRAE desktop client,
  Node.js and pnpm for development.
- Document current behavior for points, logs, retries, notifications, and
  scheduling.
- Describe credential protection accurately: imported credentials use Electron
  `safeStorage`; settings and logs are stored locally.

## Removals

Remove obsolete Cookie, packet-capture, Webview, configurable API-mode, and
overbroad encryption claims.

## Non-goals

Do not modify Electron, Vue, package, or runtime behavior.

## Verification

Check that the rewritten README contains the desktop-import flow and pnpm
commands, while no longer containing Webview, Cookie, packet-capture, or
configurable API-mode guidance.
