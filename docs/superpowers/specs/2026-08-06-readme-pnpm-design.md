# README pnpm Usage Design

## Scope

Standardize the README's setup instructions on pnpm, matching the repository's
`pnpm-lock.yaml` and `pnpm-workspace.yaml`.

## Changes

- Replace the environment requirement `npm or yarn` with `pnpm`.
- Replace `npm install` with `pnpm install`.
- Replace `npm run dev` and `npm run build` with `pnpm dev` and `pnpm build`.

## Non-goals

- Do not change project dependencies, scripts, lockfiles, or runtime behavior.

## Verification

Confirm the README contains the pnpm environment requirement and no longer
contains npm commands in the quick-start section.
