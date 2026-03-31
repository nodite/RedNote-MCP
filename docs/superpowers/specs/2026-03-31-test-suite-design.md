# Test Suite Redesign

## 概述

为 `@nodite/rednote-mcp` 重写完整测试套件。项目核心依赖 Playwright 操控真实浏览器，测试策略以**单元测试为主（Mock Playwright）**，用 `jest.mock('playwright')` 隔离浏览器依赖，在 CI 环境可运行，覆盖业务逻辑和边界条件。

需要在实现前对 `noteDetail.ts` 进行一处小重构：将 `ChineseUnitStrToNumber` 函数从 `page.evaluate` 闭包内提取为模块级导出，使其可独立测试。

## 重构：提取 ChineseUnitStrToNumber

**文件：** `src/tools/noteDetail.ts`

当前 `ChineseUnitStrToNumber` 函数定义在 `getContent` 函数内部（传给 `page.evaluate`），浏览器沙箱中执行，无法在测试中直接调用。

**修改方案：** 将其提取到文件顶层并导出：

```typescript
// 提取为模块级导出
export function chineseUnitStrToNumber(str: string): number {
  if (str.includes('万')) {
    return Number(str.replace('万', '').trim()) * 10000
  }
  return Number(str)
}
```

同时在 `getContent` 函数（传给 `page.evaluate` 的函数）内部保留一份同名的局部定义（因为 `page.evaluate` 在浏览器沙箱中执行，无法访问模块作用域）。

**约束：** `getContent` 内的局部定义必须与模块级导出保持逻辑一致，任何修改需同步两处。

## 文件结构

```
__mocks__/
  playwright.ts              # 手动 mock playwright（node_modules mock 必须在项目根 __mocks__/）
src/
  auth/__tests__/
    cookieManager.test.ts    # CookieManager：fs mock 测试（与源文件同目录）
    authManager.test.ts      # AuthManager：mock playwright 测试
  utils/__tests__/
    stdioLogger.test.ts      # createStdioLogger：进程流替换测试
  tools/__tests__/
    extractUrl.test.ts       # extractRedBookUrl：纯函数测试
    chineseUnit.test.ts      # chineseUnitStrToNumber：纯函数测试（提取后）
    rednoteTools.test.ts     # RedNoteTools：mock playwright 测试
    getNoteDetail.test.ts    # GetNoteDetail：mock playwright 测试
```

删除现有的 `src/tools/__tests__/rednoteTools.test.ts`（替换为上述文件）。

**注意：** Jest 对 `node_modules` 包的手动 mock 规则：`__mocks__/` 目录必须是 `node_modules` 的同级目录（项目根），而非 `src/` 内部。`src/__mocks__/` 只适用于 mock 同目录下的本地模块，不适用于 `node_modules` 包。

## Mock 策略

### `src/__mocks__/playwright.ts`

Jest 自动注册 `__mocks__` 目录下的手动 mock。测试文件调用 `jest.mock('playwright')` 时加载此文件。

Mock 对象层级：

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

每个测试文件在 `beforeEach` 中调用 `jest.clearAllMocks()` 重置调用记录。

### `jest.mock('fs')` 策略

`CookieManager` 使用 `import fs from 'fs'`（默认导入），`AuthManager` 使用 `import * as fs from 'fs'`（命名空间导入）。`jest.mock('fs')` 必须提供同时兼容两种导入方式的工厂函数，并且**不能**依赖 Jest 自动 mock（自动 mock 不会处理 `fs.promises` 嵌套对象）。

每个使用 fs mock 的测试文件中，使用如下工厂：

```typescript
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
  return {
    ...fsMock,
    default: fsMock,
  }
})
```

**说明：**
- `...fsMock` 满足 `import * as fs from 'fs'`（命名空间导入，`fs.existsSync` 等）
- `default: fsMock` 满足 `import fs from 'fs'`（默认导入，`fs.existsSync` 等）

## 各模块测试规格

### 1. `src/tools/__tests__/extractUrl.test.ts`

测试 `RedNoteTools.prototype.extractRedBookUrl`（方法定义在 `rednoteTools.ts`）。

由于该方法是实例方法，创建一个 `RedNoteTools` 实例并直接调用（不需要 initialize，不调用 playwright）。需要 `jest.mock('playwright')` 和 `jest.mock('../../auth/authManager')` 防止构造函数副作用（测试文件在 `src/tools/__tests__/`，相对路径为 `../../auth/authManager`）。

