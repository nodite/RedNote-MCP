# GitHub Actions 发布流程设计

## 概述

为 `@nodite/rednote-mcp` 配置 GitHub Actions 自动发布流程，在创建 GitHub Release 时自动检查、构建并发布到 npm。

## 触发条件

- **事件**：`release` / `published`
- 仅在正式发布（Publish release）时触发
- Draft 和 Pre-release 不触发，避免误发

## 架构：单 Job 顺序执行

选择单 Job 方案，职责集中、失败即停、无需跨 Job 传递 artifact。

```
on:
  release:
    types: [published]
```

## Job 步骤

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. Checkout | `actions/checkout@v4` | 拉取代码 |
| 2. Setup Node.js | `actions/setup-node@v4`，Node 20.x | 配置 npm registry |
| 3. 安装依赖 | `npm ci` | 使用 lock file 精确安装 |
| 4. 类型检查 | `npx tsc --noEmit` | 失败则阻止发布 |
| 5. 运行测试 | `npm test` | 失败则阻止发布 |
| 6. 构建 | `npm run build` | 生成 dist/ |
| 7. 同步版本号 | `npm version <tag> --no-git-tag-version` | 从 Release tag 提取版本，只改 package.json，不产生 commit/tag |
| 8. 发布 | `npm publish --access public` | 发布到 npm |

步骤 4、5、6 任意失败均阻止后续步骤执行。

## 版本号同步

从 `github.ref_name`（如 `v0.3.0`）中去掉前缀 `v`，得到语义化版本号，通过 `npm version` 写入 `package.json`。使用 `--no-git-tag-version` 确保不产生新的 git commit 或 tag。

```bash
VERSION=${GITHUB_REF_NAME#v}
npm version $VERSION --no-git-tag-version
```

## 权限与 Secrets

| 项目 | 值 | 说明 |
|------|----|------|
| `NPM_TOKEN` | repo secret | npm Automation token，需在仓库 Settings > Secrets and variables > Actions 中配置 |
| `permissions.contents` | `read` | 只读，无需写回仓库 |

## 发布流程（操作步骤）

1. 开发完成后，确认代码已合并到 `main`
2. 在 GitHub 仓库页面创建新 Release，tag 格式为 `v<major>.<minor>.<patch>`（如 `v0.3.0`）
3. 填写 Release Notes，点击 **Publish release**
4. GitHub Actions 自动触发，依次执行类型检查 → 测试 → 构建 → 版本同步 → 发布
5. 发布成功后可在 [npmjs.com](https://www.npmjs.com/package/@nodite/rednote-mcp) 确认新版本
