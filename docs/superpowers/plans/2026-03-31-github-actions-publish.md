# GitHub Actions Publish Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `npm-publish.yml` with a `workflow_dispatch`-triggered workflow that auto-bumps version, commits, tags, publishes to npm, and creates a GitHub Release.

**Architecture:** Single job triggered manually via `workflow_dispatch` with a `version_type` input (patch/minor/major). The job runs only on `main`, performs type-checking and build first (fail-safe gate), then bumps version with `npm version`, commits and pushes via `GITHUB_TOKEN`, publishes to npm, and creates a GitHub Release.

**Tech Stack:** GitHub Actions, Node.js 20.x, npm, `gh` CLI (pre-installed on GitHub-hosted runners)

---

### Task 1: Replace the workflow file

**Files:**
- Modify: `.github/workflows/npm-publish.yml` (full replacement)

This is the only file change required. There are no tests to write for a GitHub Actions workflow file — correctness is verified by reviewing the YAML structure.

- [ ] **Step 1: Replace the entire content of `.github/workflows/npm-publish.yml`**

Write the following content exactly:

```yaml
name: Publish to NPM

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

permissions:
  contents: write

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          registry-url: 'https://registry.npmjs.org'

      - name: Configure git user
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Bump version
        run: npm version ${{ inputs.version_type }} --no-git-tag-version

      - name: Read new version
        id: version
        run: echo "VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT

      - name: Commit version bump
        run: |
          git diff --quiet && git diff --staged --quiet || \
            git commit -am "chore: bump version to v${{ steps.version.outputs.VERSION }}"

      - name: Create tag
        run: git tag v${{ steps.version.outputs.VERSION }}

      - name: Push commit and tag
        run: git push origin HEAD:${{ github.ref_name }} --tags

      - name: Publish to npm
        run: npm publish --access public --ignore-scripts
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        run: |
          gh release create v${{ steps.version.outputs.VERSION }} \
            --generate-notes \
            --title "v${{ steps.version.outputs.VERSION }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
cd /path/to/repo
# Check YAML syntax (requires python or yq)
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/npm-publish.yml'))" && echo "YAML valid"
```

Expected output: `YAML valid`

If `python3` is not available, visually verify:
- Top-level keys: `name`, `on`, `permissions`, `jobs`
- `on.workflow_dispatch.inputs.version_type` has `type: choice` with three options
- `jobs.build-and-publish.if` equals `github.ref == 'refs/heads/main'`
- Step with `id: version` exists
- Last two steps have `env:` blocks with `NODE_AUTH_TOKEN` and `GH_TOKEN` respectively

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/npm-publish.yml
git commit -m "ci: replace publish workflow with workflow_dispatch auto-version bump"
```

Expected output:
```
[main <hash>] ci: replace publish workflow with workflow_dispatch auto-version bump
 1 file changed, 68 insertions(+), 37 deletions(-)
```

---

## Pre-flight Checklist

Before triggering the workflow for the first time, verify:

- [ ] `NPM_TOKEN` secret is configured in **Settings > Secrets and variables > Actions**
  - Must be an npm **Automation token** (not a Publish token) to bypass npm 2FA
- [ ] The repository's default branch is `main`
- [ ] `GITHUB_TOKEN` has write permissions: **Settings > Actions > General > Workflow permissions** → set to "Read and write permissions"

## How to Trigger

1. Go to **Actions** tab in the GitHub repository
2. Select **Publish to NPM** in the left sidebar
3. Click **Run workflow**
4. Confirm branch is `main`, select `version_type` (patch / minor / major)
5. Click **Run workflow**

The workflow will:
1. Type-check and build (gate — any failure stops here, no version bump occurs)
2. Bump `package.json` version according to `version_type`
3. Commit `package.json` + `package-lock.json` as `github-actions[bot]`
4. Create and push a `v<version>` tag
5. Publish to npm as `@nodite/rednote-mcp`
6. Create a GitHub Release with auto-generated notes
