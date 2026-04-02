# Headless Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--headless` CLI flag so the MCP server's tool calls (search/get) run Chromium headlessly without a visible window, while login always stays visible.

**Architecture:** `RedNoteTools` gains a `{ headless?: boolean }` config at construction and calls `BrowserFactory.launch(headless)` directly, removing its dependency on `authManager.getBrowser()`. `cli.ts` detects `--headless` via `process.argv` (consistent with the existing `--stdio` pattern) and moves tool registrations inside `main(headless)` so they close over the flag.

**Tech Stack:** TypeScript, rebrowser-playwright, @modelcontextprotocol/sdk, Jest

---

### Task 1: Update `RedNoteTools` — constructor config + initialize() + tests

**Files:**
- Modify: `src/tools/__tests__/rednoteTools.test.ts`
- Modify: `src/tools/rednoteTools.ts`

- [ ] **Step 1: Write failing tests**

In `src/tools/__tests__/rednoteTools.test.ts`, make the following changes:

**1a. Remove `getBrowser` from the `AuthManager` mock** (line 12) — the method is being deleted:

```typescript
jest.mock('../../auth/authManager', () => {
  return {
    AuthManager: jest.fn().mockImplementation(() => ({
      getCookies: jest.fn().mockResolvedValue([]),
    })),
  }
})
```

**1b. Update `beforeEach` — change `new RedNoteTools()` to `new RedNoteTools({})`** (line 48):

```typescript
  beforeEach(() => {
    jest.clearAllMocks()
    const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
    BrowserFactory.newStealthContext.mockResolvedValue(mockContext)
    BrowserFactory.launch.mockResolvedValue(mockBrowser)
    mockContext.newPage.mockResolvedValue(mockPage)
    tools = new RedNoteTools({})
  })
```

**1c. Update the existing "throws Not logged in" test** — change expected message (line 57–59):

```typescript
    it('throws "Not logged in" error when page.evaluate returns false', async () => {
      mockPage.evaluate.mockResolvedValue(false)
      await expect(tools.initialize()).rejects.toThrow('Not logged in. Please run: rednote-mcp init')
    })
```

**1d. Add three new tests inside `describe('initialize', ...)`** after the existing two:

```typescript
    it('passes headless=false to BrowserFactory.launch by default', async () => {
      const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
      mockPage.evaluate.mockResolvedValue(true)
      const t = new RedNoteTools({})
      await t.initialize()
      expect(BrowserFactory.launch).toHaveBeenCalledWith(false)
    })

    it('passes headless=true to BrowserFactory.launch when configured', async () => {
      const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
      mockPage.evaluate.mockResolvedValue(true)
      const t = new RedNoteTools({ headless: true })
      await t.initialize()
      expect(BrowserFactory.launch).toHaveBeenCalledWith(true)
    })

    it('throws with helpful message when headless=true and not logged in', async () => {
      const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
      mockPage.evaluate.mockResolvedValue(false)
      const t = new RedNoteTools({ headless: true })
      await expect(t.initialize()).rejects.toThrow('Not logged in. Please run: rednote-mcp init')
      expect(BrowserFactory.launch).toHaveBeenCalledWith(true)
    })
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
npx jest src/tools/__tests__/rednoteTools.test.ts
```

Expected: the three new tests fail with "constructor requires 0 arguments" or similar; the updated error message test fails with wrong message.

- [ ] **Step 3: Update `src/tools/rednoteTools.ts`**

Replace lines 25–41 (class declaration through end of `constructor`):

```typescript
export class RedNoteTools {
  private authManager: AuthManager
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private readonly config: { headless: boolean }

  constructor(config: { headless?: boolean } = {}) {
    this.config = { headless: config.headless ?? false }
    logger.info('Initializing RedNoteTools')
    this.authManager = new AuthManager()
  }
```

Replace lines 36–41 in `initialize()` — the browser launch and null-check:

```typescript
  async initialize(): Promise<void> {
    logger.info('Initializing browser and page')
    this.browser = await BrowserFactory.launch(this.config.headless)
    if (!this.browser) {
      throw new Error('Failed to initialize browser')
    }
```

Replace the error message on line 65:

```typescript
        throw new Error('Not logged in. Please run: rednote-mcp init')
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npx jest src/tools/__tests__/rednoteTools.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/rednoteTools.ts src/tools/__tests__/rednoteTools.test.ts
git commit -m "feat: add headless config to RedNoteTools, launch browser directly"
```

---

### Task 2: Remove `getBrowser()` from `AuthManager` and its tests

**Files:**
- Modify: `src/auth/authManager.ts`
- Modify: `src/auth/__tests__/authManager.test.ts`

- [ ] **Step 1: Remove `getBrowser` test block from `authManager.test.ts`**

Delete lines 67–75 (the entire `describe('getBrowser', ...)` block):

```typescript
  // DELETE this entire block:
  describe('getBrowser', () => {
    it('launches browser via BrowserFactory and returns it', async () => {
      const auth = new AuthManager(COOKIE_PATH)
      const browser = await auth.getBrowser()

      const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
      expect(BrowserFactory.launch).toHaveBeenCalledWith()
      expect(browser).toBe(mockBrowser)
    })
  })
```