测试用例：

| 测试描述 | 输入 | 期望输出 |
|---------|------|---------|
| xhslink URL 嵌入分享文本 | `"60 坚定 👆去小红书看看吧！http://xhslink.com/a/abc123 复制本条信息"` | `"http://xhslink.com/a/abc123"` |
| 纯 xhslink URL | `"http://xhslink.com/xyz"` | `"http://xhslink.com/xyz"` |
| xiaohongshu.com URL | `"https://www.xiaohongshu.com/explore/abc123"` | `"https://www.xiaohongshu.com/explore/abc123"` |
| xiaohongshu URL 含中文逗号截止 | `"https://www.xiaohongshu.com/abc，其他内容"` | `"https://www.xiaohongshu.com/abc"` |
| 无 URL 的文本 | `"这是一段普通文字"` | `"这是一段普通文字"`（原样返回） |
| 空字符串 | `""` | `""` |
| xhslink 优先于 xiaohongshu | `"http://xhslink.com/a/1 https://www.xiaohongshu.com/b"` | `"http://xhslink.com/a/1"` |

### 2. `src/tools/__tests__/chineseUnit.test.ts`

测试提取后的 `chineseUnitStrToNumber` 导出函数。

测试用例：

| 测试描述 | 输入 | 期望输出 |
|---------|------|---------|
| 万单位整数 | `"1万"` | `10000` |
| 万单位小数 | `"1.2万"` | `12000` |
| 万单位带空格 | `"1.5 万"` | `15000` |
| 纯数字字符串 | `"123"` | `123` |
| 零 | `"0"` | `0` |
| 空字符串 | `""` | `0`（`Number("")` 在 JavaScript 中返回 `0`） |
| 大数含万 | `"100万"` | `1000000` |

### 3. `src/auth/__tests__/cookieManager.test.ts`

使用 `jest.mock('fs')` 工厂（同上）。

需要 `jest.mock('../../utils/logger')` 静默 logger（测试文件在 `src/auth/__tests__/`，相对路径为 `../../utils/logger`）。

**测试组：saveCookies**
- 目录已存在时（`existsSync` 返回 `true`）：调用 `fs.promises.writeFile(cookiePath, JSON.stringify(cookies, null, 2))`，不调用 `mkdirSync`
- 目录不存在时（`existsSync` 返回 `false`）：先调用 `fs.mkdirSync(dir, {recursive: true})`，再调用 `writeFile`

**测试组：loadCookies**
- 文件不存在（`existsSync` 返回 `false`）：返回 `[]`，不调用 `readFile`
- 文件存在（`existsSync` 返回 `true`）：`readFile` mock 返回 `JSON.stringify([{ name: 'token', value: 'xyz' }])`，解析后返回对象数组

**测试组：clearCookies**
- 文件存在：调用 `fs.promises.unlink(cookiePath)`
- 文件不存在：不调用 `unlink`，无异常抛出

### 4. `src/utils/__tests__/stdioLogger.test.ts`

**测试组：进程流替换**
- 调用 `createStdioLogger(path)` 后，`process.stdout.write` 被替换（不再是原始函数）
- 调用 `createStdioLogger(path)` 后，`process.stderr.write` 被替换
- 返回的清理函数调用后，`process.stdout.write` 恢复为原始函数
- 返回的清理函数调用后，`process.stderr.write` 恢复为原始函数

**注意：**
- 每个测试后必须调用清理函数，避免污染其他测试（在 `afterEach` 中调用）。
- 需要 `jest.mock('../logger')` mock logger（测试文件在 `src/utils/__tests__/`）。`logger.ts` 的模块级 `fs.mkdirSync` 副作用：由于 logger 被 mock，不会触发真实文件系统操作。

### 5. `src/auth/__tests__/authManager.test.ts`

使用 `jest.mock('playwright')`、`jest.mock('../cookieManager')`、`jest.mock('../../utils/logger')` 和 `jest.mock('fs', ...)` 工厂（同上）。

测试文件顶部导入 mock 引用：`import { mockPage, mockContext, mockBrowser } from 'playwright'`。

`AuthManager` 构造函数在 `cookiePath` 未提供时会用 `fs.existsSync`/`fs.mkdirSync` 创建目录。**所有测试必须传入显式 `cookiePath` 参数**（如 `/tmp/test-cookies.json`）来跳过目录创建逻辑，避免 `os.homedir()` 被调用时触发副作用。

