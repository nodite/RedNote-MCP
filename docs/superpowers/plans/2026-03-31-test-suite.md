# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken integration test with a complete unit test suite that runs in CI without a real browser, covering all testable business logic via Jest mocks.

**Architecture:** A shared manual playwright mock at `__mocks__/playwright.ts` (project root) is loaded by all test files via `jest.mock('playwright')`. File system interactions use a per-file `jest.mock('fs', factory)`. One refactor is required: extract `ChineseUnitStrToNumber` from inside `page.evaluate` to a named module export so it can be unit-tested.

**Tech Stack:** Jest 30, ts-jest, TypeScript, fake timers (`jest.useFakeTimers` / `jest.runAllTimersAsync`)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `tsconfig.test.json` | TypeScript config for tests — extends base, sets `rootDir: "."` to include `__mocks__/` |
| Modify | `jest.config.js` | Point ts-jest at `tsconfig.test.json` |
| Create | `__mocks__/playwright.ts` | Shared manual mock for `playwright` node_module |
| Modify | `src/tools/noteDetail.ts` | Extract `ChineseUnitStrToNumber` to module-level export |
| Delete | `src/tools/__tests__/rednoteTools.test.ts` | Replace broken integration test |
| Create | `src/auth/__tests__/cookieManager.test.ts` | CookieManager unit tests |
| Create | `src/auth/__tests__/authManager.test.ts` | AuthManager unit tests |
| Create | `src/utils/__tests__/stdioLogger.test.ts` | createStdioLogger unit tests |
| Create | `src/tools/__tests__/extractUrl.test.ts` | extractRedBookUrl unit tests |
| Create | `src/tools/__tests__/chineseUnit.test.ts` | chineseUnitStrToNumber unit tests |
| Create | `src/tools/__tests__/rednoteTools.test.ts` | RedNoteTools unit tests |
| Create | `src/tools/__tests__/getNoteDetail.test.ts` | GetNoteDetail unit tests |

---

### Task 1: Configure TypeScript for tests

**Files:**
- Create: `tsconfig.test.json`
- Modify: `jest.config.js`

`tsconfig.json` sets `rootDir: "./src"` and excludes `__tests__/` directories. ts-jest would fail to compile `__mocks__/playwright.ts` (outside `src/`) with `TS6059: File is not under rootDir`. We create a separate tsconfig for tests that relaxes `rootDir`.

- [ ] **Step 1: Create `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*", "__mocks__/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Update `jest.config.js` to use `tsconfig.test.json`**

Replace the entire file with:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
```

- [ ] **Step 3: Verify `tsc` still compiles the production build cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors (uses the unchanged `tsconfig.json`).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.test.json jest.config.js
git commit -m "test: add tsconfig.test.json and configure ts-jest to use it"
```

---

### Task 2: Create shared playwright mock

**Files:**
- Create: `__mocks__/playwright.ts`

Jest looks for `<rootDir>/__mocks__/<package>.ts` to mock `node_modules` packages. This file is loaded whenever a test calls `jest.mock('playwright')`.

**Important:** Test files must NOT `import { mockPage, ... } from 'playwright'` — TypeScript would error because the real `playwright` package types don't export these names. Instead, each test file that needs these mock references must call `jest.requireMock('playwright')` at runtime.

- [ ] **Step 1: Create `__mocks__/playwright.ts`**

```typescript
const mockPage = {
  goto: jest.fn().mockResolvedValue(undefined),
  waitForSelector: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn(),
  $: jest.fn().mockResolvedValue(null),
  $$: jest.fn().mockResolvedValue([]),
  $eval: jest.fn(),
  fill: jest.fn().mockResolvedValue(undefined),
  click: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  context: jest.fn().mockReturnValue({
    addCookies: jest.fn().mockResolvedValue(undefined),
  }),
}

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  addCookies: jest.fn().mockResolvedValue(undefined),
  cookies: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
}

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
}

export const chromium = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
}