- [ ] **Step 2: Run auth tests — confirm they still pass**

```bash
npx jest src/auth/__tests__/authManager.test.ts
```

Expected: all remaining tests pass (getBrowser test is gone, nothing else changed).

- [ ] **Step 3: Remove `getBrowser()` from `src/auth/authManager.ts`**

Delete lines 47–51:

```typescript
  // DELETE this entire method:
  async getBrowser(): Promise<Browser> {
    logger.info('Launching browser')
    this.browser = await BrowserFactory.launch()
    return this.browser
  }
```

- [ ] **Step 4: Run type check and all tests**

```bash
npx tsc --noEmit && npx jest
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/authManager.ts src/auth/__tests__/authManager.test.ts
git commit -m "refactor: remove AuthManager.getBrowser() — RedNoteTools now launches browser directly"
```

---

### Task 3: Update `cli.ts` — move tool registrations into `main(headless)`

**Files:**
- Modify: `src/cli.ts`

The current `cli.ts` creates `server` and calls `server.registerTool(...)` at module scope (lines 21–147), then `main()` only connects the transport. The registrations must move inside `main()` so they can close over `headless`.

- [ ] **Step 1: Rewrite `src/cli.ts` — replace lines 21–171**

Replace everything from `// Create server instance` through the end of the `if (process.argv.includes('--stdio'))` block with:

```typescript
// Start the server
async function main(headless = false) {
  logger.info('Starting RedNote MCP Server')

  // Create server instance
  const server = new McpServer({ name, version })

  // Register tools
  server.registerTool(
    'search_notes',
    {
      title: 'Search Notes',
      description: '根据关键词搜索笔记',
      inputSchema: z.object({
        keywords: z.string().describe('搜索关键词'),
        limit: z.number().optional().describe('返回结果数量限制')
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ keywords, limit = 10 }) => {
      logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
      try {
        const tools = new RedNoteTools({ headless })
        const notes = await tools.searchNotes(keywords, limit)
        logger.info(`Found ${notes.length} notes`)
        return {
          content: notes.map((note) => ({
            type: 'text' as const,
            text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`
          }))
        }
      } catch (error) {
        logger.error('Error searching notes:', error)
        throw error
      }
    }
  )

  server.registerTool(
    'get_note_content',
    {
      title: 'Get Note Content',
      description: '获取笔记内容',
      inputSchema: z.object({
        url: z.string().describe('笔记 URL')
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ url }) => {
      logger.info(`Getting note content for URL: ${url}`)
      try {
        const tools = new RedNoteTools({ headless })
        const note = await tools.getNoteContent(url)
        logger.info(`Successfully retrieved note: ${note.title}`)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note) }]
        }
      } catch (error) {
        logger.error('Error getting note content:', error)
        throw error
      }
    }
  )

  server.registerTool(
    'get_note_comments',
    {
      title: 'Get Note Comments',
      description: '获取笔记评论',
      inputSchema: z.object({
        url: z.string().describe('笔记 URL')
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ url }) => {
      logger.info(`Getting comments for URL: ${url}`)
      try {
        const tools = new RedNoteTools({ headless })
        const comments = await tools.getNoteComments(url)
        logger.info(`Found ${comments.length} comments`)
        return {
          content: comments.map((comment) => ({
            type: 'text' as const,
            text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
          }))
        }
      } catch (error) {
        logger.error('Error getting note comments:', error)
        throw error
      }
    }
  )

  server.registerTool(
    'login',
    {
      title: 'Login',
      description: '登录小红书账号',
      annotations: { openWorldHint: true }
    },
    async () => {
      logger.info('Starting login process')
      const authManager = new AuthManager()
      try {
        await authManager.login()
        logger.info('Login successful')
        return {
          content: [{ type: 'text' as const, text: '登录成功！Cookie 已保存。' }]
        }
      } catch (error) {
        logger.error('Login failed:', error)
        throw error
      } finally {
        await authManager.cleanup()
      }
    }
  )

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('RedNote MCP Server running on stdio')

  process.on('exit', () => {
    stopLogging()
  })
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  const headless = process.argv.includes('--headless')
  main(headless).catch((error) => {
    logger.error('Fatal error in main():', error)
    process.exit(1)
  })
} else {
```

The rest of the file (Commander setup, `init`, `pack-logs`, `open-logs` commands) is unchanged.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest
```

Expected: all 40 tests pass (cli.ts is not directly unit-tested).

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add --headless flag to MCP server stdio mode"
```

---

### Task 4: Update README

**Files:**
- Modify: `README.md`
- Modify: `docs/README.en.md`

- [ ] **Step 1: Add `--headless` to the MCP client config section in `README.md`**

In the "配置 MCP 客户端" section, add a headless example after the existing Claude Desktop config block:

```markdown
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
```

- [ ] **Step 2: Add the same note to `docs/README.en.md`**

In the "MCP Client Configuration" section, add after the Claude Desktop config block:

```markdown
> Add `--headless` to run the browser in the background (recommended once you have cookies):
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/README.en.md
git commit -m "docs: document --headless flag in README"
```
