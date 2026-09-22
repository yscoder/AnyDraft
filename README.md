# 稿域（AnyDraft）

> 本地优先的公众号 Markdown 创作工作台。

[在线体验](https://anydraft.pages.dev/) · [GitHub 仓库](https://github.com/yscoder/AnyDraft) · [问题反馈](https://github.com/yscoder/AnyDraft/issues)

稿域面向公众号内容创作者，提供 Markdown 编辑、实时排版预览和富文本复制能力。草稿与图片默认保存在你选择的本地目录中，也可以使用浏览器内置存储；内容不会上传到云端服务器，无需图床。

## 功能亮点

- 使用 CodeMirror 编辑 Markdown，实时预览公众号排版效果
- 编辑区与预览区滚动同步，支持文章目录，并在接近或超过公众号 2 万字限制时提醒
- 提供多套排版主题与内容密度设置
- 一键复制带内联样式的富文本，直接粘贴到公众号编辑器
- 直接读写本地 Markdown、图片和文件夹，支持自动保存
- 支持拖入或粘贴图片，并可定位引用、清理未引用图片
- 导入 `.md`、`.markdown`、`.txt` 或 `.zip` 备份
- 导出当前草稿、正文长图或包含草稿与图片的完整备份
- 根据屏幕宽度切换横向或纵向编辑布局

## 快速开始

### 在线使用

使用 Chrome 或 Edge 打开 [anydraft.pages.dev](https://anydraft.pages.dev/)，选择存储方式即可开始写作。

首次打开时，你可以选择：

- **打开本地目录**：草稿保存为真实的 Markdown 文件，图片保存为普通图片文件，可被其他工具直接访问。
- **使用浏览器内置存储**：无需授权本地目录，但数据只保存在当前站点对应的浏览器配置中。清理站点数据或删除浏览器配置可能导致内容丢失，请定期导出完整备份。

浏览器可能会在新的会话中要求你重新确认目录读写权限。

### 本地开发

环境要求：

- Node.js 22

```bash
git clone https://github.com/yscoder/AnyDraft.git
cd AnyDraft
npm install
npm run dev
```

根据终端输出打开本地开发地址。

## 基本使用

### 管理工作区

左侧文件树展示工作目录中的文件夹、Markdown 文档和图片。你可以新建、重命名、删除或刷新条目，也可以随时切换工作目录。

### 编辑文章

在编辑区输入 Markdown，右侧会实时渲染公众号排版效果。稿域会自动保存修改，并在底部状态栏显示字数与保存状态；文章接近或超过 2 万字时会显示提醒。

图片可直接拖入或粘贴到编辑器中。稿域会将图片保存到当前文档所在目录，并插入对应的 Markdown 引用。

### 复制与导出

| 操作 | 输出 | 用途 |
| --- | --- | --- |
| 复制到公众号 | 富文本剪贴板内容 | 粘贴到公众号编辑器 |
| 导出当前草稿 | `.md` | 保存或分享单篇文章 |
| 导出正文长图 | `.png` | 预览或分享排版结果 |
| 导出全部备份 | `.zip` | 迁移草稿和图片 |

完整备份可以再次导入稿域。导入的内容会放在新的时间戳文件夹中，避免与已有文件混杂。

## 浏览器支持

推荐使用较新版本的 Chrome 或 Edge，以获得完整的目录选择、文件读写和富文本剪贴板能力。

当浏览器无法使用目录选择器，但支持 Origin Private File System（OPFS）时，稿域会提供浏览器内置存储作为替代。其他浏览器对相关 Web API 的支持程度不同，实际可用能力可能受限。

## 仓库结构

本项目使用 npm workspaces 管理 monorepo：

```text
packages/
├── shared/    @any-draft/shared   领域类型、仓储接口与 ZIP 编解码
├── web/       @any-draft/web      Web 应用、编辑器、渲染与浏览器存储适配器
└── desktop/   @any-draft/desktop  Tauri 桌面端占位包，尚未实现

scripts/                           仓库维护脚本
tests/                             自动化测试与测试素材
```

`web` 是当前唯一可运行的前端应用。未来桌面端计划通过 Tauri WebView 复用同一套界面，并使用原生文件系统适配器。

## 架构概览

```text
React UI / CodeMirror / Markdown 渲染 / 导入导出
                         │
                 ContentRepository
                         │
              File System Access API
                  或浏览器 OPFS
```

## 技术栈

- React 19
- TypeScript 7
- Vite 7
- Tailwind CSS 4
- shadcn/ui 与 Radix UI
- CodeMirror 6
- markdown-it
- highlight.js
- npm workspaces

## 开发命令

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Web 开发服务器 |
| `npm run build` | 类型检查并构建 Web 应用 |
| `npm run preview` | 预览生产构建 |
| `npm run check` | 检查所有 workspace 的 TypeScript 类型 |
| `npm test` | 运行自动化测试 |
| `npm run format` | 使用 Prettier 格式化仓库文件 |
| `npm run format:check` | 检查仓库文件是否符合 Prettier 配置 |
| `npm run deploy` | 构建并发布到 Cloudflare Pages |

## 测试与质量检查

提交修改前建议依次运行：

```bash
npm run check
npm run format:check
npm test
npm run build
```

现有测试包含预览与导出样式隔离检查，用于保证同一份正文在稿域预览中和复制到外部环境后保持一致。

## 部署

Web 版部署到 Cloudflare Pages。完成 Wrangler 登录并获得对应项目权限后运行：

```bash
npm run deploy
```

该命令会先执行生产构建，再将 `packages/web/dist` 发布到 Cloudflare Pages 的 `any-draft` 项目。

## 桌面端

桌面客户端目前仍处于规划阶段，`packages/desktop` 仅为占位包，仓库暂不提供桌面安装程序。

## 许可

仓库目前未提供开源许可证。在许可证明确之前，默认保留所有权利。
