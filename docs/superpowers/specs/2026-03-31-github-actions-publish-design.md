# GitHub Actions 发布流程设计

## 概述

为 `@nodite/rednote-mcp` 配置 GitHub Actions 全自动发布流程。在 Actions 页面手动触发，选择版本类型（patch/minor/major），由 workflow 自动完成：版本计算 → 更新 `package.json` → 推送 commit + tag → 发布到 npm → 创建 GitHub Release。

**此设计覆写现有的 `.github/workflows/npm-publish.yml`**，替换整个文件内容（包括整个 `on:` 块），移除原有的 `push: branches: main` 和 `tags: v*` 触发器，避免并存导致重复发布。

## 触发条件

```yaml
on:
  workflow_dispatch:
    inputs:
      version_type:
        description: "Version bump type"
        required: true
        default: "patch"
        type: choice
        options:
          - patch
          - minor
          - major
```

在 GitHub Actions 页面手动触发，选择版本类型后点击运行。**只能在 `main` 分支上运行**（job 级别加 `if: github.ref == 'refs/heads/main'`），避免误在 feature 分支触发。

## 权限

```yaml
permissions:
  contents: write  # push commit + tag + 创建 GitHub Release
```

`GITHUB_TOKEN` 由 GitHub 自动注入，commit 显示为 `github-actions[bot]` 身份。

## Job 步骤

| 步骤 | id | 命令 | 说明 |
|------|----|------|------|
| 1. Checkout | — | `actions/checkout@v4`（默认 `fetch-depth: 1`） | 浅克隆足以推送 commit；`--generate-notes` 依赖 GitHub API |
| 2. Setup Node.js | — | `actions/setup-node@v4`，Node `20.x`，`registry-url: https://registry.npmjs.org` | 配置 npm registry，激活 `NODE_AUTH_TOKEN` 鉴权 |
| 3. 配置 git user | — | `git config user.name "github-actions[bot]"` / `git config user.email "41898282+github-actions[bot]@users.noreply.github.com"` | 标准 bot 身份，固定 ID `41898282` |
| 4. 安装依赖 | — | `npm ci` | 使用 lock file 精确安装 |
| 5. 类型检查 | — | `npx tsc --noEmit` | 失败则终止，不修改任何文件 |
| 6. 构建 | — | `npm run build` | 生成 `dist/`；失败则终止，不修改任何文件 |
| 7. 更新版本号 | — | `npm version ${{ inputs.version_type }} --no-git-tag-version` | 同时更新 `package.json` 和 `package-lock.json`，不产生 commit/tag |
| 8. 读取新版本 | `version` | `echo "VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT` | 通过 `$GITHUB_OUTPUT` 导出；后续步骤用 `${{ steps.version.outputs.VERSION }}` 引用 |
| 9. Git commit | — | `git diff --quiet && git diff --staged --quiet \|\| git commit -am "chore: bump version to v${{ steps.version.outputs.VERSION }}"` | 提交 `package.json` 和 `package-lock.json` 变更；防御性检查避免 nothing-to-commit 报错 |
| 10. Git tag | — | `git tag v${{ steps.version.outputs.VERSION }}` | 创建版本 tag |
| 11. Git push | — | `git push origin HEAD:${{ github.ref_name }} --tags` | 动态引用当前分支；同时推送 commit 和 tag |
| 12. 发布 npm | — | `npm publish --access public --ignore-scripts` | `--ignore-scripts` 跳过所有 lifecycle scripts（包括 `prepublishOnly: npm run build`），有意为之，因构建已在步骤 6 完成。**约束：`prepublishOnly` 不得添加除构建以外的步骤，否则需同步修改此 workflow** |
| 13. 创建 Release | — | `gh release create v${{ steps.version.outputs.VERSION }} --generate-notes --title "v${{ steps.version.outputs.VERSION }}"` | 通过 GitHub API 生成 Release Notes（基于两个 tag 之间的 PR/commit） |

**关于测试**：当前测试依赖 Playwright 操控真实浏览器，CI 环境无法直接运行，暂不纳入 workflow。待测试改为可在 CI 中运行后，在步骤 5 后插入 `npm test`。

**失败保护**：步骤 5（类型检查）或步骤 6（构建）失败时，`package.json` 和 `package-lock.json` 尚未修改，不会产生任何 commit 或 tag，仓库保持干净。

## Secrets 与鉴权

| Secret/变量 | 说明 |
|-------------|------|
| `NPM_TOKEN` | npm Automation token，在仓库 Settings > Secrets and variables > Actions 中配置 |
| `GITHUB_TOKEN` | GitHub 自动注入，无需手动配置 |

步骤 12（npm 发布）和步骤 13（创建 Release）分别注入鉴权：

```yaml
- name: Publish to npm
  run: npm publish --access public --ignore-scripts
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

- name: Create GitHub Release
  run: gh release create v${{ steps.version.outputs.VERSION }} --generate-notes --title "v${{ steps.version.outputs.VERSION }}"
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 发布操作步骤

1. 确认代码已合并到 `main`，且 `main` 分支状态干净
2. 进入仓库 **Actions** 页面 → 选择 **Publish to NPM** workflow → 点击 **Run workflow**
3. 确认分支为 `main`，选择 `version_type`（patch / minor / major），点击确认
4. Workflow 自动执行：类型检查 → 构建 → 版本更新 → push → npm 发布 → 创建 Release
5. 发布完成后在 [npmjs.com](https://www.npmjs.com/package/@nodite/rednote-mcp) 和仓库 Releases 页面确认结果
