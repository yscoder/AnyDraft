# 稿域（AnyDraft）

> 本地优先的公众号 Markdown 创作工作台。

[在线体验](https://anydraft.pages.dev/) · [问题反馈](https://github.com/yscoder/AnyDraft/issues) · [TODOLIST](./TODOLIST.md)

稿域面向公众号内容创作者，提供 Markdown 编辑、实时排版预览和富文本复制能力。草稿与图片默认保存在你选择的本地目录中，也可以使用浏览器内置存储；内容不会上传到云端服务器，无需图床。

## 功能亮点

- 使用 CodeMirror 编辑 Markdown，实时预览公众号排版效果
- 编辑区与预览区滚动同步，支持文章目录，并在接近或超过公众号 2 万字限制时提醒
- 提供多套排版主题与内容密度设置，支持基于 mp-darkmode 的公众号深色模式预览
- 一键复制带内联样式的富文本，直接粘贴到公众号编辑器
- 直接读写本地 Markdown、图片和文件夹，支持自动保存
- 支持拖入或粘贴图片，并可在当前文档中定位图片引用
- 导入 `.md`、`.markdown`、`.txt` 或 `.zip` 备份
- 导出当前草稿、正文长图或包含当前草稿及引用图片的备份
- 根据屏幕宽度切换横向或纵向编辑布局

## 快速开始

### 在线使用

使用 Chrome 或 Edge 打开 [anydraft.pages.dev](https://anydraft.pages.dev/)，选择存储方式即可开始写作。

首次打开时，你可以选择：

- **打开本地目录**：草稿保存为真实的 Markdown 文件，图片保存为普通图片文件，可被其他工具直接访问。
- **使用浏览器内置存储**：无需授权本地目录，但数据只保存在当前站点对应的浏览器配置中。清理站点数据或删除浏览器配置可能导致内容丢失，请定期导出备份。

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

### 桌面端开发

桌面端额外需要 Rust 和对应平台的 Tauri 系统依赖。安装依赖后运行：

```bash
npm run tauri:dev
```

桌面端与 Web 端复用同一套界面和功能。首次启动需要选择工作目录，之后会自动重开
最近一次使用的目录；所有 Markdown、图片和子目录都直接保存在该目录中。

## 基本使用

### 管理工作区

左侧文件树展示工作目录中的文件夹、Markdown 文档和图片。你可以新建、重命名、删除或刷新条目，也可以随时切换工作目录。

### 编辑文章

在编辑区输入 Markdown，右侧会实时渲染公众号排版效果。稿域会自动保存修改，并在底部状态栏显示字数与保存状态；文章接近或超过 2 万字时会显示提醒。

图片可直接拖入或粘贴到编辑器中。稿域会将图片保存到当前文档所在目录，并插入对应的 Markdown 引用。

底栏可通过下拉菜单选择排版主题，点击主题左侧的月亮 / 太阳按钮切换深浅预览。深色预览使用 [mp-darkmode](https://github.com/wechatjs/mp-darkmode) 的微信公众平台颜色转换算法，仅作用于预览；复制与导出仍采用原始主题配色。

### 复制与导出

| 操作 | 输出 | 用途 |
| --- | --- | --- |
| 复制到公众号 | 富文本剪贴板内容 | 粘贴到公众号编辑器 |
| 导出当前草稿 | `.md` | 保存或分享单篇文章 |
| 导出正文长图 | `.png` | 预览或分享排版结果 |
| 备份 | `.zip` | 迁移当前草稿和其中引用的图片 |

备份可以再次导入稿域。导入的内容会放在新的时间戳文件夹中，避免与已有文件混杂。

## 浏览器支持

推荐使用较新版本的 Chrome 或 Edge，以获得完整的目录选择、文件读写和富文本剪贴板能力。

当浏览器无法使用目录选择器，但支持 Origin Private File System（OPFS）时，稿域会提供浏览器内置存储作为替代。其他浏览器对相关 Web API 的支持程度不同，实际可用能力可能受限。

## 仓库结构

本项目使用 npm workspaces 管理 monorepo：

```text
packages/
├── shared/    @any-draft/shared   领域类型、仓储接口与 ZIP 编解码
├── web/       @any-draft/web      Web 应用、编辑器、渲染与浏览器存储适配器
└── desktop/   @any-draft/desktop  Tauri 2 桌面运行时与原生文件系统实现

scripts/                           仓库维护脚本
tests/                             自动化测试与测试素材
```

`web` 提供共享 React 界面和 Web 平台适配器；`desktop` 通过 Tauri WebView 复用界面，
并以受限 Rust commands 实现原生文件系统操作。

## 架构概览

```text
React UI / CodeMirror / Markdown 渲染 / 导入导出
                         │
                 ContentRepository
                  /             \
    File System Access API     Tauri commands
       或浏览器 OPFS               │
                              原生文件系统
```

构建时由 `import.meta.env.VITE_APP_RUNTIME` 固定选择 `web` 或 `tauri` 适配器。

## 技术栈

- npm workspaces
- React 19
- TypeScript 7
- Vite 7
- Tailwind CSS 4
- shadcn/ui 与 Radix UI
- CodeMirror 6
- markdown-it
- highlight.js
- Tauri 2 与 Rust

## 开发命令

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Web 开发服务器 |
| `npm run build` | 类型检查并构建 Web 应用 |
| `npm run tauri:dev` | 启动 Tauri 桌面开发环境 |
| `npm run tauri:build:macos` | 构建 macOS arm64 `.app` / `.dmg` |
| `npm run tauri:build:windows` | 构建 Windows x64 NSIS 安装程序 |
| `npm run preview` | 预览生产构建 |
| `npm run check` | 检查所有 workspace 的 TypeScript 类型 |
| `npm test` | 运行自动化测试 |
| `npm run format` | 使用 Prettier 格式化仓库文件 |
| `npm run format:check` | 检查仓库文件是否符合 Prettier 配置 |
| `npm run setv -- <version>` | 统一更新仓库各处版本号（加 `--dry-run` 只预览） |
| `npm run deploy` | 构建并发布到 Cloudflare Pages |

## 测试与质量检查

提交修改前建议依次运行：

```bash
npm run check
npm run format:check
npm test
npm run build
```

## 部署

Web 版部署到 Cloudflare Pages。

```bash
npm run deploy
```

## 桌面端

桌面客户端生产目标为 Windows x64 与 macOS arm64，最低建议系统分别为 Windows 10
和 macOS 11。

发布前用一条命令同步版本号，再创建并发布对应的版本 tag（例如 `v0.1.0`）：

```bash
npm run setv -- 0.1.0
```

该命令会同时更新根 `package.json`、`packages/web/package.json`、
`packages/desktop/package.json`、`packages/desktop/src-tauri/tauri.conf.json`、
`packages/desktop/src-tauri/Cargo.toml` 与对应的 `Cargo.lock`；
加上 `--dry-run` 可以只预览改动而不写入文件。

当前仓库没有提交签名证书，也没有启用自动更新：macOS 构建使用 ad-hoc 签名，
Windows 构建为未签名安装程序。

## 许可

仓库目前未提供开源许可证。在许可证明确之前，默认保留所有权利。
