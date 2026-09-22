# @any-draft/desktop

稿域桌面端（Tauri 2）运行时包。桌面 WebView 复用 `@any-draft/web`
的 React 界面，通过 `VITE_APP_RUNTIME=tauri` 动态加载本包。

## 结构

- `src/`：`AppRuntime` 与 `ContentRepository` 的 Tauri 适配器。
- `src-tauri/`：Rust 文件系统服务、路径边界校验、原子写入和系统文件对话框。

桌面端直接使用用户选择的目录，不创建专用工作区格式。Markdown、图片和子目录
与磁盘完全同构；最近一次目录仅以路径形式保存在 Tauri 应用配置目录。

## 开发与构建

从仓库根目录运行：

```bash
npm run tauri:dev
npm run tauri:build:macos
npm run tauri:build:windows
```

- macOS 生产目标：Apple Silicon（`aarch64-apple-darwin`），输出 `.app` 与 `.dmg`。
- Windows 生产目标：x64（`x86_64-pc-windows-msvc`），输出 NSIS `.exe`。

macOS 当前使用 ad-hoc 签名，Windows 当前不签名，也未启用自动更新。正式外部分发前
需要分别配置 Apple 公证和 Windows 代码签名。
