# Playwright 分层防检测架构设计

## 概述

为解决小红书频繁要求重新登录（headless 浏览器被检测）和请求被限流（行为特征异常）的问题，引入四层防检测架构，将浏览器创建逻辑集中到新模块 `src/browser/`，替换现有散落在 `AuthManager` 和 `RedNoteTools` 中的 `chromium.launch()` 调用。

**破坏性变更：** 将 `playwright` 替换为 `rebrowser-playwright`，所有 `import ... from 'playwright'` 改为 `import ... from 'rebrowser-playwright'`。`headless` 模式保持 `false`（与现有行为一致，本次不新增 headless 参数）。

## 四层防检测架构

### 层 1 — CDP 层（rebrowser-playwright）

将 `package.json` 中的 `playwright` 替换为 `rebrowser-playwright`。该包是 Playwright 的 drop-in 替换，与 Playwright API 完全兼容，版本号跟踪 Playwright（如 `1.52.x` 对应 Playwright `1.52`）。

核心修复：Playwright 在每次与浏览器交互时向 Chrome DevTools Protocol 发送 `Runtime.enable` 指令，Cloudflare、DataDome 等现代反爬系统将此作为自动化浏览器的主要识别信号。rebrowser-playwright 通过 `Runtime.addBinding` 替代方案绕过这一泄露，同时修复 `//# sourceURL=playwright:...` 注入脚本标识泄露。

### 层 2 — JS 指纹层（playwright-extra + puppeteer-extra-plugin-stealth）

用 `playwright-extra` 包装 rebrowser-playwright 的 `chromium` 对象，注入 stealth 插件。该插件修复 15+ 个 JS 层检测特征，包括：

- `navigator.webdriver = true`（最主要的自动化标识）
- WebGL 渲染器/厂商字符串（GPU 指纹）
- `navigator.plugins` 为空（真实浏览器有插件列表）
- `navigator.languages` 异常
- `window.chrome` 对象缺失
- 通知权限行为与真实浏览器不一致

即便当前使用 `headless: false`，`navigator.webdriver` 仍为 `true`，stealth 插件是修复此问题的必要手段。

### 层 3 — 行为层（ghost-cursor）

当前代码使用 `$eval('a', el => el.click())` 和 `element.click()`，鼠标瞬间到达目标坐标，这是非人类特征。使用 `ghost-cursor` 生成贝塞尔曲线鼠标轨迹，模拟人类手部运动：

- 轨迹基于 Fitts' Law 生成（距离越远速度越快，目标越大越容易命中）
- 带随机微抖动和轻微过冲后回正
- 点击前后有随机停留时长

替换规则：凡是模拟用户手动点击的操作均使用 `HumanMouse`，具体包括 `rednoteTools.ts` 中的：
- `noteItems[i].$eval('a.cover.mask.ld', el => el.click())` — 打开笔记
- `closeButton.click()` — 关闭笔记弹窗（共 2 处）；原有 `if (closeButton)` null 检查去掉，`HumanMouse.click('.close-circle')` 在 selector 找不到时抛出，由外层 per-note try/catch 捕获（行为等价）

不替换：`waitForSelector`、`page.evaluate`、`page.goto`、`page.$$` 等 DOM 查询和导航操作。

### 层 4 — 配置层（launch args + context 参数）

统一在 `BrowserFactory` 中配置：

**launch args：**
- `--disable-blink-features=AutomationControlled` — 移除 Chrome 自动化控制标识
- `--disable-infobars` — 隐藏"Chrome 正受到自动软件控制"提示栏
- `--no-sandbox`, `--disable-setuid-sandbox` — Linux 环境兼容
- `--disable-dev-shm-usage` — 避免共享内存不足崩溃
- `--lang=zh-CN` — 语言标识与目标站点一致

**context 参数：**
- `userAgent`：真实 Mac Chrome UA（`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`）；该字符串固定维护，每次升级 rebrowser-playwright 大版本时同步更新以匹配对应 Chromium 版本
- `viewport`：`{ width: 1280, height: 800 }` — 常见桌面分辨率
- `locale`：`zh-CN`
- `timezoneId`：`Asia/Shanghai` — 避免时区异常触发风险验证

## 文件结构

| 操作 | 路径 | 用途 |
|---|---|---|
| 新增 | `src/browser/browserFactory.ts` | 唯一的 `chromium.launch()` 调用点，封装四层防检测配置 |
| 新增 | `src/browser/humanMouse.ts` | ghost-cursor 的 Playwright 适配器，暴露 `click` / `moveTo` / `randomMove` |
| 修改 | `src/auth/authManager.ts` | import 路径 `playwright` → `rebrowser-playwright`；移除内联 `chromium.launch()`，改为调用 `BrowserFactory.launch(headless, { timeout })` |
| 修改 | `src/tools/rednoteTools.ts` | import 路径 `playwright` → `rebrowser-playwright`；交互操作（打开笔记、关闭弹窗）替换为 `HumanMouse.click()`；`getBrowser()` 走 `BrowserFactory` |
| 修改 | `src/tools/noteDetail.ts` | `import { Page } from 'playwright'` → `import { Page } from 'rebrowser-playwright'` |
| 修改 | `src/auth/__tests__/authManager.test.ts` | `jest.mock('playwright')` → `jest.mock('rebrowser-playwright')`；`jest.requireMock('playwright')` → `jest.requireMock('rebrowser-playwright')`；`import type { Cookie } from 'playwright'` → `rebrowser-playwright` |
| 修改 | `src/tools/__tests__/rednoteTools.test.ts` | `jest.mock('playwright')` → `jest.mock('rebrowser-playwright')`；`jest.requireMock('playwright')` → `jest.requireMock('rebrowser-playwright')` |
| 修改 | `src/tools/__tests__/getNoteDetail.test.ts` | `jest.mock('playwright')` → `jest.mock('rebrowser-playwright')`；`jest.requireMock('playwright')` → `jest.requireMock('rebrowser-playwright')` |
| 修改 | `src/tools/__tests__/extractUrl.test.ts` | `jest.mock('playwright')` → `jest.mock('rebrowser-playwright')` |
| 重命名 | `__mocks__/playwright.ts` → `__mocks__/rebrowser-playwright.ts` | 测试 mock 路径与新依赖名对齐，内容不变 |
| 修改 | `package.json` | 替换依赖（见下） |

