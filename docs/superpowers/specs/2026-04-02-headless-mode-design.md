# Headless Mode Design

**Date:** 2026-04-02
**Status:** Approved

## Problem

The browser launched during tool execution (`search_notes`, `get_note_content`, `getNoteComments`) is always visible. When running as a background MCP server, users want it to run headlessly without a browser window appearing.

Login (`rednote-mcp init`) always requires a visible browser for QR code scanning and must never run headless.

## Goals

- Add `--headless` CLI flag to the MCP server (stdio mode)
- Tool execution respects the flag; login is unaffected
- Headless + not logged in → clear error, no visible window opened

## Non-Goals

- Headless support for `rednote-mcp init`
- Environment variable fallback (`REDNOTE_HEADLESS`)
- Auto-detection of headless based on cookie presence

## Architecture

### Core change: separate browser ownership

Currently `RedNoteTools.initialize()` calls `authManager.getBrowser()` to launch the browser. This couples tool execution to `AuthManager`'s browser config. With this change, `RedNoteTools` owns its own browser lifecycle and launches it directly with its own headless setting.

```
Before:
  RedNoteTools.initialize()
    → authManager.getBrowser()
        → BrowserFactory.launch(false)   ← headless hardcoded

After:
  RedNoteTools.initialize()
    → BrowserFactory.launch(this.config.headless)   ← config-driven
    → authManager.getCookies()           ← AuthManager for cookies only
```

`AuthManager.login()` continues to call `BrowserFactory.launch(false)` directly — login is always visible.

## Component Changes

### `src/auth/authManager.ts`

- **Remove** `getBrowser()` — only `RedNoteTools` called it; removing it eliminates dead code
- `login()` unchanged: `BrowserFactory.launch(false, { timeout: timeoutMs })`
- `getCookies()` unchanged: still used by `RedNoteTools`

### `src/tools/rednoteTools.ts`

- Constructor signature: `constructor(config: { headless?: boolean } = {})`
- Store: `private readonly config: { headless: boolean }`; default `headless: false`
- `initialize()`:
  - Replace `this.authManager.getBrowser()` with `BrowserFactory.launch(this.config.headless)`
  - `BrowserFactory.newStealthContext(this.browser)` call remains unchanged
  - Cookie loading via `authManager.getCookies()` remains
  - Login check remains; error message: `'Not logged in. Please run: rednote-mcp init'`
- No changes to `searchNotes`, `getNoteContent`, `getNoteComments`, or `cleanup`

### `src/cli.ts`

- Declare `--headless` on the top-level Commander program **before** `program.parse()`:
  ```ts
  program.option('--headless', 'Run browser in headless mode')
  ```
- After `program.parse()`, read via `program.opts().headless`; the `--stdio` branch already uses `process.argv.includes('--stdio')` to detect MCP mode, so `--headless` is just an additional option read from the parsed opts
- Pass to each tool instantiation inside the MCP server's tool handlers:
  ```ts
  const { headless } = program.opts()
  // ... inside each tool handler:
  const tools = new RedNoteTools({ headless: headless ?? false })
  ```
- `init` command: unaffected, no `--headless` option exposed there

### `src/browser/browserFactory.ts`

No changes. `launch(headless = false, options?)` already supports the parameter.

## Data Flow

```
rednote-mcp --headless --stdio
  → program.parse() → { headless: true }
  → MCP server starts

Tool call arrives (e.g. search_notes)
  → new RedNoteTools({ headless: true })
  → initialize()
      → BrowserFactory.launch(true)          // headless Chromium
      → BrowserFactory.newStealthContext()
      → context.newPage()
      → authManager.getCookies() → addCookies()
      → page.goto('xiaohongshu.com')
      → evaluate() checks login
          ├─ logged in  → proceed
          └─ not logged in → throw 'Not logged in. Please run: rednote-mcp init'
  → tool logic executes
  → cleanup() [finally]
```

## Error Handling

| Scenario | headless=false | headless=true |
|----------|---------------|--------------|
| Logged in | Normal execution | Normal execution |
| Not logged in | Throws `'Not logged in. Please run: rednote-mcp init'` | Same — no visible window opened |
| Cookie file missing | Empty cookies → login check fails → same error | Same |

The same `initialize()` login check handles both cases. No additional branching needed for headless.

## Testing

### `src/tools/__tests__/rednoteTools.test.ts`

- Update all `new RedNoteTools()` calls to `new RedNoteTools({})` or `new RedNoteTools({ headless: false })`
- Remove `authManager.getBrowser` mock (method deleted)
- Add:
  - `headless: false` → `BrowserFactory.launch` called with `false`
  - `headless: true` → `BrowserFactory.launch` called with `true`
  - headless + not logged in → throws `'Not logged in'` and `BrowserFactory.launch` received `true`

### `src/auth/__tests__/authManager.test.ts`

- Remove `getBrowser` test cases

## Usage

```bash
# Headless MCP server
rednote-mcp --headless --stdio

# Visible MCP server (default)
rednote-mcp --stdio

# Login — always visible, --headless has no effect
rednote-mcp init
```

MCP client config example:
```json
{
  "mcpServers": {
    "rednote": {
      "command": "rednote-mcp",
      "args": ["--headless", "--stdio"]
    }
  }
}
```
