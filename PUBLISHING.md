# 发布清单（维护者用）

本文件是 `dsh-newapi-provider` 的发布准备材料。**npm 发布、创建公开仓库、插件市场投稿都需要人工确认后单独执行**，任何自动化流程都不应代替这三步。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 版本 | 0.7.2（未发布） |
| 包名 | `dsh-newapi-provider`（npm 上当前未被占用，发布前请重新确认） |
| 许可证 | MIT，版权人 `zenVibeCoding` |
| 验证环境 | DSH 0.2.1-rc.2，Node.js 22.19+ |
| 离线测试 | `npm test`，103 项 |
| 真实生图 | 未验证（网关返回 503 无可用渠道） |
| 真实视频 | 未验证（无视频渠道），工具为实验性 |

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

预期：只包含 `index.js`、`client.js`、`lib/*.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README*.md`、`LICENSE`、`package.json`。

**不得包含**：`test/`、`node_modules`、个人网关地址或令牌、`.credentials*`、调研笔记（`~/dsh-newapi-plugin` 下的 `research/` 等）、会话截图、本机绝对路径。发布前用下面的命令自查：

```sh
npm pack --dry-run --ignore-scripts 2>&1 | grep -Ei 'credential|secret|sk-|/Users/'
```

## npm 发布

需要先由维护者登录（`npm login`），确认 registry 与包名归属：

```sh
npm whoami
npm view dsh-newapi-provider version   # 期望 404，表示名称可用
git status --short                     # 应为干净
npm publish --access public --otp <code>
```

- 包名已被占用时不要改用途硬发，先决定后缀（例如 `dsh-newapi-provider-community`）并同步 README、`cordis.patch.yml`、locale 标题。
- 发布后立刻验证：`npm view dsh-newapi-provider version` 与 `npm pack dsh-newapi-provider --dry-run`。

## 公开仓库

建议先推到一个私有仓库跑通 CI，再转公开：

```sh
git remote add origin git@github.com:<account>/dsh-newapi-provider.git
git push -u origin master
```

- 仓库内不要带 `~/dsh-newapi-plugin` 的调研文档。
- 建议加上 `.github/workflows/test.yml`：`npm ci && npm test`（本仓库无依赖，`npm install` 即可）。
- 开源前确认 README 中的限制说明仍然准确。

## 插件市场投稿

市场通常要求：可安装的 npm 包名、一行简介、README 链接、图标、许可证、兼容的 DSH 版本范围。提交前确认：

- `package.json` 的 `engines.dsh` 范围与实测 DSH 版本相符（当前 `>=0.2.1-rc.1 <0.3.0-0`）。
- 图标（`icon.svg`）为原创或已获授权；厂商 logo 已按 MIT 来源标注。
- 简介、截图与实际界面一致。

## 版本与兼容

- 语义化版本：破坏性配置变更升 minor 前，先写迁移说明（参考 README 的 v0.7.0 改名章节）。
- 路由 id 一旦发布就不要随意更改：改动会让已有会话失去模型选择。
- 数据结构变更（`channels`、`enabledModels`、`models`）必须保持向后兼容，或在 README 写清迁移步骤。

## 已知未完成项（发布时可写进「限制」）

- 旧令牌在轮换后仍保留在凭据库，需要「无进行中视频任务引用」的清理规则。
- 重启后视频任务不会重新唤醒发起它的对话。
- 无障碍细节：模型行有过多 Tab 停留点，健康状态会被屏幕阅读器反复播报。
- 部分历史样式未被使用，可在发布前清理。
