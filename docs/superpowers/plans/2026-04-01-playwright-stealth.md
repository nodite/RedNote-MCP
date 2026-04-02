# Playwright 分层防检测架构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `playwright` with `rebrowser-playwright` + stealth plugins + `ghost-cursor` to bypass bot detection on Xiaohongshu across four layers: CDP, JS fingerprint, mouse behavior, and browser config.

**Architecture:** A new `src/browser/` module centralizes all browser creation. `BrowserFactory` wraps `rebrowser-playwright`'s chromium with `playwright-extra` + stealth plugin and applies all launch args and context params. `HumanMouse` adapts `ghost-cursor` for Playwright pages. All existing source files update their `playwright` imports to `rebrowser-playwright`. Tests rename their mock file and update `jest.mock('playwright')` calls.

**Tech Stack:** rebrowser-playwright ^1.52.0, playwright-extra ^4.3.6, puppeteer-extra-plugin-stealth ^2.11.2, ghost-cursor ^1.4.2, TypeScript, Jest 30

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/browser/browserFactory.ts` | All `chromium.launch()` calls — stealth config, launch args, context params |
| Create | `src/browser/humanMouse.ts` | `ghost-cursor` adapter for Playwright pages |
| Modify | `src/auth/authManager.ts` | Replace `chromium.launch()` with `BrowserFactory.launch()`; update imports |
| Modify | `src/tools/rednoteTools.ts` | Replace click calls with `HumanMouse`; update imports |
| Modify | `src/tools/noteDetail.ts` | Update `playwright` import to `rebrowser-playwright` |
| Rename | `__mocks__/playwright.ts` → `__mocks__/rebrowser-playwright.ts` | Mock file for new package name |
| Modify | `src/auth/__tests__/authManager.test.ts` | Update mock paths |
| Modify | `src/tools/__tests__/rednoteTools.test.ts` | Update mock paths |
| Modify | `src/tools/__tests__/getNoteDetail.test.ts` | Update mock paths |
| Modify | `src/tools/__tests__/extractUrl.test.ts` | Update mock path |
| Modify | `package.json` | Replace `playwright` with new deps |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove `playwright` and install new packages**

```bash
cd /Users/kang/Projects/RedNote-MCP
npm uninstall playwright
npm install rebrowser-playwright@^1.52.0 playwright-extra@^4.3.6 puppeteer-extra-plugin-stealth@^2.11.2 ghost-cursor@^1.4.2
```

Expected: `package.json` now has `rebrowser-playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `ghost-cursor` in `dependencies`. No `playwright` entry remains. Peer-dependency warnings from `playwright-extra` / `puppeteer-extra-plugin-stealth` about the playwright version are expected and safe to ignore.

- [ ] **Step 2: Verify TypeScript compilation still works (will fail — expected at this step)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about `Cannot find module 'playwright'` in source files. This is expected — we haven't updated imports yet. Verify the error is specifically about missing `playwright` module, not unrelated issues.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace playwright with rebrowser-playwright and stealth deps"
```

---

### Task 2: Create BrowserFactory

**Files:**
- Create: `src/browser/browserFactory.ts`

- [ ] **Step 1: Create `src/browser/browserFactory.ts`**

```typescript
import { chromium as rebrowserChromium } from 'rebrowser-playwright'
import { addExtra } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext } from 'rebrowser-playwright'

// addExtra wraps rebrowser-playwright's chromium so stealth plugin runs on top of
// rebrowser's CDP patches — NOT on standard playwright
const chromium = addExtra(rebrowserChromium)
chromium.use(StealthPlugin())

const STEALTH_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--lang=zh-CN',
]

const STEALTH_CONTEXT_OPTIONS = {
  // Keep in sync with installed rebrowser-playwright Chromium version
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
}

export class BrowserFactory {
  static async launch(headless = false, options?: { timeout?: number }): Promise<Browser> {
    return chromium.launch({
      headless,
      args: STEALTH_LAUNCH_ARGS,
      ...(options?.timeout !== undefined && { timeout: options.timeout }),
    }) as Promise<Browser>
  }

