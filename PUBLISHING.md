# 发布清单（维护者用）

本文件是 `dsh-newapi-provider` 的发布材料。**npm 发布、仓库转公开、插件市场投稿都需要人工确认后单独执行**，自动化流程不代替这三步。

## 当前状态（2026-10-23）

| 项目 | 状态 |
| --- | --- |
| 版本 | 0.8.1（未发布） |
| 包名 | `dsh-newapi-provider` — npm 上仍是 404，名称可用 |
| 仓库 | https://github.com/zenVibeCoding/dsh-newapi-provider （公开，已加 `dsh-plugin` topic） |
| 许可证 | MIT，作者 `zenVibeCoding` |
| 验证环境 | DSH 0.2.1-rc.2 / Node.js 22.19+，`engines.dsh: >=0.2.1-rc.1 <0.3.0-0` |
| 离线测试 | `npm test`，103 项全过 |
| 打包 | 19 个文件，无凭据/本机路径 |
| 真实生图 | **未验证**（网关返回 503 无可用渠道） |
| 真实视频 | **未验证**（无视频渠道），工具为实验性 |

## 发布前必须完成

1. **在网关侧配好至少一个可用的生图渠道**，跑通一次真实生图并确认附件落盘。
2. 如能取得视频渠道，跑通一次「提交 → 轮询 → 下载 → 附件」。
3. 在连接的 DSH 窗口检查设置页三个标签、渠道编辑弹窗、模型编辑弹窗的实际观感。
4. 更新 README「当前验证范围与限制」，把已验证项写实，未验证项保持明示。
5. 确认版本号与 `client.js` 里 `data-newapi-provider-version` 一致。

## 打包检查

```sh
npm test
node --check index.js
node --check client.js
npm pack --dry-run --ignore-scripts
```

预期：19 个文件，只含 `index.js`、`client.js`、`lib/*.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README*.md`、`PUBLISHING.md`、`LICENSE`、`package.json`。

**不得包含**：`test/`、`node_modules`、`docs/`、个人网关地址或令牌、`.credentials*`、调研笔记（`~/dsh-newapi-plugin`）、会话截图。发布前自查：

```sh
npm pack --dry-run --ignore-scripts 2>&1 | grep -Ei 'credential|secret|sk-|/Users/'
```

## 第一步：npm 发布

当前 `npm whoami` 报 `ENEEDAUTH`，需要先登录：

```sh
npm login                     # 浏览器 OAuth；或 npm login --auth-type=legacy
npm whoami

cd ~/dsh-newapi-provider
git status --short             # 应为干净
npm view dsh-newapi-provider version   # 期望 404

npm publish --access public   # 开了 2FA 会提示 --otp <code>
```

发布后立刻验证（不要只看 npm 网页缓存）：

```sh
npm view dsh-newapi-provider version     # 期望 0.8.1
npm view dsh-newapi-provider dist.tarball
```

装一次真实回归（用临时 profile 或先卸载本地 link 安装）：

```sh
dsh plugin add dsh-newapi-provider    # 走 npm 而非本地目录
```

- 包名已被占用时不要硬发，先定后缀（如 `dsh-newapi-provider-community`）并同步 README、`cordis.patch.yml`、locale 标题。
- 之后发新版只改版本号 → 提交 → `npm publish`，不要复用已发布的版本号。

## 第二步：插件市场投稿

已核对 `awesome-dsh-plugin` 的 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，规则如下：

- **一个文件就是全部投稿**：PR 新增 `data/plugins/<owner>__<repo>.yml`，不要手改 README（README 由脚本生成）。
- 只有 `description.en` 必填，中文描述可选（缺了维护者会补）。
- 仓库 `package.json` 必须声明 `dsh.bundle`（本仓库有 `{"bundle":{"patch":"./cordis.patch.yml"}}`）。
- 仓库需含真实可用代码；**创建满 1 天**（CI 自动查）。
- 仓库需加 `dsh-plugin` topic（已完成）。
- 描述必须属实，不带营销词；分类要贴合实际功能。

**时间门槛**：仓库创建于 2026-10-23 07:01 UTC，需满 24 小时，即 **2026-10-24 15:01（东八区）之后**再提 PR。

投稿文件内容（保存为 `data/plugins/zenVibeCoding__dsh-newapi-provider.yml`）：

```yaml
url: https://github.com/zenVibeCoding/dsh-newapi-provider
name: zenVibeCoding/dsh-newapi-provider
category: model
description:
  en: 'New API gateway provider: multi-channel models with context and modality details, quota, and image and video generation.'
  zh: 'New API 网关提供商：多渠道模型管理与上下文/多模态标注、额度查询，以及生图与视频生成。'
```

> 描述里有 `: ` 必须加引号，否则 YAML 解析失败。

提交步骤：

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
# 写入上面那个 yml（文件名必须是 owner__repo.yml）
git checkout -b add-dsh-newapi-provider
git add data/plugins/zenVibeCoding__dsh-newapi-provider.yml
git commit -m "Add dsh-newapi-provider"
git push -u origin add-dsh-newapi-provider
gh pr create --fill
```

分类备选：`model`（模型接入，最贴合）。若维护者认为更偏 UI，会直接改，不会打回。

## 其他收录入口

除了主列表，还有几个市场会自动抓取带 `dsh-plugin` topic 的仓库（如 `dsh-market`、`bradeGithub/DSH-Plugins-Marketplace` 等），加了 topic 后通常会被自动收录，无需逐个投稿。以各仓库说明为准。

## 版本与兼容

- 语义化版本：破坏性配置变更升 minor 前，先写迁移说明（参考 README 的 v0.7.0 改名章节）。
- 路由 id 一旦发布就不要随意更改：改动会让已有会话失去模型选择。
- 数据结构变更（`channels`、`enabledModels`、`models`）必须保持向后兼容，或在 README 写清迁移步骤。

## 已知未完成项（可写进「限制」）

- 旧令牌在轮换后仍保留在凭据库，需要「无进行中视频任务引用」的清理规则。
- 重启后视频任务不会重新唤醒发起它的对话。
- 部分历史样式未被使用，可在发布前清理。