## 依赖变更

```json
// 移除
"playwright": "^1.42.1"

// 新增（dependencies）
"rebrowser-playwright": "^1.52.0",
"playwright-extra": "^4.3.6",
"puppeteer-extra-plugin-stealth": "^2.11.2",
"ghost-cursor": "^1.4.2"
```

`playwright` 移入 `devDependencies` 作为类型参考（如果需要），或完全移除。

## 模块接口

### BrowserFactory

```typescript
// src/browser/browserFactory.ts
import { chromium as rebrowserChromium } from 'rebrowser-playwright'
import { addExtra } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext } from 'rebrowser-playwright'

// 关键：用 addExtra 将 rebrowser-playwright 的 chromium 注入 playwright-extra，
// 确保 stealth 插件运行在 rebrowser 的补丁之上而非标准 playwright
const chromium = addExtra(rebrowserChromium)
chromium.use(StealthPlugin())

export class BrowserFactory {
  // headless 固定为 false，保持现有行为；timeout 透传以保留 AuthManager.login() 中的用户可配置超时
  static async launch(headless = false, options?: { timeout?: number }): Promise<Browser>
  static async newStealthContext(browser: Browser): Promise<BrowserContext>
}
```

`launch()` 用于所有浏览器创建场景（登录、搜索、获取详情）。`newStealthContext()` 在需要独立 context（如 `AuthManager` 加载 cookies）时使用；`AuthManager` 的调用序列为：`BrowserFactory.launch()` 获取浏览器 → `BrowserFactory.newStealthContext(browser)` 获取 context → context 加载 cookies。

`playwright-extra` 的类型定义依赖 `playwright` 包，但 `rebrowser-playwright` 自带完整类型定义且类型结构与 `playwright` 兼容，因此 `playwright` 可以从 `dependencies` 完全移除。`devDependencies` 中同样无需保留 `playwright`。

### HumanMouse

```typescript
// src/browser/humanMouse.ts
import { GhostCursor } from 'ghost-cursor'  // named export，不是 createCursor
import type { Page } from 'rebrowser-playwright'

export class HumanMouse {
  private cursor: GhostCursor

  constructor(page: Page) {
    // GhostCursor 类型要求 Puppeteer Page，但 Playwright Page 的 mouse API 结构兼容
    this.cursor = new GhostCursor(page as any)
  }

  async click(selector: string): Promise<void> {
    // cursor.click() 内部先 page.$(selector) 定位元素，再沿贝塞尔曲线移动后点击
    await this.cursor.click(selector)
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.cursor.moveTo({ x, y })
  }

  randomMove(): void {
    // toggleRandomMove 是同步方法，开启持续随机漂移，模拟用户浏览时的鼠标移动
    this.cursor.toggleRandomMove(true)
  }
}
```

## 错误处理

- `BrowserFactory.launch()` 失败时直接抛出，调用方（`AuthManager`、`RedNoteTools`）的现有 try/catch 处理逻辑不变
- `HumanMouse.click()` 若 selector 未找到，ghost-cursor 会抛出，由 `searchNotes` 现有的 per-note try/catch 捕获，行为与之前一致
- rebrowser-playwright 的 patch 模式默认为 `addBinding`，无需环境变量配置；如需切换可在 `.env` 中设置 `REBROWSER_PATCHES_RUNTIME_FIX_MODE`

## 测试策略

**现有测试文件仅需修改 mock 路径，mock 内容不变：**
- `__mocks__/playwright.ts` 重命名为 `__mocks__/rebrowser-playwright.ts`（mock 内容完全相同，因为 API 完全兼容）
- 所有测试文件中 `jest.mock('playwright')` 改为 `jest.mock('rebrowser-playwright')`

`BrowserFactory` 在测试中通过 mock `rebrowser-playwright` 间接覆盖（`chromium.launch` 已被 mock），无需额外 mock `BrowserFactory` 本身。`HumanMouse` 在测试中通过 mock `ghost-cursor` 处理（或直接 mock `HumanMouse` 类）。

`BrowserFactory` 和 `HumanMouse` 不新增单元测试：
- `BrowserFactory` 是配置封装，无独立业务逻辑
- `HumanMouse` 是第三方库适配器，测试价值低于集成测试

## 已知限制

- `rebrowser-playwright` 的版本需手动跟踪 playwright 更新（目前最新 `1.52.0`），落后时间通常为数周
- ghost-cursor (`GhostCursor`) 无官方 Playwright 适配，`new GhostCursor(page as any)` 的 `as any` 类型绕过在 Playwright 升级时需验证是否仍然正确
- stealth 插件最后更新于 2023年12月，对最新一代反爬系统（如 Cloudflare Turnstile）的覆盖有限；该插件解决 JS 指纹层，CDP 层由 rebrowser 覆盖，两者互补
- `npm install` 可能输出 `playwright-extra` / `puppeteer-extra-plugin-stealth` 对 rebrowser-playwright 1.52 的 peer dependency 警告，这些警告可安全忽略（或加 `--legacy-peer-deps`），因为 stealth 插件使用的 API 在该版本范围内稳定