**测试组：getCookies**
- 委托给 `CookieManager.loadCookies()`，返回其结果

**测试组：getBrowser**
- 调用 `chromium.launch({ headless: false })`
- 返回 browser 实例

**测试组：login — 已有 cookie 且 evaluate 返回已登录**
- `CookieManager.loadCookies` mock 返回非空 cookie 数组（如 `[{ name: 'session', value: 'abc', ... }]`）
- `page.$('.user.side-bar-component .channel')` 返回一个 mock 元素（非 null）
- `page.evaluate` mock 返回 `true`（已登录）
- 验证：`context.addCookies` 被调用；`context.cookies` 被调用；`CookieManager.saveCookies` 被调用
- 不抛出异常

**测试组：login — 无 cookie，等待二维码登录成功**
- `CookieManager.loadCookies` 返回 `[]`
- `page.$('.user.side-bar-component .channel')` 返回 `null`（未登录）
- `waitForSelector` 对所有调用均 resolve
- `page.evaluate`（最终验证登录状态）返回 `true`
- 验证：`CookieManager.saveCookies` 被调用

**测试组：login — 所有重试均失败**
- `page.evaluate`（验证登录状态）始终返回 `false`
- `page.$('.user.side-bar-component .channel')` 返回 `null`（未登录）
- 实际代码有 3 次重试循环，每次失败后 `await new Promise(resolve => setTimeout(resolve, 2000))` 延迟
- 在 `beforeEach` 调用 `jest.useFakeTimers()`，在 `afterEach` 调用 `jest.useRealTimers()`
- 测试中：启动 `login()` 调用但不立即 await，然后用 `await jest.runAllTimersAsync()` 推进所有 timer，再 await login promise
  ```typescript
  const loginPromise = authManager.login()
  await jest.runAllTimersAsync()
  await expect(loginPromise).rejects.toThrow('Login failed after maximum retries')
  ```
- 验证：最终抛出 `Error('Login failed after maximum retries')`（**不是** `'Login verification failed'`，该错误在循环内被捕获并重试）

**测试组：cleanup**
- `AuthManager.page` 和 `context` 仅在 `login()` 执行后才被赋值，测试前需先调用 `login()`（使用 "已有 cookie 且已登录" 场景的 mock 配置）使字段非空
- 调用 `cleanup()` 后，`mockPage.close` 被调用一次、`mockContext.close` 被调用一次
- 由于字段为 `private`，通过验证 mock 函数调用次数确认行为，不直接访问私有属性

### 6. `src/tools/__tests__/rednoteTools.test.ts`

使用 `jest.mock('playwright')`、`jest.mock('../../auth/authManager')`、`jest.mock('../noteDetail')` 和 `jest.mock('../../utils/logger')`。

测试文件顶部导入 mock 引用：`import { mockPage, mockBrowser } from 'playwright'`（实际来自 `__mocks__/playwright.ts`）。

`jest.mock('../../auth/authManager')` 的工厂函数在 Jest 的 hoisting 机制下无法直接引用外部变量。正确做法是在工厂中使用 `jest.requireMock('playwright')` 获取 playwright mock 的引用：

```typescript
jest.mock('../../auth/authManager', () => {
  const { mockBrowser } = jest.requireMock('playwright')
  return {
    AuthManager: jest.fn().mockImplementation(() => ({
      getBrowser: jest.fn().mockResolvedValue(mockBrowser),
      getCookies: jest.fn().mockResolvedValue([]),
    })),
  }
})
```

`searchNotes` 调用 `randomDelay`（内部调用 `setTimeout`），必须使用假定时器：在 `beforeEach` 调用 `jest.useFakeTimers()`，在 `afterEach` 调用 `jest.useRealTimers()`。调用需要推进 timer 的测试时使用 `jest.runAllTimersAsync()`。

`getNoteContent` 调用 `initialize()` 时 `page.evaluate` 需返回 `true`（登录验证），然后 `GetNoteDetail` 通过 `jest.mock('../noteDetail')` 单独 mock，使两个 `page.evaluate` 调用不冲突：
```typescript
jest.mock('../noteDetail', () => ({
  GetNoteDetail: jest.fn().mockResolvedValue({ title: '标题', content: '内容', tags: [], author: '作者', url: '', likes: 100, comments: 10 })
}))
```