export { mockPage, mockContext, mockBrowser }
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --project tsconfig.test.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add __mocks__/playwright.ts
git commit -m "test: add shared playwright manual mock"
```

---

### Task 3: Refactor noteDetail.ts — extract ChineseUnitStrToNumber

**Files:**
- Modify: `src/tools/noteDetail.ts`

The function is currently defined inside the `getContent` closure that is serialized for `page.evaluate` (browser sandbox). It needs to be a named module export so tests can call it directly. The browser-side copy inside `getContent` must remain because `page.evaluate` runs in an isolated sandbox with no access to module scope.

- [ ] **Step 1: Modify `src/tools/noteDetail.ts`**

Replace the entire file with:

```typescript
import { Note } from './rednoteTools'
import logger from '../utils/logger'
import { Page } from 'playwright'

export interface NoteDetail {
  title: string
  content: string
  tags: string[]
  imgs?: string[]
  videos?: string[]
  url: string
  author: string
  likes?: number
  collects?: number
  comments?: number
}

// Module-level export so unit tests can call this directly.
// IMPORTANT: keep in sync with the identical copy inside getContent below.
export function chineseUnitStrToNumber(str: string): number {
  if (str.includes('万')) {
    return Number(str.replace('万', '').trim()) * 10000
  }
  return Number(str)
}

