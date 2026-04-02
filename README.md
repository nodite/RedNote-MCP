# RedNote MCP

[![简体中文](https://img.shields.io/badge/简体中文-当前-orange)](README.md)
[![English](https://img.shields.io/badge/English-Click-yellow)](docs/README.en.md)
[![npm](https://img.shields.io/npm/v/@nodite/rednote-mcp)](https://www.npmjs.com/package/@nodite/rednote-mcp)
[![License](https://img.shields.io/github/license/nodite/rednote-mcp)](LICENSE)

通过 MCP 协议访问小红书内容。集成 rebrowser-playwright + playwright-extra stealth 反检测方案，支持登录态持久化。

> 本项目是 [iFurySt/RedNote-MCP](https://github.com/iFurySt/RedNote-MCP) 的持续维护版本。

https://github.com/user-attachments/assets/06b2c67f-d9ed-4a30-8f1d-9743f3edaa3a

---

## 功能

| 功能 | 状态 |
|------|------|
| 关键词搜索笔记 | ✅ |
| 获取笔记详情（标题、正文、图片、视频、标签、点赞数） | ✅ |
| 获取笔记评论 | ✅ |
| Cookie 持久化登录 | ✅ |
| 反检测浏览器（rebrowser + stealth plugin + 仿人鼠标） | ✅ |

---

## 安装

### 前置要求

```bash
# 安装 @nodite/rednote-mcp
npm install -g @nodite/rednote-mcp

# 安装匹配版本的 Playwright（rebrowser-playwright 1.52 需要 chromium-1169）
npm install -g playwright@1.52.0
npx playwright install chromium
```

### 初始化登录

```bash
# 会自动打开浏览器，扫码或账号密码登录
# Cookie 保存至 ~/.mcp/rednote/cookies.json
rednote-mcp init
```

> 默认等待时间 60 秒，可通过参数调整：`rednote-mcp init 120`

---

## 配置 MCP 客户端

### Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

编辑 `.cursor/mcp.json` 或 Cursor 设置中的 MCP 配置：

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

编辑 `.vscode/mcp.json`：

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

### 通用（npx，无需全局安装）

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

> `--headless` 参数可让浏览器在后台无界面运行（有 cookie 后推荐开启）：
> ```json
> {
>   "mcpServers": {
>     "rednote": {
>       "command": "rednote-mcp",
>       "args": ["--headless", "--stdio"]
>     }
>   }
> }
> ```

---

## 可用工具

配置完成后，MCP 客户端可调用以下工具：

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `search_notes` | 关键词搜索笔记 | `keywords`（必填），`limit`（可选，默认 10） |
| `get_note_content` | 获取笔记详情 | `url`（笔记链接） |
| `get_note_comments` | 获取笔记评论 | `url`（笔记链接） |
| `login` | 在 MCP 客户端内触发登录 | 无 |

---

## 从源码运行

```bash
git clone https://github.com/nodite/rednote-mcp.git
cd rednote-mcp

npm install

# 安装匹配版本的 Playwright
npm install playwright@1.52.0 --save-dev
npx playwright install chromium

# 初始化登录
npm run dev -- init
```

登录成功后，在 MCP 客户端配置中将 `command` 改为 `node`，`args` 指向构建产物：

```bash
# 先构建
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

或者不构建，直接用 `ts-node` 运行源码：

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

## 开发

```bash
# 类型检查
npx tsc --noEmit

# 测试
npm test

# 构建
npm run build

# MCP Inspector 调试
npx @modelcontextprotocol/inspector npx @nodite/rednote-mcp --stdio

# 打包日志
rednote-mcp pack-logs

# 打开日志目录
rednote-mcp open-logs
```

---

## 注意事项

- `~/.mcp/rednote/cookies.json` 包含登录凭证，勿提交至版本控制
- Cookie 过期后重新执行 `rednote-mcp init` 即可
- rebrowser-playwright 需要与 Playwright 版本严格匹配（当前：1.52.0 / chromium-1169）

---

## 贡献

1. Fork 本仓库
2. 创建特性分支 `git checkout -b feature/your-feature`
3. 提交改动并开 PR

---

## 许可证

[MIT](LICENSE)
