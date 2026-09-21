# 稿域（AnyDraft）

> 目标是打造一站式公众号创作工作台。

## 仓库结构（npm workspaces monorepo）

```text
packages/
├── shared/    @any-draft/shared  跨运行时纯逻辑：领域类型（Draft）与 ZIP 编解码；
│                                 未来承载 ContentRepository 接口与契约测试
├── web/       @any-draft/web    Web 应用：全部 UI、编辑器、渲染与浏览器存储
│                                 （localStorage / IndexedDB）
└── desktop/   @any-draft/desktop 桌面端 Tauri 壳（规划中、暂未实现，
                                   见 docs/TAURI_DESKTOP_MIGRATION_PLAN.md）
```

`web` 是唯一的前端应用；未来的桌面端不会复制 UI，而是让 Tauri WebView 复用 `web` 的构建产物，并动态导入 `desktop` 包中的存储适配器。

## 技术栈

React 19 · TypeScript 7 · Vite 7 · Tailwind CSS 4 · shadcn/ui（Maia / neutral）· Radix UI · Lucide · CodeMirror 6 · markdown-it · highlight.js

## 开发

在仓库根目录执行（脚本会转发到对应 workspace 包）：

```bash
npm install
npm run dev      # packages/web 开发服务器
npm run build    # 类型检查 + 生产构建（仅 Web 版）
npm run preview  # 预览构建产物
npm run deploy   # 构建 + 发布到 Cloudflare Pages
npm run check    # 所有包类型检查
```

## TODOLIST
