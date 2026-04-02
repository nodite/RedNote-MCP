# RedNote MCP

[![English](https://img.shields.io/badge/English-Current-yellow)](README.en.md)
[![简体中文](https://img.shields.io/badge/简体中文-点击查看-orange)](../README.md)
[![npm](https://img.shields.io/npm/v/@nodite/rednote-mcp)](https://www.npmjs.com/package/@nodite/rednote-mcp)
[![License](https://img.shields.io/github/license/nodite/rednote-mcp)](../LICENSE)

Access Xiaohongshu (RedNote) content through the Model Context Protocol. Built on rebrowser-playwright + playwright-extra stealth to stay undetected, with persistent cookie-based login.

> This is an actively maintained fork of [iFurySt/RedNote-MCP](https://github.com/iFurySt/RedNote-MCP).

https://github.com/user-attachments/assets/06b2c67f-d9ed-4a30-8f1d-9743f3edaa3a

---

## Features

| Feature | Status |
|---------|--------|
| Search notes by keyword | ✅ |
| Get note details (title, content, images, videos, tags, likes) | ✅ |
| Get note comments | ✅ |
| Persistent cookie login | ✅ |
| Anti-detection browser (rebrowser + stealth plugin + human-like mouse) | ✅ |

---

## Installation

### Prerequisites

```bash
# Install @nodite/rednote-mcp globally
npm install -g @nodite/rednote-mcp

# Install the matching Playwright version (rebrowser-playwright 1.52 needs chromium-1169)
npm install -g playwright@1.52.0
npx playwright install chromium
```

### Login Setup

```bash
# Opens a browser window — log in with QR code or credentials
# Cookies are saved to ~/.mcp/rednote/cookies.json
rednote-mcp init
```

> Default wait time is 60 seconds. Increase with: `rednote-mcp init 120`

---

## MCP Client Configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rednote": {
      "command": "rednote-mcp",
      "args": ["--stdio"]
    }
  }
}
```

### Cursor

Edit `.cursor/mcp.json` or the MCP section in Cursor settings:

```json
{
  "mcpServers": {
    "rednote": {
      "command": "rednote-mcp",
      "args": ["--stdio"]
    }
  }
}
```

### VS Code (Copilot)

Edit `.vscode/mcp.json`:

```json
{
  "servers": {
    "rednote": {
      "type": "stdio",
      "command": "rednote-mcp",
      "args": ["--stdio"]
    }
  }
}
```

### Universal (npx, no global install needed)

```json
{
  "mcpServers": {
    "rednote": {
      "command": "npx",
      "args": ["-y", "@nodite/rednote-mcp", "--stdio"]
    }
  }
}
```

---

## Available Tools

Once configured, your MCP client can call these tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `search_notes` | Search notes by keyword | `keywords` (required), `limit` (optional, default 10) |
| `get_note_content` | Get full note details | `url` (note URL) |
| `get_note_comments` | Get note comments | `url` (note URL) |
| `login` | Trigger login from within the MCP client | none |

---

## Build from Source

```bash
git clone https://github.com/nodite/rednote-mcp.git
cd rednote-mcp

npm install

# Install matching Playwright version
npm install playwright@1.52.0 --save-dev
npx playwright install chromium

# Login setup
npm run dev -- init
```

After logging in, point your MCP client at the built output:

```bash
# Build first
npm run build
```

```json
{
  "mcpServers": {
    "rednote": {
      "command": "node",
      "args": ["/path/to/rednote-mcp/dist/cli.js", "--stdio"]
    }
  }
}
```

Or skip the build and run TypeScript directly with `ts-node`:

```json
{
  "mcpServers": {
    "rednote": {
      "command": "npx",
      "args": ["ts-node", "/path/to/rednote-mcp/src/cli.ts", "--stdio"]
    }
  }
}
```

---

## Development

```bash
# Type check
npx tsc --noEmit

# Run tests
npm test

# Build
npm run build

# Debug with MCP Inspector
npx @modelcontextprotocol/inspector npx @nodite/rednote-mcp --stdio

# Pack logs into a zip
rednote-mcp pack-logs

# Open logs directory
rednote-mcp open-logs
```

---

## Notes

- `~/.mcp/rednote/cookies.json` contains your login credentials — do not commit it
- When cookies expire, just run `rednote-mcp init` again
- rebrowser-playwright requires a strictly matching Playwright version (currently: 1.52.0 / chromium-1169)

---

## Contributing

1. Fork this repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes and open a PR

---

## License

[MIT](../LICENSE)
