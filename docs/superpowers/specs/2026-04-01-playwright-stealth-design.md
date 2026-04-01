# Playwright 分层防检测架构设计

## 概述

为解决小红书频繁要求重新登录（headless 浏览器被检测）和请求被限流（行为特征异常）的问题，引入四层防检测架构，将浏览器创建逻辑集中到新模块 `src/browser/`，替换现有散落在 `AuthManager` 和 `RedNoteTools` 中的 `chromium.launch()` 调用。

**破坏性变更：** 将 `playwright` 替换为 `rebrowser-playwright`，所有 `import ... from 'playwright'` 改为 `import ... from 'rebrowser-playwright'`。

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

仅替换**用户可见的主动交互**（点击笔记封面、点击关闭按钮），不替换内部自动化操作（`waitForSelector`、`evaluate` 等）。

### 层 4 — 配置层（launch args + context 参数）

统一在 `BrowserFactory` 中配置：

**launch args：**
- `--disable-blink-features=AutomationControlled` — 移除 Chrome 自动化控制标识
- `--disable-infobars` — 隐藏"Chrome 正受到自动软件控制"提示栏
- `--no-sandbox`, `--disable-setuid-sandbox` — Linux 环境兼容
- `--disable-dev-shm-usage` — 避免共享内存不足崩溃
- `--lang=zh-CN` — 语言标识与目标站点一致

**context 参数：**
- `userAgent`：真实 Mac Chrome UA（`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`）
- `viewport`：`{ width: 1280, height: 800 }` — 常见桌面分辨率
- `locale`：`zh-CN`
- `timezoneId`：`Asia/Shanghai` — 避免时区异常触发风险验证

## 文件结构

| 操作 | 路径 | 用途 |
|---|---|---|
| 新增 | `src/browser/browserFactory.ts` | 唯一的 `chromium.launch()` 调用点，封装四层防检测配置 |
| 新增 | `src/browser/humanMouse.ts` | ghost-cursor 的 Playwright 适配器，暴露 `click` / `moveTo` / `randomMove` |
| 修改 | `src/auth/authManager.ts` | 移除内联 `chromium.launch()`，改为调用 `BrowserFactory.launch()` |
| 修改 | `src/tools/rednoteTools.ts` | 交互操作替换为 `HumanMouse`；`getBrowser()` 走 `BrowserFactory` |
| 重命名 | `__mocks__/playwright.ts` → `__mocks__/rebrowser-playwright.ts` | 测试 mock 路径与新依赖名对齐 |
| 修改 | 所有 `src/**/*.ts` | `import ... from 'playwright'` → `import ... from 'rebrowser-playwright'` |
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
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext } from 'rebrowser-playwright'

chromium.use(StealthPlugin())

export class BrowserFactory {
  static async launch(headless = false): Promise<Browser>
  static async newStealthContext(browser: Browser): Promise<BrowserContext>
}
```

`launch()` 用于所有浏览器创建场景（登录、搜索、获取详情）。`newStealthContext()` 在需要独立 context（如 `AuthManager` 加载 cookies）时使用。

### HumanMouse

```typescript
// src/browser/humanMouse.ts
import type { Page } from 'rebrowser-playwright'

export class HumanMouse {
  constructor(page: Page)
  async click(selector: string): Promise<void>      // 贝塞尔曲线移动 + 点击
  async moveTo(x: number, y: number): Promise<void> // 移动到绝对坐标
  async randomMove(): Promise<void>                  // 随机漂移（模拟浏览行为）
}
```

## 错误处理

- `BrowserFactory.launch()` 失败时直接抛出，调用方（`AuthManager`、`RedNoteTools`）的现有 try/catch 处理逻辑不变
- `HumanMouse.click()` 若 selector 未找到，ghost-cursor 会抛出，由 `searchNotes` 现有的 per-note try/catch 捕获，行为与之前一致
- rebrowser-playwright 的 patch 模式默认为 `addBinding`，无需环境变量配置；如需切换可在 `.env` 中设置 `REBROWSER_PATCHES_RUNTIME_FIX_MODE`

## 测试策略

**现有测试文件仅需修改 mock 路径：**
- `__mocks__/playwright.ts` 重命名为 `__mocks__/rebrowser-playwright.ts`
- 所有测试文件中 `jest.mock('playwright')` 改为 `jest.mock('rebrowser-playwright')`

`BrowserFactory` 和 `HumanMouse` 不新增单元测试：
- `BrowserFactory` 是配置封装，无独立业务逻辑
- `HumanMouse` 是第三方库适配器，测试价值低于集成测试

**关于 `playwright-extra` 与 rebrowser-playwright 的兼容性：** `playwright-extra` 是薄封装，通过动态代理转发调用，不绑定 Playwright 内部 API，与 rebrowser-playwright 兼容。

## 已知限制

- `rebrowser-playwright` 的版本需手动跟踪 playwright 更新（目前最新 `1.52.0`），落后时间通常为数周
- ghost-cursor 无官方 Playwright 适配，`createCursor(page as any)` 的 `as any` 类型绕过在 Playwright 升级时需验证是否仍然正确
- stealth 插件最后更新于 2023年12月，对最新一代反爬系统（如 Cloudflare Turnstile）的覆盖有限；该插件解决 JS 指纹层，CDP 层由 rebrowser 覆盖，两者互补