export async function GetNoteDetail(page: Page): Promise<NoteDetail> {
  // Wait for content to load
  logger.info('Waiting for content to load')
  await page.waitForSelector('.note-container')
  await page.waitForSelector('.media-container')

  async function getContent() {
    // Browser-side copy — page.evaluate runs in a sandbox with no module scope.
    // IMPORTANT: keep in sync with the module-level chineseUnitStrToNumber above.
    function ChineseUnitStrToNumber(str: string) {
      if (str.includes('万')) {
        return Number(str.replace('万', '').trim()) * 10000
      } else {
        return Number(str)
      }
    }
    // Get main article content
    const article = document.querySelector('.note-container')
    if (!article) throw new Error('Article not found')

    // Get title from h1 or first text block
    const title =
      article.querySelector('#detail-title')?.textContent?.trim() ||
      article.querySelector('.title')?.textContent?.trim() ||
      ''

    // Get content from article text
    const contentBlock = article.querySelector('.note-scroller')
    if (!contentBlock) throw new Error('Content block not found')
    const content = contentBlock.querySelector('.note-content .note-text span')?.textContent?.trim() || ''
    // Get tags from article text
    const tags = Array.from(contentBlock?.querySelectorAll('.note-content .note-text a')).map((tag) => {
      return tag.textContent?.trim().replace('#', '') || ''
    })

    // Get author info
    const authorElement = article.querySelector('.author-container .info')
    const author = authorElement?.querySelector('.username')?.textContent?.trim() || ''

    const interactContainer = document.querySelector('.interact-container')
    const commentsNumber = interactContainer?.querySelector('.chat-wrapper .count')?.textContent?.trim() || ''
    const likesNumber = interactContainer?.querySelector('.like-wrapper .count')?.textContent?.trim() || ''

    const imgs = Array.from(document.querySelectorAll('.media-container img')).map((img) => {
      return img.getAttribute('src') || ''
    })

    const videos = Array.from(document.querySelectorAll('.media-container video')).map((video) => {
      return video.getAttribute('src') || ''
    })

    return {
      title,
      content,
      tags,
      author,
      imgs,
      videos,
      url: '',
      likes: ChineseUnitStrToNumber(likesNumber),
      comments: ChineseUnitStrToNumber(commentsNumber)
    } as Note
  }

  return await page.evaluate(getContent)
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/noteDetail.ts
git commit -m "refactor: extract chineseUnitStrToNumber as named export for testability"
```

---

### Task 4: Tests for extractRedBookUrl (pure function)

**Files:**
- Create: `src/tools/__tests__/extractUrl.test.ts`
- Delete: `src/tools/__tests__/rednoteTools.test.ts` (broken integration test)

`extractRedBookUrl` is an instance method on `RedNoteTools` but has no dependencies — just regex matching. We instantiate `RedNoteTools` with mocks in place so the constructor doesn't call playwright.

- [ ] **Step 1: Delete the old broken test**

```bash
rm src/tools/__tests__/rednoteTools.test.ts
```

- [ ] **Step 2: Create `src/tools/__tests__/extractUrl.test.ts`**

```typescript
import { RedNoteTools } from '../rednoteTools'

jest.mock('playwright')
jest.mock('../../auth/authManager')
jest.mock('../../utils/logger')

describe('RedNoteTools.extractRedBookUrl', () => {
  let tools: RedNoteTools

  beforeEach(() => {
    tools = new RedNoteTools()
  })

  it('extracts xhslink URL embedded in share text', () => {
    const input = '60 坚定 👆去小红书看看吧！http://xhslink.com/a/abc123 复制本条信息'
    expect(tools.extractRedBookUrl(input)).toBe('http://xhslink.com/a/abc123')
  })

  it('returns bare xhslink URL unchanged', () => {
    expect(tools.extractRedBookUrl('http://xhslink.com/xyz')).toBe('http://xhslink.com/xyz')
  })

  it('extracts xiaohongshu.com URL', () => {
    expect(tools.extractRedBookUrl('https://www.xiaohongshu.com/explore/abc123')).toBe(
      'https://www.xiaohongshu.com/explore/abc123'
    )
  })

  it('stops xiaohongshu URL at Chinese comma', () => {
    expect(tools.extractRedBookUrl('https://www.xiaohongshu.com/abc，其他内容')).toBe(
      'https://www.xiaohongshu.com/abc'
    )
  })

  it('returns plain text unchanged when no URL present', () => {
    expect(tools.extractRedBookUrl('这是一段普通文字')).toBe('这是一段普通文字')
  })

  it('returns empty string unchanged', () => {
    expect(tools.extractRedBookUrl('')).toBe('')
  })

  it('prefers xhslink over xiaohongshu when both present', () => {
    expect(
      tools.extractRedBookUrl('http://xhslink.com/a/1 https://www.xiaohongshu.com/b')
    ).toBe('http://xhslink.com/a/1')
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
npx jest src/tools/__tests__/extractUrl.test.ts --no-coverage
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tools/__tests__/extractUrl.test.ts
git commit -m "test: add unit tests for extractRedBookUrl"
```

---

### Task 5: Tests for chineseUnitStrToNumber (pure function)

**Files:**
- Create: `src/tools/__tests__/chineseUnit.test.ts`

- [ ] **Step 1: Create `src/tools/__tests__/chineseUnit.test.ts`**

```typescript
import { chineseUnitStrToNumber } from '../noteDetail'

jest.mock('../../utils/logger')

describe('chineseUnitStrToNumber', () => {
  it('converts 万 integer', () => {
    expect(chineseUnitStrToNumber('1万')).toBe(10000)
  })

  it('converts 万 decimal', () => {
    expect(chineseUnitStrToNumber('1.2万')).toBe(12000)
  })

  it('converts 万 with space before unit', () => {
    expect(chineseUnitStrToNumber('1.5 万')).toBe(15000)
  })

  it('converts plain number string', () => {
    expect(chineseUnitStrToNumber('123')).toBe(123)
  })

  it('converts zero', () => {
    expect(chineseUnitStrToNumber('0')).toBe(0)
  })

  it('converts empty string to 0', () => {
    expect(chineseUnitStrToNumber('')).toBe(0)
  })

  it('converts large 万 number', () => {
    expect(chineseUnitStrToNumber('100万')).toBe(1000000)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/tools/__tests__/chineseUnit.test.ts --no-coverage
```

Expected: 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/__tests__/chineseUnit.test.ts
git commit -m "test: add unit tests for chineseUnitStrToNumber"
```

---

### Task 6: Tests for CookieManager

**Files:**
- Create: `src/auth/__tests__/cookieManager.test.ts`

`CookieManager` uses `import fs from 'fs'` (default import). The `jest.mock('fs', factory)` must expose both `default` and top-level properties to satisfy both default and namespace imports across the codebase.

- [ ] **Step 1: Create `src/auth/__tests__/cookieManager.test.ts`**

```typescript
import { CookieManager } from '../cookieManager'
import type { Cookie } from 'playwright'

jest.mock('../../utils/logger')

jest.mock('fs', () => {
  const fsMock = {
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    promises: {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn(),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  }
  return { ...fsMock, default: fsMock }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs')

const COOKIE_PATH = '/tmp/test-cookies.json'
const COOKIE_DIR = '/tmp'

const sampleCookies: Cookie[] = [
  {
    name: 'session',
    value: 'abc123',
    domain: '.xiaohongshu.com',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  },
]

describe('CookieManager', () => {
  let manager: CookieManager

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new CookieManager(COOKIE_PATH)
  })

  describe('saveCookies', () => {
    it('writes file when directory exists', async () => {
      fs.existsSync.mockReturnValue(true)

      await manager.saveCookies(sampleCookies)

      expect(fs.mkdirSync).not.toHaveBeenCalled()
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        COOKIE_PATH,
        JSON.stringify(sampleCookies, null, 2)
      )
    })

    it('creates directory then writes file when directory does not exist', async () => {
      fs.existsSync.mockReturnValue(false)

      await manager.saveCookies(sampleCookies)

      expect(fs.mkdirSync).toHaveBeenCalledWith(COOKIE_DIR, { recursive: true })
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        COOKIE_PATH,
        JSON.stringify(sampleCookies, null, 2)
      )
    })
  })

  describe('loadCookies', () => {
    it('returns empty array when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false)

      const result = await manager.loadCookies()

      expect(result).toEqual([])
      expect(fs.promises.readFile).not.toHaveBeenCalled()
    })

    it('reads and parses cookies when file exists', async () => {
      fs.existsSync.mockReturnValue(true)
      fs.promises.readFile.mockResolvedValue(JSON.stringify(sampleCookies))

      const result = await manager.loadCookies()

      expect(fs.promises.readFile).toHaveBeenCalledWith(COOKIE_PATH, 'utf-8')
      expect(result).toEqual(sampleCookies)
    })
  })

  describe('clearCookies', () => {
    it('deletes file when it exists', async () => {
      fs.existsSync.mockReturnValue(true)

      await manager.clearCookies()

      expect(fs.promises.unlink).toHaveBeenCalledWith(COOKIE_PATH)
    })

    it('does nothing when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false)

      await manager.clearCookies()

      expect(fs.promises.unlink).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/auth/__tests__/cookieManager.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/__tests__/cookieManager.test.ts
git commit -m "test: add unit tests for CookieManager"
```

---

### Task 7: Tests for createStdioLogger

**Files:**
- Create: `src/utils/__tests__/stdioLogger.test.ts`

`createStdioLogger` monkey-patches `process.stdout.write` and `process.stderr.write`. We verify the references change and that calling the returned cleanup function restores them.

- [ ] **Step 1: Create `src/utils/__tests__/stdioLogger.test.ts`**

```typescript
import { createStdioLogger } from '../stdioLogger'

jest.mock('../logger')

describe('createStdioLogger', () => {
  let cleanup: () => void

  afterEach(() => {
    // Always restore even if test throws
    if (cleanup) cleanup()
  })

  it('replaces process.stdout.write after calling createStdioLogger', () => {
    const writeBefore = process.stdout.write
    cleanup = createStdioLogger('/tmp/test.log')
    expect(process.stdout.write).not.toBe(writeBefore)
  })

  it('replaces process.stderr.write after calling createStdioLogger', () => {
    const writeBefore = process.stderr.write
    cleanup = createStdioLogger('/tmp/test.log')
    expect(process.stderr.write).not.toBe(writeBefore)
  })

  it('restores process.stdout.write when cleanup is called', () => {
    const writeBefore = process.stdout.write
    cleanup = createStdioLogger('/tmp/test.log')
    cleanup()
    expect(process.stdout.write).toBe(writeBefore)
  })

  it('restores process.stderr.write when cleanup is called', () => {
    const writeBefore = process.stderr.write
    cleanup = createStdioLogger('/tmp/test.log')
    cleanup()
    expect(process.stderr.write).toBe(writeBefore)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/utils/__tests__/stdioLogger.test.ts --no-coverage
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/stdioLogger.test.ts
git commit -m "test: add unit tests for createStdioLogger"
```

---

### Task 8: Tests for AuthManager

**Files:**
- Create: `src/auth/__tests__/authManager.test.ts`

Key constraints:
- Pass an explicit `cookiePath` to every `new AuthManager(...)` call — the constructor reads the filesystem to create `~/.mcp/rednote/` when no path is given.
- Mock `CookieManager` via `jest.mock('../cookieManager')` to control `loadCookies` / `saveCookies` return values.
- The `login()` retry loop delays 2 s between retries — use `jest.useFakeTimers()` + `jest.runAllTimersAsync()` to skip the delay.
- To test `cleanup()`, first call `login()` so `this.page` and `this.context` are set.

- [ ] **Step 1: Create `src/auth/__tests__/authManager.test.ts`**

```typescript
import { AuthManager } from '../authManager'
import type { Cookie } from 'playwright'

jest.mock('playwright')
jest.mock('../cookieManager')
jest.mock('../../utils/logger')

// jest.requireMock at runtime: real playwright types don't export mockPage/mockContext/mockBrowser
const { mockPage, mockContext, mockBrowser } = jest.requireMock('playwright')

jest.mock('fs', () => {
  const fsMock = {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    promises: {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn(),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  }
  return { ...fsMock, default: fsMock }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CookieManager } = require('../cookieManager')

const COOKIE_PATH = '/tmp/test-cookies.json'
const sampleCookies: Cookie[] = [
  {
    name: 'session',
    value: 'abc',
    domain: '.xiaohongshu.com',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  },
]

describe('AuthManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    CookieManager.mockImplementation(() => ({
      loadCookies: jest.fn().mockResolvedValue([]),
      saveCookies: jest.fn().mockResolvedValue(undefined),
      clearCookies: jest.fn().mockResolvedValue(undefined),
    }))
  })

  describe('getBrowser', () => {
    it('launches chromium in non-headless mode and returns browser', async () => {
      const auth = new AuthManager(COOKIE_PATH)
      const browser = await auth.getBrowser()

      const { chromium } = jest.requireMock('playwright')
      expect(chromium.launch).toHaveBeenCalledWith({ headless: false })
      expect(browser).toBe(mockBrowser)
    })
  })

  describe('getCookies', () => {
    it('returns cookies from CookieManager.loadCookies', async () => {
      const mockLoad = jest.fn().mockResolvedValue(sampleCookies)
      CookieManager.mockImplementation(() => ({ loadCookies: mockLoad }))

      const auth = new AuthManager(COOKIE_PATH)
      const result = await auth.getCookies()

      expect(mockLoad).toHaveBeenCalled()
      expect(result).toEqual(sampleCookies)
    })
  })

  describe('login', () => {
    it('completes without error when cookies exist and evaluate returns logged-in', async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined)
      CookieManager.mockImplementation(() => ({
        loadCookies: jest.fn().mockResolvedValue(sampleCookies),
        saveCookies: mockSave,
      }))

      mockPage.$.mockResolvedValue({ textContent: '我' })
      mockPage.evaluate.mockResolvedValue(true)
      mockContext.cookies.mockResolvedValue(sampleCookies)

      const auth = new AuthManager(COOKIE_PATH)
      await auth.login()

      expect(mockContext.addCookies).toHaveBeenCalledWith(sampleCookies)
      expect(mockContext.cookies).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })

    it('completes without error when no cookies, waitForSelector resolves, and evaluate returns logged-in', async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined)
      CookieManager.mockImplementation(() => ({
        loadCookies: jest.fn().mockResolvedValue([]),
        saveCookies: mockSave,
      }))

      mockPage.$.mockResolvedValue(null)
      mockPage.waitForSelector.mockResolvedValue(undefined)
      mockPage.evaluate.mockResolvedValue(true)
      mockContext.cookies.mockResolvedValue(sampleCookies)

      const auth = new AuthManager(COOKIE_PATH)
      await auth.login()

      expect(mockSave).toHaveBeenCalled()
    })

    it('throws "Login failed after maximum retries" when all 3 retries fail', async () => {
      CookieManager.mockImplementation(() => ({
        loadCookies: jest.fn().mockResolvedValue([]),
        saveCookies: jest.fn(),
      }))

      mockPage.$.mockResolvedValue(null)
      mockPage.waitForSelector.mockResolvedValue(undefined)
      mockPage.evaluate.mockResolvedValue(false)

      jest.useFakeTimers()
      try {
        const auth = new AuthManager(COOKIE_PATH)
        const loginPromise = auth.login()
        await jest.runAllTimersAsync()
        await expect(loginPromise).rejects.toThrow('Login failed after maximum retries')
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('cleanup', () => {
    it('calls page.close and context.close after login', async () => {
      CookieManager.mockImplementation(() => ({
        loadCookies: jest.fn().mockResolvedValue(sampleCookies),
        saveCookies: jest.fn().mockResolvedValue(undefined),
      }))

      mockPage.$.mockResolvedValue({ textContent: '我' })
      mockPage.evaluate.mockResolvedValue(true)
      mockContext.cookies.mockResolvedValue(sampleCookies)

      const auth = new AuthManager(COOKIE_PATH)
      await auth.login()

      jest.clearAllMocks()
      await auth.cleanup()

      expect(mockPage.close).toHaveBeenCalledTimes(1)
      expect(mockContext.close).toHaveBeenCalledTimes(1)
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/auth/__tests__/authManager.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/__tests__/authManager.test.ts
git commit -m "test: add unit tests for AuthManager"
```

---

### Task 9: Tests for RedNoteTools

**Files:**
- Create: `src/tools/__tests__/rednoteTools.test.ts`

Key constraints:
- `jest.mock('../../auth/authManager')` factory uses `jest.requireMock('playwright')` to get `mockBrowser` (hoisting prevents direct variable reference).
- `jest.mock('../noteDetail')` is placed at the top level so it intercepts `GetNoteDetail` calls inside `getNoteContent`.
- `searchNotes` calls `randomDelay` (setTimeout) — use fake timers. Pattern: start the promise, run timers, then await.
- `initialize()` calls `page.evaluate()` to check login status; set `mockPage.evaluate.mockResolvedValue(true)` in tests that need `initialize()` to succeed.

- [ ] **Step 1: Create `src/tools/__tests__/rednoteTools.test.ts`**

```typescript
import { RedNoteTools } from '../rednoteTools'

jest.mock('playwright')
jest.mock('../../utils/logger')

// jest.requireMock at runtime: real playwright types don't export mockPage/mockBrowser
const { mockPage, mockBrowser } = jest.requireMock('playwright')

jest.mock('../../auth/authManager', () => {
  const { mockBrowser: mb } = jest.requireMock('playwright')
  return {
    AuthManager: jest.fn().mockImplementation(() => ({
      getBrowser: jest.fn().mockResolvedValue(mb),
      getCookies: jest.fn().mockResolvedValue([]),
    })),
  }
})

jest.mock('../noteDetail', () => ({
  GetNoteDetail: jest.fn().mockResolvedValue({
    title: '测试标题',
    content: '测试内容',
    tags: ['tag1'],
    author: '测试作者',
    imgs: [],
    videos: [],
    url: '',
    likes: 100,
    comments: 10,
  }),
}))

describe('RedNoteTools', () => {
  let tools: RedNoteTools

  beforeEach(() => {
    jest.clearAllMocks()
    tools = new RedNoteTools()
  })

  describe('initialize', () => {
    it('succeeds when page.evaluate returns true (logged in)', async () => {
      mockPage.evaluate.mockResolvedValue(true)
      await expect(tools.initialize()).resolves.toBeUndefined()
    })

    it('throws "Not logged in" when page.evaluate returns false', async () => {
      mockPage.evaluate.mockResolvedValue(false)
      await expect(tools.initialize()).rejects.toThrow('Not logged in')
    })
  })

  describe('searchNotes', () => {
    const mockNoteElement = {
      $eval: jest.fn().mockResolvedValue(undefined),
    }

    beforeEach(() => {
      jest.useFakeTimers()
      mockPage.evaluate.mockResolvedValue(true) // initialize() login check
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns notes array matching mock data', async () => {
      mockPage.$$.mockResolvedValue([mockNoteElement, mockNoteElement])
      mockPage.evaluate
        .mockResolvedValueOnce(true) // initialize login check
        .mockResolvedValue({
          title: '标题',
          content: '内容',
          url: 'https://example.com',
          author: '作者',
          likes: 100,
          collects: 50,
          comments: 20,
        })

      const resultPromise = tools.searchNotes('keyword')
      await jest.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ title: '标题', url: 'https://example.com', author: '作者' })
    })

    it('respects limit parameter', async () => {
      const fiveElements = Array.from({ length: 5 }, () => ({ $eval: jest.fn().mockResolvedValue(undefined) }))
      mockPage.$$.mockResolvedValue(fiveElements)
      mockPage.evaluate
        .mockResolvedValueOnce(true) // initialize login check
        .mockResolvedValue({ title: 't', content: 'c', url: 'u', author: 'a', likes: 0, collects: 0, comments: 0 })

      const resultPromise = tools.searchNotes('kw', 2)
      await jest.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toHaveLength(2)
    })
  })

  describe('getNoteContent', () => {
    it('returns NoteDetail with url set to original input', async () => {
      mockPage.evaluate.mockResolvedValue(true)

      const url = 'https://www.xiaohongshu.com/explore/test123'
      const result = await tools.getNoteContent(url)

      expect(mockPage.goto).toHaveBeenCalledWith(url)
      expect(result.url).toBe(url)
    })
  })

  describe('cleanup', () => {
    it('calls page.close and browser.close after initialize', async () => {
      mockPage.evaluate.mockResolvedValue(true)
      await tools.initialize()

      jest.clearAllMocks()
      await tools.cleanup()

      expect(mockPage.close).toHaveBeenCalledTimes(1)
      expect(mockBrowser.close).toHaveBeenCalledTimes(1)
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/tools/__tests__/rednoteTools.test.ts --no-coverage
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/__tests__/rednoteTools.test.ts
git commit -m "test: add unit tests for RedNoteTools"
```

---

### Task 10: Tests for GetNoteDetail

**Files:**
- Create: `src/tools/__tests__/getNoteDetail.test.ts`

`GetNoteDetail` calls `page.waitForSelector` twice then `page.evaluate(getContent)`. Because `page.evaluate` is mocked, the browser-side function body never runs — we supply the return value directly.

- [ ] **Step 1: Create `src/tools/__tests__/getNoteDetail.test.ts`**

```typescript
import { GetNoteDetail } from '../noteDetail'

jest.mock('playwright')
jest.mock('../../utils/logger')

// jest.requireMock at runtime: real playwright types don't export mockPage
const { mockPage } = jest.requireMock('playwright')

const mockNoteData = {
  title: '测试标题',
  content: '测试内容',
  tags: ['tag1', 'tag2'],
  author: '测试作者',
  imgs: ['https://img1.jpg'],
  videos: [],
  url: '',
  likes: 10000,
  comments: 500,
}

describe('GetNoteDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPage.waitForSelector.mockResolvedValue(undefined)
    mockPage.evaluate.mockResolvedValue(mockNoteData)
  })

  it('waits for .note-container selector', async () => {
    await GetNoteDetail(mockPage as any)
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.note-container')
  })

  it('waits for .media-container selector', async () => {
    await GetNoteDetail(mockPage as any)
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.media-container')
  })

  it('returns object matching NoteDetail interface', async () => {
    const result = await GetNoteDetail(mockPage as any)
    expect(result).toMatchObject({
      title: '测试标题',
      content: '测试内容',
      tags: ['tag1', 'tag2'],
      author: '测试作者',
      imgs: ['https://img1.jpg'],
      videos: [],
      likes: 10000,
      comments: 500,
    })
  })

  it('returns url as empty string (caller sets url after)', async () => {
    const result = await GetNoteDetail(mockPage as any)
    expect(result.url).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx jest src/tools/__tests__/getNoteDetail.test.ts --no-coverage
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/__tests__/getNoteDetail.test.ts
git commit -m "test: add unit tests for GetNoteDetail"
```

---

### Task 11: Run full test suite

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass, no failures. Output similar to:

```
Test Suites: 7 passed, 7 total
Tests:       38 passed, 38 total
```

- [ ] **Step 2: Run with coverage**

```bash
npx jest --coverage
```

Expected: coverage report generated, key files covered:
- `src/tools/noteDetail.ts` — `chineseUnitStrToNumber` function covered
- `src/auth/cookieManager.ts` — `saveCookies`, `loadCookies`, `clearCookies` covered
- `src/tools/rednoteTools.ts` — `extractRedBookUrl`, `searchNotes`, `getNoteContent`, `cleanup` covered

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: complete unit test suite with full mock coverage"
```