**测试组：initialize**
- 调用 `authManager.getBrowser()`
- `page.evaluate` 返回 `true` → 不抛出异常
- `page.evaluate` 返回 `false` → 抛出 `Error('Not logged in')`

**测试组：searchNotes**
- `page.waitForSelector` 对所有调用均 resolve（包括等待 `.feeds-container`、等待 `#noteContainer`、等待 `#noteContainer` 变为 `detached`）
- `page.$$` 返回 2 个 mock note 元素，每个元素仅需 `$eval: jest.fn().mockResolvedValue(undefined)` 方法（`$eval` 用于点击 `a.cover.mask.ld`；`page.$('.close-circle')` 是在 `page` 上调用而非元素上）
- `page.$('.close-circle')` 返回 `null`（跳过关闭逻辑，简化测试）
- `page.evaluate` mock 返回 note 对象 `{ title: '标题', content: '内容', url: 'https://example.com', author: '作者', likes: 100, collects: 50, comments: 20 }`
- `searchNotes` 调用 `randomDelay` 共 3 次（每轮循环），使用假定时器推进：
  ```typescript
  const resultPromise = tools.searchNotes('keyword')
  await jest.runAllTimersAsync()
  const result = await resultPromise
  ```
- 验证：返回数组长度为 2
- 验证：返回对象包含 `title`、`url`、`author` 字段
- `limit` 参数：`page.$$` 返回 5 个 mock 元素，`searchNotes('kw', 2)` 时只处理 2 个，返回数组长度为 2

**测试组：getNoteContent**
- 测试前设置 `mockPage.evaluate.mockResolvedValue(true)` 使 `initialize()` 的登录验证通过
- `GetNoteDetail` 已通过 `jest.mock('../noteDetail')` 文件顶部 mock 拦截，直接返回预设 `NoteDetail` 对象
- 验证：`page.goto` 被调用，且传入的 URL 是 `extractRedBookUrl` 处理后的值（对于纯 xiaohongshu.com URL，`extractRedBookUrl` 会直接返回原 URL）
- 验证：返回的 `NoteDetail` 对象，`url` 字段为**原始**入参（代码中 `note.url = url` 赋值原始 url，而非 goto 的 actualURL）

**测试组：cleanup**
- `RedNoteTools.page` 和 `browser` 仅在 `initialize()` 执行后才被赋值，测试前需先调用 `initialize()`（设置 `mockPage.evaluate.mockResolvedValue(true)`）使字段非空
- 调用 `cleanup()` 后 `mockPage.close` 被调用一次、`mockBrowser.close` 被调用一次
- 由于字段为 `private`，通过验证 mock 函数调用次数确认行为

### 7. `src/tools/__tests__/getNoteDetail.test.ts`

使用 `jest.mock('playwright')` 和 `jest.mock('../../utils/logger')`。

直接测试 `GetNoteDetail(page)` 函数，传入 mock page 对象。

**注意：** `page.evaluate(getContent)` 由 playwright mock 拦截，直接返回预设对象——`getContent` 函数体（包括其内的 `ChineseUnitStrToNumber`）**不会执行**。因此 `likes: 10000` 是直接 mock 的返回值，并非函数转换的结果。

**测试组：GetNoteDetail**
- `page.waitForSelector` 对 `.note-container` 和 `.media-container` 各调用一次（顺序验证）
- `page.evaluate` 返回完整 note 对象：
  ```typescript
  {
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
  ```
- 验证：返回对象的 `title`、`content`、`tags`、`author`、`imgs`、`videos`、`url`、`likes`、`comments` 字段与 mock 返回值一致
- 验证：`url` 字段为空字符串（`GetNoteDetail` 函数本身不设置 `url`，由调用方 `RedNoteTools.getNoteContent` 在返回后赋值）

## jest.config.js 变更

无需修改 `jest.config.js`。`__mocks__/playwright.ts` 位于项目根，Jest 默认行为会将其作为 `playwright` 这个 node_modules 包的手动 mock。

## 测试运行方式

```bash
npm test                    # 运行全部测试
npx jest --testPathPattern extractUrl   # 单文件
npx jest --coverage         # 生成覆盖率报告
```

## CI 兼容性

所有测试不依赖真实浏览器、真实文件系统、网络请求，可在无头 CI 环境中运行。
