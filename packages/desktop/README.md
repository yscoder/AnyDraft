# @any-draft/desktop

稿域桌面端（Tauri 2）壳包，**规划中、暂未实现**（对应 `docs/TAURI_DESKTOP_MIGRATION_PLAN.md` 阶段 2）。

按迁移计划，本包最终将包含：

- `src/`：`TauriRepository`（invoke 包装、二进制转换）等 Tauri 前端适配层。Web 应用（`@any-draft/web`）按 Vite `tauri` mode **动态导入**本包，纯 Web 构建不包含 `@tauri-apps/api`。
- `src-tauri/`：Rust crate（`commands` / `workspace` / `manifest` / `atomic_write` / `error`，见计划第 6.2 节）。

在阶段 2 开始前，本包保持占位，不参与构建与发布。
