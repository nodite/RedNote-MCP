# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/ (excludes tests)
npm test               # Run all Jest tests
npm test -- --testPathPattern=rednoteTools   # Run a single test file
npx tsc --noEmit       # Type-check without emitting
npm run dev -- init    # Run init command via ts-node (no build needed)
```

After building, the CLI binary is `dist/cli.js` and is exposed as `rednote-mcp`.

## Architecture

This is a Node.js MCP server that exposes 4 tools (`search_notes`, `get_note_content`, `get_note_comments`, `login`) over stdio, backed by a headless Chromium browser.

**Entry point flow:**
- `src/index.ts` → `src/cli.ts` (the real entry)
- When invoked with `--stdio`: starts the MCP server (`main()`)
- Otherwise: parses CLI commands (`init`, `pack-logs`, `open-logs`) via commander

**Browser layer (`src/browser/browserFactory.ts`):**
Uses `rebrowser-playwright` (CDP-patched Playwright fork) wrapped with `playwright-extra` stealth plugin to evade bot detection. Launch args and context options are centralized here. The browser locale/timezone is hardcoded to `zh-CN` / `Asia/Shanghai` to match the target site.

**Auth layer (`src/auth/`):**
- `AuthManager` — handles the login flow: launches a non-headless browser, navigates to the site, waits for QR code scan, then saves cookies on success
- `CookieManager` — persists cookies to `~/.mcp/rednote/cookies.json`
- Login verification checks for `.user.side-bar-component .channel` in the DOM

**Tools layer (`src/tools/`):**
- `RedNoteTools` — each public method calls `initialize()` (loads cookies, checks login) then scrapes, and always calls `cleanup()` in a `finally` block. A fresh browser is created per tool invocation.
- `noteDetail.ts` — `GetNoteDetail` runs inside `page.evaluate()`. The `chineseUnitStrToNumber` helper must be defined both at module level (for unit tests) and inline inside `getContent` (for the browser sandbox) — keep them in sync.

**Logging (`src/utils/logger.ts`):**
Winston with daily-rotate-file, stored at `~/Library/Application Support/rednote-mcp/logs/` on macOS. Also captures raw stdio JSON via `stdioLogger.ts`.

## Testing

Tests live in `src/**/__tests__/`. `rebrowser-playwright` is fully mocked via `__mocks__/rebrowser-playwright.ts`, which exports `mockPage`, `mockBrowser`, and `mockContext`. `BrowserFactory` and `AuthManager` are jest-mocked inline in each test file.

`tsconfig.test.json` includes test files; `tsconfig.build.json` excludes them.

## Key constraints

- **rebrowser-playwright version must match the installed Playwright/Chromium.** Current: `rebrowser-playwright@1.52.0` + `playwright@1.52.0` (chromium-1169). Mismatches cause silent browser launch failures.
- `~/.mcp/rednote/cookies.json` must never be committed — it contains session credentials.
- The `--headless` flag is only wired for MCP stdio mode (`main(headless)`); the `init` CLI command always runs headed (required for QR code display).
