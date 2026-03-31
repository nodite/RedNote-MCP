# GitHub Actions 发布流程设计

## 概述

为 `@nodite/rednote-mcp` 配置 GitHub Actions 自动发布流程，在创建 GitHub Release 时自动检查、构建并发布到 npm。**此设计覆写现有的 `.github/workflows/npm-publish.yml`**（同一文件路径，不新增文件），避免两个 workflow 并存导致重复发布。

## 触发条件

- **事件**：`release` / `published`
- 仅在点击 "Publish release" 时触发（包括勾选了 "Set as a pre-release" 的 Release）
- **设计取舍**：不过滤 pre-release，发布者需自行确保不误点发布。若未来需要过滤，可在 workflow 中添加 `if: github.event.release.prerelease == false`
- tag 格式不做额外校验，由发布者自行保证 `v<major>.<minor>.<patch>` 格式

## 架构：单 Job 顺序执行

选择单 Job 方案，职责集中、失败即停、无需跨 Job 传递 artifact。

```yaml
on:
  release:
    types: [published]
```

## 权限

在 workflow 级别显式声明，限制为最小权限：

```yaml
permissions:
  contents: read
```

## Job 步骤

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. Checkout | `actions/checkout@v4` | 拉取代码 |
| 2. Setup Node.js | `actions/setup-node@v4`，Node `20.x`，`registry-url: https://registry.npmjs.org` | 使用浮动小版本（有意简化，优先获取安全补丁）；配置 npm registry，激活 `NODE_AUTH_TOKEN` 鉴权 |
| 3. 安装依赖 | `npm ci` | 使用 lock file 精确安装 |
| 4. 类型检查 | `npx tsc --noEmit` | 失败则阻止发布 |
| 5. 构建 | `npm run build` | 生成 `dist/`；`tsc` 只编译 TS 文件，不读取 `package.json` 版本号，因此在版本同步之前构建不影响发布包的版本一致性 |
| 6. 同步版本号 | `npm pkg set version="$VERSION"` | 从 Release tag 提取版本后直接写入 `package.json`，幂等，不触发 lifecycle hooks |
| 7. 发布 | `npm publish --access public --ignore-scripts` | `--ignore-scripts` 避免 `prepublishOnly`（`npm run build`）再次触发重复构建；`NODE_AUTH_TOKEN` 通过 env 注入 |

步骤 4、5 任意失败均阻止后续步骤执行。

**关于测试**：当前测试依赖 Playwright 操控真实浏览器，CI 环境无法直接运行，暂不纳入 workflow。待测试改为可在 CI 中运行后，在步骤 4 后插入 `npm test`。

## 版本号同步

Release tag（如 `v0.3.0`）是版本号的最终权威。使用 `npm pkg set` 直接写入 `package.json`，无论版本是否相同均幂等，不触发任何 npm lifecycle hooks。

```bash
VERSION=${GITHUB_REF_NAME#v}
npm pkg set version="$VERSION"
```

## Secrets 与鉴权

| Secret | 说明 |
|--------|------|
| `NPM_TOKEN` | npm Automation token，在仓库 Settings > Secrets and variables > Actions 中配置 |

发布步骤需通过 `env` 将 Secret 映射为 `NODE_AUTH_TOKEN`（`actions/setup-node` 配置 `registry-url` 后识别此变量名）：

```yaml
- name: Publish to npm
  run: npm publish --access public --ignore-scripts
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 发布操作步骤

1. 开发完成后，确认代码已合并到 `main`
2. 在 GitHub 仓库页面创建新 Release，tag 格式为 `v<major>.<minor>.<patch>`（如 `v0.3.0`）
3. 填写 Release Notes，点击 **Publish release**
4. GitHub Actions 自动触发，依次执行类型检查 → 构建 → 版本同步 → 发布
5. 发布成功后可在 [npmjs.com](https://www.npmjs.com/package/@nodite/rednote-mcp) 确认新版本