  static async newStealthContext(browser: Browser): Promise<BrowserContext> {
    return browser.newContext(STEALTH_CONTEXT_OPTIONS)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles `browserFactory.ts`**

```bash
npx tsc --project tsconfig.test.json --noEmit 2>&1 | grep browserFactory
```

Expected: no errors for `src/browser/browserFactory.ts`. Other files will still error on missing `playwright` — that's fine at this step.

- [ ] **Step 3: Commit**

```bash
git add src/browser/browserFactory.ts
git commit -m "feat: add BrowserFactory with stealth launch configuration"
```

---

### Task 3: Create HumanMouse

**Files:**
- Create: `src/browser/humanMouse.ts`

- [ ] **Step 1: Create `src/browser/humanMouse.ts`**

```typescript
import { GhostCursor } from 'ghost-cursor'  // class export (createCursor is deprecated)
import type { Page } from 'rebrowser-playwright'

export class HumanMouse {
  private cursor: GhostCursor

  constructor(page: Page) {
    // GhostCursor expects a Puppeteer Page type, but Playwright's mouse API is structurally
    // compatible at runtime — the as any cast suppresses the type mismatch
    this.cursor = new GhostCursor(page as any)
  }

  async click(selector: string): Promise<void> {
    // Internally: page.$(selector) to locate element, then Bezier-curve mouse movement + click
    await this.cursor.click(selector)
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.cursor.moveTo({ x, y })
  }

  randomMove(): void {
    // toggleRandomMove is synchronous — enables continuous random drift during idle time
    this.cursor.toggleRandomMove(true)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles `humanMouse.ts`**

```bash
npx tsc --project tsconfig.test.json --noEmit 2>&1 | grep humanMouse
```

Expected: no errors for `src/browser/humanMouse.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/browser/humanMouse.ts
git commit -m "feat: add HumanMouse adapter wrapping ghost-cursor for Playwright"
```

---

### Task 4: Update `noteDetail.ts` import

**Files:**
- Modify: `src/tools/noteDetail.ts:3`

`noteDetail.ts` line 3 currently reads `import { Page } from 'playwright'`. This is the simplest change — one line.

- [ ] **Step 1: Update the import**

In `src/tools/noteDetail.ts`, change line 3 from:

```typescript
import { Page } from 'playwright'
```

to:

```typescript
import { Page } from 'rebrowser-playwright'
```

- [ ] **Step 2: Verify TypeScript compiles `noteDetail.ts`**

```bash
npx tsc --project tsconfig.test.json --noEmit 2>&1 | grep noteDetail
```

Expected: no errors for `src/tools/noteDetail.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/tools/noteDetail.ts
git commit -m "chore: update playwright import to rebrowser-playwright in noteDetail"
```

---

### Task 5: Update `authManager.ts`

**Files:**
- Modify: `src/auth/authManager.ts`

Current `authManager.ts` imports `chromium` from `playwright` and calls `chromium.launch()` in two places: `getBrowser()` (line 49) and `login()` (line 64). Both calls must be replaced with `BrowserFactory.launch()`.

The `login()` method accepts `options?: { timeout?: number }` and passes `timeout` to `chromium.launch()`. This must be forwarded to `BrowserFactory.launch(false, { timeout })`.

Additionally, `login()` calls `this.browser.newContext()` (line 79) — replace with `BrowserFactory.newStealthContext(this.browser)`.

- [ ] **Step 1: Replace the full content of `src/auth/authManager.ts`**

```typescript
import { Browser, BrowserContext, Cookie, Page } from 'rebrowser-playwright'
import { BrowserFactory } from '../browser/browserFactory'
import { CookieManager } from './cookieManager'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import logger from '../utils/logger'

dotenv.config()

export class AuthManager {
  private browser: Browser | null
  private context: BrowserContext | null
  private page: Page | null
  private cookieManager: CookieManager

  constructor(cookiePath?: string) {
    logger.info('Initializing AuthManager')
    this.browser = null
    this.context = null
    this.page = null

    // Set default cookie path to ~/.mcp/rednote/cookies.json
    if (!cookiePath) {
      const homeDir = os.homedir()
      const mcpDir = path.join(homeDir, '.mcp')
      const rednoteDir = path.join(mcpDir, 'rednote')

      // Create directories if they don't exist
      if (!fs.existsSync(mcpDir)) {
        logger.info(`Creating directory: ${mcpDir}`)
        fs.mkdirSync(mcpDir)
      }
      if (!fs.existsSync(rednoteDir)) {
        logger.info(`Creating directory: ${rednoteDir}`)
        fs.mkdirSync(rednoteDir)
      }

      cookiePath = path.join(rednoteDir, 'cookies.json')
    }

    logger.info(`Using cookie path: ${cookiePath}`)
    this.cookieManager = new CookieManager(cookiePath)
  }

  async getBrowser(): Promise<Browser> {
    logger.info('Launching browser')
    this.browser = await BrowserFactory.launch()
    return this.browser
  }

  async getCookies(): Promise<Cookie[]> {
    logger.info('Loading cookies')
    return await this.cookieManager.loadCookies()
  }

  async login(options?: {timeout?: number}): Promise<void> {
    const timeoutSeconds = options?.timeout || 10
    logger.info(`Starting login process with timeout: ${timeoutSeconds}s`)
    const timeoutMs = timeoutSeconds * 1000
    this.browser = await BrowserFactory.launch(false, { timeout: timeoutMs })
    if (!this.browser) {
      logger.error('Failed to launch browser')
      throw new Error('Failed to launch browser')
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        logger.info(`Login attempt ${retryCount + 1}/${maxRetries}`)
        this.context = await BrowserFactory.newStealthContext(this.browser)
        this.page = await this.context.newPage()

        // Load existing cookies if available
        const cookies = await this.cookieManager.loadCookies()
        if (cookies && cookies.length > 0) {
          logger.info(`Loaded ${cookies.length} existing cookies`)
          await this.context.addCookies(cookies)
        }

        // Navigate to explore page
        logger.info('Navigating to explore page')
        await this.page.goto('https://www.xiaohongshu.com/explore', {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs
        })

        // Check if already logged in
        const userSidebar = await this.page.$('.user.side-bar-component .channel')
        if (userSidebar) {
          const isLoggedIn = await this.page.evaluate(() => {
            const sidebarUser = document.querySelector('.user.side-bar-component .channel')
            return sidebarUser?.textContent?.trim() === '我'
          })

          if (isLoggedIn) {
            logger.info('Already logged in')
            // Already logged in, save cookies and return
            const newCookies = await this.context.cookies()
            await this.cookieManager.saveCookies(newCookies)
            return
          }
        }

        logger.info('Waiting for login dialog')
        // Wait for login dialog if not logged in
        await this.page.waitForSelector('.login-container', {
          timeout: timeoutMs
        })

        // Wait for QR code image
        logger.info('Waiting for QR code')
        await this.page.waitForSelector('.qrcode-img', {
          timeout: timeoutMs
        })

        // Wait for user to complete login
        logger.info('Waiting for user to complete login')
        await this.page.waitForSelector('.user.side-bar-component .channel', {
          timeout: timeoutMs * 6
        })

        // Verify the text content
        const isLoggedIn = await this.page.evaluate(() => {
          const sidebarUser = document.querySelector('.user.side-bar-component .channel')
          return sidebarUser?.textContent?.trim() === '我'
        })

        if (!isLoggedIn) {
          logger.error('Login verification failed')
          throw new Error('Login verification failed')
        }

        logger.info('Login successful, saving cookies')
        // Save cookies after successful login
        const newCookies = await this.context.cookies()
        await this.cookieManager.saveCookies(newCookies)
        return
      } catch (error) {
        logger.error(`Login attempt ${retryCount + 1} failed:`, error)
        // Clean up current session
        if (this.page) await this.page.close()
        if (this.context) await this.context.close()

        retryCount++
        if (retryCount < maxRetries) {
          logger.info(`Retrying login in 2 seconds (${retryCount}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
          logger.error('Login failed after maximum retries')
          throw new Error('Login failed after maximum retries')
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources')
    if (this.page) await this.page.close()
    if (this.context) await this.context.close()
    this.page = null
    this.context = null
    this.browser = null
  }
}
```

Note: the only changes vs. the original are:
1. Import line: `Browser, BrowserContext, Cookie, Page` from `rebrowser-playwright`; removed `chromium` import
2. Added `import { BrowserFactory } from '../browser/browserFactory'`
3. `getBrowser()`: `chromium.launch({ headless: false })` → `BrowserFactory.launch()`
4. `login()`: `chromium.launch({ headless: false, timeout: timeoutMs })` → `BrowserFactory.launch(false, { timeout: timeoutMs })`
5. `login()` retry loop: `this.browser.newContext()` → `BrowserFactory.newStealthContext(this.browser)`
6. Removed unused `qrCodeImage` variable (was `const qrCodeImage = await this.page.waitForSelector(...)` — the result was never used)

- [ ] **Step 2: Verify TypeScript compiles `authManager.ts`**

```bash
npx tsc --project tsconfig.test.json --noEmit 2>&1 | grep authManager
```

Expected: no errors for `src/auth/authManager.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/auth/authManager.ts
git commit -m "feat: replace chromium.launch with BrowserFactory in AuthManager"
```

---

### Task 6: Update `rednoteTools.ts`

**Files:**
- Modify: `src/tools/rednoteTools.ts`

Four changes:
1. Line 2: `import { Browser, Page } from 'playwright'` → `rebrowser-playwright`; also import `BrowserContext`
2. Line 36: `this.browser = await this.authManager.getBrowser()` — `getBrowser()` now uses `BrowserFactory`, no change needed here
3. Line 42: `this.browser.newPage()` → use `BrowserFactory.newStealthContext(this.browser)` to create the context, then `context.newPage()` — ensures stealth context options (UA, viewport, locale, timezone) apply to all RedNoteTools pages
4. Lines 138, 199, 212: Replace `$eval` click and `closeButton.click()` with `HumanMouse.click()`

The `searchNotes` method currently does:
```typescript
await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())
```
and (×2):
```typescript
const closeButton = await this.page.$('.close-circle')
if (closeButton) {
  await closeButton.click()
  await this.page.waitForSelector(...)
}
```

Both patterns are replaced. `HumanMouse.click('.close-circle')` throws if selector not found, which is caught by the existing per-note try/catch (same behavior as before when `closeButton` was null — the code just skipped).

- [ ] **Step 1: Update `src/tools/rednoteTools.ts`**

Change line 2:
```typescript
import { Browser, BrowserContext, Page } from 'rebrowser-playwright'
```

Add imports after line 4 (after `import { GetNoteDetail, NoteDetail } from './noteDetail'`):
```typescript
import { BrowserFactory } from '../browser/browserFactory'
import { HumanMouse } from '../browser/humanMouse'
```

Add `private context: BrowserContext | null = null` field to the `RedNoteTools` class (alongside `private browser` and `private page`):
```typescript
private browser: Browser | null = null
private context: BrowserContext | null = null
private page: Page | null = null
```

In `initialize()`, replace line 42 (`this.page = await this.browser.newPage()`) with:
```typescript
this.context = await BrowserFactory.newStealthContext(this.browser)
this.page = await this.context.newPage()
```

Also update the existing cookie load (line 48) — cookies are now added to `this.context` directly instead of `this.page.context()`:
```typescript
// Before:
await this.page.context().addCookies(cookies)
// After:
await this.context.addCookies(cookies)
```

Update `cleanup()` to also close `this.context` — insert between the page close and browser close blocks:
```typescript
async cleanup(): Promise<void> {
  logger.info('Cleaning up browser resources')
  try {
    if (this.page) {
      await this.page.close().catch(err => logger.error('Error closing page:', err))
      this.page = null
    }

    if (this.context) {
      await this.context.close().catch(err => logger.error('Error closing context:', err))
      this.context = null
    }

    if (this.browser) {
      await this.browser.close().catch(err => logger.error('Error closing browser:', err))
      this.browser = null
    }
  } catch (error) {
    logger.error('Error during cleanup:', error)
  } finally {
    this.page = null
    this.context = null
    this.browser = null
  }
}
```

**Important:** `mouse` must be declared before the `try` block so it is accessible in the `catch` block. The overall `for` loop structure for each note becomes:

```typescript
for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
  logger.info(`Processing note ${i + 1}/${Math.min(noteItems.length, limit)}`)
  const mouse = new HumanMouse(this.page)  // ← declare before try, reused in catch
  try {
    await mouse.click('a.cover.mask.ld')
    // Wait for the note page to load
    logger.info('Waiting for note page to load')
    await this.page.waitForSelector('#noteContainer', { timeout: 30000 })
    await this.randomDelay(0.5, 1.5)
    // ... extract note content via page.evaluate ...
    await this.randomDelay(0.5, 1)
    logger.info('Closing note dialog')
    await mouse.click('.close-circle')
    await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
  } catch (error) {
    logger.error(`Error processing note ${i + 1}:`, error)
    logger.info('Attempting to close note dialog after error')
    try {
      await mouse.click('.close-circle')
      await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
    } catch {
      // .close-circle not found; continue to next note
    }
  } finally {
    await this.randomDelay(0.5, 1.5)
  }
}
```

Specifically, replace these three existing calls:

1. `await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())` → `await mouse.click('a.cover.mask.ld')`

2. First close-button block (inside `try`, after `randomDelay(0.5, 1)`):
```typescript
// Remove:
const closeButton = await this.page.$('.close-circle')
if (closeButton) {
  logger.info('Closing note dialog')
  await closeButton.click()
  await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
}

// Replace with:
logger.info('Closing note dialog')
await mouse.click('.close-circle')
await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
```

3. Second close-button block (inside `catch`):
```typescript
// Remove:
const closeButton = await this.page.$('.close-circle')
if (closeButton) {
  logger.info('Attempting to close note dialog after error')
  await closeButton.click()
  await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
}

// Replace with — wrap in its own try/catch to preserve the original "skip if absent" behavior:
logger.info('Attempting to close note dialog after error')
try {
  await mouse.click('.close-circle')
  await this.page.waitForSelector('#noteContainer', { state: 'detached', timeout: 30000 })
} catch {
  // .close-circle not found; continue to next note
}
```

- [ ] **Step 2: Verify TypeScript compiles `rednoteTools.ts`**

```bash
npx tsc --project tsconfig.test.json --noEmit 2>&1 | grep rednoteTools
```

Expected: no errors for `src/tools/rednoteTools.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/tools/rednoteTools.ts
git commit -m "feat: replace playwright click calls with HumanMouse in RedNoteTools"
```

---

### Task 7: Full TypeScript check

**Files:** none (verification only)

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If there are errors, they will be in files not yet updated — diagnose and fix before proceeding.

- [ ] **Step 2: Commit if any fixes were needed**

If step 1 required fixes:
```bash
git add -A
git commit -m "fix: resolve remaining TypeScript errors after playwright migration"
```

If step 1 had zero errors, skip this step.

---

### Task 8: Rename mock file and update all test imports

**Files:**
- Rename: `__mocks__/playwright.ts` → `__mocks__/rebrowser-playwright.ts`
- Modify: `src/auth/__tests__/authManager.test.ts`
- Modify: `src/tools/__tests__/rednoteTools.test.ts`
- Modify: `src/tools/__tests__/getNoteDetail.test.ts`
- Modify: `src/tools/__tests__/extractUrl.test.ts`

The mock file content is identical — only the filename changes. All test files need `jest.mock('playwright')` → `jest.mock('rebrowser-playwright')` and `jest.requireMock('playwright')` → `jest.requireMock('rebrowser-playwright')`.

- [ ] **Step 1: Rename the mock file**

```bash
mv /Users/kang/Projects/RedNote-MCP/__mocks__/playwright.ts \
   /Users/kang/Projects/RedNote-MCP/__mocks__/rebrowser-playwright.ts
```

- [ ] **Step 2: Update `src/auth/__tests__/authManager.test.ts`**

Change line 2:
```typescript
import type { Cookie } from 'rebrowser-playwright'
```

Change line 4:
```typescript
jest.mock('rebrowser-playwright')
```

Change line 17:
```typescript
const { mockPage, mockContext, mockBrowser } = jest.requireMock('rebrowser-playwright')
```

Add a `BrowserFactory` mock after the existing `jest.mock('rebrowser-playwright')` call. `authManager.ts` no longer calls `chromium.launch()` directly — it calls `BrowserFactory.launch()`. Without this mock, `playwright-extra`'s `addExtra` wrapping runs against the mock chromium object and the test may fail or the `launch` call is untrackable:

```typescript
jest.mock('../../browser/browserFactory', () => ({
  BrowserFactory: {
    launch: jest.fn(),
    newStealthContext: jest.fn(),
  },
}))
```

In `beforeEach` (the existing `beforeEach` inside `describe('AuthManager', ...)`), add wiring after `jest.clearAllMocks()`:
```typescript
const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
BrowserFactory.launch.mockResolvedValue(mockBrowser)
BrowserFactory.newStealthContext.mockResolvedValue(mockContext)
mockContext.newPage.mockResolvedValue(mockPage)  // re-wire after clearAllMocks
```

Update the `getBrowser` test (lines 60–67) — `getBrowser()` now calls `BrowserFactory.launch()`, not `chromium.launch()` directly:
```typescript
describe('getBrowser', () => {
  it('launches browser and returns it', async () => {
    const auth = new AuthManager(COOKIE_PATH)
    const browser = await auth.getBrowser()

    const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
    expect(BrowserFactory.launch).toHaveBeenCalledWith()
    expect(browser).toBe(mockBrowser)
  })
})
```

Remove the old `const { chromium } = jest.requireMock('playwright')` and `expect(chromium.launch)` lines from this test entirely.

- [ ] **Step 3: Update `src/tools/__tests__/rednoteTools.test.ts`**

Change line 3:
```typescript
jest.mock('rebrowser-playwright')
```

Change line 7:
```typescript
const { mockPage, mockBrowser } = jest.requireMock('rebrowser-playwright')
```

Change line 10 (inside `authManager` factory):
```typescript
const { mockBrowser: mb } = jest.requireMock('rebrowser-playwright')
```

After the existing `jest.mock('../noteDetail', ...)` call (around line 19), add mocks for `BrowserFactory` and `HumanMouse`:

`BrowserFactory` must be mocked because `initialize()` now calls `BrowserFactory.newStealthContext(this.browser)` to obtain a context, then calls `context.newPage()` on it. The mock must return `mockContext`, and `mockContext.newPage` must return `mockPage` (already set up in the existing `rebrowser-playwright` mock):

```typescript
jest.mock('../../browser/browserFactory', () => ({
  BrowserFactory: {
    launch: jest.fn(),
    newStealthContext: jest.fn(),
  },
}))
```

Then in `beforeEach` (after `jest.clearAllMocks()`), wire the return values. `jest.clearAllMocks()` clears all `mockResolvedValue` setups — including the module-level `mockContext.newPage.mockResolvedValue(mockPage)` from the mock file. All three must be re-wired on each test:

```typescript
const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
BrowserFactory.newStealthContext.mockResolvedValue(mockContext)
BrowserFactory.launch.mockResolvedValue(mockBrowser)
mockContext.newPage.mockResolvedValue(mockPage)  // ← must re-wire after clearAllMocks
```

Add these three lines to the existing `beforeEach` in `describe('RedNoteTools', ...)`, after the existing `jest.clearAllMocks()` call.

Also update the `cleanup` test (lines 116–127) to add an assertion for `mockContext.close`, since `cleanup()` now closes the context:
```typescript
describe('cleanup', () => {
  it('calls page.close, context.close, and browser.close after initialize', async () => {
    mockPage.evaluate.mockResolvedValue(true)
    await tools.initialize()

    jest.clearAllMocks()
    // Re-wire after clearAllMocks so cleanup() can still call close without errors
    mockPage.close.mockResolvedValue(undefined)
    mockContext.close.mockResolvedValue(undefined)
    mockBrowser.close.mockResolvedValue(undefined)
    await tools.cleanup()

    expect(mockPage.close).toHaveBeenCalledTimes(1)
    expect(mockContext.close).toHaveBeenCalledTimes(1)
    expect(mockBrowser.close).toHaveBeenCalledTimes(1)
  })
})
```

Note: add `mockContext` to the `const { mockPage, mockBrowser } = jest.requireMock(...)` destructure at line 7:
```typescript
const { mockPage, mockBrowser, mockContext } = jest.requireMock('rebrowser-playwright')
```

Update the `searchNotes` tests to replace the dead `$eval` mock on `mockNoteElement` with an assertion on `HumanMouse.click`. After the existing `jest.mock('../../browser/humanMouse', ...)` call, capture the mock for assertions:
```typescript
const { HumanMouse: MockHumanMouse } = jest.requireMock('../../browser/humanMouse')
```

In the `searchNotes` `it('returns notes array matching mock data', ...)` test, replace the `mockNoteElement` setup and add an assertion:
```typescript
// Before: mockPage.$$.mockResolvedValue([mockNoteElement, mockNoteElement])
// After: mockPage.$$.mockResolvedValue([{}, {}])  — elements are no longer called with $eval
mockPage.$$.mockResolvedValue([{}, {}])
// ...existing assertions...
const mouseInstance = MockHumanMouse.mock.results[0].value
expect(mouseInstance.click).toHaveBeenCalledWith('a.cover.mask.ld')
```

The `respects limit parameter` test similarly replaces:
```typescript
const fiveElements = Array.from({ length: 5 }, () => ({}))
mockPage.$$.mockResolvedValue(fiveElements)
```

`HumanMouse` must be mocked because `searchNotes` now calls `new HumanMouse(this.page)` and `mouse.click()`, which would otherwise invoke real `ghost-cursor` against mock page objects and throw:

```typescript
jest.mock('../../browser/humanMouse', () => ({
  HumanMouse: jest.fn().mockImplementation(() => ({
    click: jest.fn().mockResolvedValue(undefined),
    moveTo: jest.fn().mockResolvedValue(undefined),
    randomMove: jest.fn(),
  })),
}))
```

- [ ] **Step 4: Update `src/tools/__tests__/getNoteDetail.test.ts`**

Change line 3:
```typescript
jest.mock('rebrowser-playwright')
```

Change line 7:
```typescript
const { mockPage } = jest.requireMock('rebrowser-playwright')
```

- [ ] **Step 5: Update `src/tools/__tests__/extractUrl.test.ts`**

Change line 3:
```typescript
jest.mock('rebrowser-playwright')
```

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all 7 test suites pass, 40 tests pass. If any tests fail:
- "Cannot find module '__mocks__/playwright'" → verify the rename was done correctly
- Other failures → check the specific error and fix the relevant mock path

- [ ] **Step 7: Commit**

```bash
git rm __mocks__/playwright.ts
git add __mocks__/rebrowser-playwright.ts \
        src/auth/__tests__/authManager.test.ts \
        src/tools/__tests__/rednoteTools.test.ts \
        src/tools/__tests__/getNoteDetail.test.ts \
        src/tools/__tests__/extractUrl.test.ts
git commit -m "test: rename playwright mock to rebrowser-playwright, update all jest.mock calls"
```

---

### Task 9: Update `tsconfig.test.json` mock include path

**Files:**
- Modify: `tsconfig.test.json`

`tsconfig.test.json` currently includes `__mocks__/**/*` — this is unchanged. But verify the rename didn't break TypeScript compilation of the mock file.

- [ ] **Step 1: Verify TypeScript compiles test config**

```bash
npx tsc --project tsconfig.test.json --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run full test suite one more time**

```bash
npm test
```

Expected: 7 suites, 40 tests, all pass.

- [ ] **Step 3: Commit (only if fixes were needed in step 1)**

If step 1 required fixes:
```bash
git add tsconfig.test.json
git commit -m "fix: update tsconfig.test.json for rebrowser-playwright mock"
```

If zero errors, skip commit.

---

### Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run full test suite with coverage**

```bash
npm test -- --coverage
```

Expected: 7 suites pass, 40 tests pass. Coverage for key files should be similar to or better than pre-migration:
- `src/auth/cookieManager.ts` — ~100%
- `src/auth/authManager.ts` — ~80%+
- `src/tools/rednoteTools.ts` — ~55%+

- [ ] **Step 3: Verify `package.json` has no `playwright` in dependencies**

```bash
node -e "const p = require('./package.json'); console.log('playwright' in p.dependencies, 'playwright' in (p.devDependencies||{}))"
```

Expected: `false false`

- [ ] **Step 4: Final commit if needed**

First run `git status` to verify only expected files are modified. Then:
```bash
git add -A
git commit -m "test: complete playwright stealth migration — all tests passing"
```
