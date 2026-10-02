# Fork notes (MechRosey/t3todo)

This branch carries fork work on top of upstream `pingdotgg/t3code`. Read this before merging `main` into this branch.

## Rename map — re-apply after every merge

Upstream ships `T3CODE_HOME`, default home `~/.t3`, desktop profile `t3code*`, brand "T3 Code". The fork renames the home/profile surface but keeps other `T3CODE_*` env vars (trace, OTLP, auth token) as-is.

| Upstream                                    | Fork                                                                |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `T3CODE_HOME`                               | `T3TODO_HOME`                                                       |
| default home `~/.t3`                        | `~/.t3todo` (see `scripts/dev-runner.ts` `DEFAULT_T3_HOME`)         |
| desktop userData `t3code-v2` / `t3code-dev` | `t3todo` / `t3todo-dev` (`apps/desktop/src/app/DesktopUserData.ts`) |
| Electron app name/brand "T3 Code"           | "T3 Todo" (`APP_BASE_NAME` in DesktopEnvironment, build scripts)    |

After merging, catch strays:

```bash
grep -rn 'T3CODE_HOME' apps packages scripts --include='*.ts'
grep -rn '"t3code-v2"\|"t3code-dev"\|"T3 Code (Alpha)"\|"T3 Code (Dev)"' apps --include='*.ts'
```

Known deliberate keeps: `T3CODE_TRACE_*`, `T3CODE_OTLP_*`, `T3CODE_DEV_AUTH_TOKEN`, `t3code-dev://` URL scheme, `.repos/` references.

## Fork feature map — files that carry fork lines and collide on every merge

- **Todo board** (the fork's feature): `apps/web/src/components/todo/`, `apps/web/src/routes/_chat.board.tsx`, `apps/server/src/board/`, `packages/contracts/src/todoBoard.ts`, `apps/mobile/src/features/board/`, plus RPC registrations in `packages/contracts/src/rpc.ts` (todoBoard* group members) and `apps/server/src/auth/RpcAuthorization.ts`
- **Board wire plumbing** in upstream-owned files: `apps/server/src/ws.ts` (TodoBoard import, service grab, todoBoard* handlers), `apps/server/src/server.ts` (`Layer.provideMerge(TodoBoard.layer)`), `apps/web/src/components/ChatView.tsx` (BoardView surface, addBoardSurface), `apps/web/src/components/Sidebar.tsx` (openProjectBoard)
- **Fork build/versioning**: `scripts/build-desktop-artifact.ts` — `createStagePackageJson` refactor, `resolveForkBuildVersionMetadata`, `syncDesktopName`. Upstream changes to this file need manual folding, not side-picking
- **Desktop right panel**: `apps/web/src/hooks/useRightPanelSheetLayout.ts` + `apps/web/src/rightPanelLayout.ts` — fork's dppx-aware host decision replaces upstream's CSS-px media query; ChatView wires it into `shouldUsePlanSidebarSheet`
- **Mobile composer**: `apps/mobile/src/features/threads/` prompt-history files + `promptHistoryMessages` prop chain

Dropped upstream surfaces stay dropped: the `agents` right-panel surface was removed upstream (v14) — don't revive it when resolving union conflicts.

## Environment gotchas (this machine)

- No system pnpm; corepack is broken. Use `npx -y pnpm@11.10.0` (version pins in root `package.json`).
- `vp`/`vpr` (vite-plus) only exist after install, in `node_modules/.bin/` — not on PATH.
- Lockfile conflicts: take upstream's `pnpm-lock.yaml`, then `npx -y pnpm@11.10.0 install --lockfile-only`.
- Verify per scope, not repo-wide (CI owns the full suite): `node_modules/.bin/tsc -p <app>/tsconfig.json --noEmit` for contracts/web/server/desktop, then `node_modules/.bin/vp test run <touched test files>`.

## Where the merge state lives

Bare repo at the parent folder with worktrees per branch. `main` tracks `upstream/main` and must stay at parity — fork work happens only on `t3todo` (and `dev`).
