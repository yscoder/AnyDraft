# 稿域 AnyDraft · Tauri 客户端改造方案

> 状态：方案稿  
> 编写日期：2026-09-21  
> 适用范围：当前 React 19 + TypeScript + Vite 7 项目  
> 目标：新增 Tauri 2 桌面客户端，将文章与图片保存到用户可见的本地工作区，同时继续提供现有纯 Web 版本

## 1. 结论摘要

建议采用“同一套前端 + 两个存储适配器 + 一个受限的 Tauri Rust 后端”的改造方式：

- 仓库已改为 npm workspaces monorepo：`packages/web` 是唯一的前端应用（Web 与未来的 Tauri WebView 共用），`packages/shared` 承载跨运行时纯逻辑（已含 `Draft` 领域类型与 ZIP 编解码，阶段 1 起补充 `ContentRepository` 接口与契约测试），`packages/desktop` 是 Tauri 壳包（当前占位、暂未实现）。root 只作为 workspace 管理者。
- 编辑器、Markdown 渲染、主题、复制公众号、长图导出等业务逻辑继续共用。
- Web 模式继续使用 `localStorage` 保存文章、IndexedDB 保存图片，现有 Cloudflare Pages 发布方式不变。
- Tauri 模式以用户选择的工作区目录为数据源，文章保存为 `.md` 文件，图片保存为普通图片文件，工作区清单只维护文章顺序、显示名称和图片名到文件的映射。
- 前端不直接操作任意绝对路径。Rust 进程保存当前工作区根目录，所有读写命令只接受文章 ID、图片逻辑名等业务参数，并在 Rust 侧校验真实路径始终位于工作区内。
- 先抽象存储层、确保 Web 行为不变，再引入 Tauri。不要直接在现有 `App.tsx` 中到处增加 `if (isTauri)`。

推荐分四个阶段落地，先完成无行为变化的 Web 重构，再接入桌面存储，最后补齐迁移、冲突处理与安装包发布。这样每一步都可以独立验证和回退。

## 2. 当前项目盘点

### 2.1 当前技术与数据流

| 项目 | 当前实现 | 改造影响 |
| --- | --- | --- |
| 前端 | React 19、TypeScript、Vite 7 | 可直接作为 Tauri WebView 前端复用 |
| 文章 | `App.tsx` 将完整 `Draft[]` 写入 `localStorage` | 需要移到统一仓储接口；Tauri 端改为 Markdown 文件 |
| 图片 | `imagedb.ts` 将“文件名 → data URI”写入 IndexedDB | Web 端保留；Tauri 端改为图片文件，并按需读取为 data URI |
| 图片引用 | 支持 `![[文件名]]` 和 `![](相对路径)` | 可以继续使用逻辑图片名，不必修改现有 Markdown 语法 |
| 导入导出 | 浏览器内处理 `.md`、`.zip`、长图并触发下载 | 编解码逻辑可复用，保存目标需抽象为 Web 下载或桌面文件对话框 |
| 发布 | Vite 构建后直传 Cloudflare Pages | 保留；另外增加 Tauri 开发、构建和签名流程 |

### 2.2 当前实现中需要先处理的问题

1. `App.tsx` 同时承担状态管理、浏览器持久化、迁移、导入导出和 UI 事件，直接接 Tauri 会形成大量运行时分支。
2. `Draft` 类型在 `App.tsx` 和 `components/FileTree.tsx` 中重复定义，`exchange.ts` 又从组件文件导入业务类型。改造前应把领域类型移到独立文件。
3. 当前初始化是同步读取 `localStorage`；桌面工作区初始化、磁盘扫描和图片读取都是异步操作，需要增加明确的启动状态。
4. 当前保存是 300 ms 防抖后覆盖整份草稿列表。桌面端不能把异步文件写入当成同步 `localStorage`，否则可能出现旧请求晚于新请求落盘的问题。
5. 当前启动时把全部图片读成 data URI 放入内存。图片落盘后如果仍全量读取，会抵消文件存储的容量优势，应拆分“图片元数据列表”和“当前文章实际使用的图片数据”。

## 3. 目标与非目标

### 3.1 本次目标

- macOS、Windows、Linux 共用同一份桌面代码；首发平台可以由发布计划另行决定。
- 首次启动桌面端时，让用户选择或创建一个工作区目录。
- 文章与图片以普通文件形式保存在该目录，复制、备份、迁移不依赖 WebView 缓存。
- Web 与桌面端保持一致的编辑、预览、主题、复制公众号、导入、备份和长图能力。
- 桌面端异常退出后，已确认保存成功的数据不损坏；关键元数据采用原子写入。
- 明确处理浏览器数据迁移、同名图片、外部修改和写入失败。
- 权限遵循最小化原则，桌面前端不能访问工作区以外的文件。

### 3.2 本次非目标

- 不做云同步、账号系统和多端实时协作。
- 不把项目改成服务端应用，纯 Web 版仍是静态站点。
- 不在首期支持同时打开多个工作区或多个窗口编辑同一工作区。
- 不在首期承诺与 Obsidian、Typora 的双向项目级兼容；只保证 Markdown 文件可读、已跟踪文件的内容可被外部编辑。
- 不在本次改造中重写 Markdown 渲染器、主题系统或 ZIP 格式。

## 4. 总体架构

```text
React UI / 编辑器 / Markdown 渲染 / 导入导出编解码
                         |
                  ContentRepository
                  /               \
      BrowserRepository         TauriRepository
       /            \                 |
localStorage      IndexedDB       Tauri invoke
                                        |
                              Rust WorkspaceService
                                        |
                         工作区中的 Markdown / 图片文件
```

核心原则是让业务层只依赖 `ContentRepository`，不知道底层是浏览器存储还是本地文件系统。运行模式在应用启动时确定一次，不在组件内部反复判断。

### 4.1 运行模式选择

建议使用构建模式，而不是检测私有全局变量：

- `npm run dev`、`npm run build`：Web 模式。
- `npm run tauri:dev`：Tauri 开发模式，Vite 使用 `tauri` mode。
- `npm run tauri:build`：Tauri 生产构建，Vite 使用 `tauri` mode。
- 通过 `import.meta.env.VITE_APP_RUNTIME` 选择仓储实现。
- `TauriRepository` 使用动态导入，避免纯 Web 首屏加载 Tauri API，也避免 Web 构建执行桌面专属代码。

`vite.config.ts` 改为函数配置，根据 Vite `mode` 在构建时将 `VITE_APP_RUNTIME` 定义为 `tauri` 或 `web`，不依赖本机未提交的 `.env` 文件。`createRepository` 只接受这两个值，其他值在启动时直接报错。Tauri 适配器初始化时还必须调用一个轻量 `get_runtime_info` 命令做握手；如果桌面包误构建成 Web 适配器，或 Web 页误选 Tauri 适配器，都在启动页明确失败，不静默回退到另一存储。CI 再扫描 Web 产物，确认不包含 `@tauri-apps/api` 主包和桌面初始化代码。

Tauri 官方推荐通过 `beforeDevCommand`、`devUrl`、`beforeBuildCommand` 和 `frontendDist` 接入现有 Vite 工程，本项目可继续使用当前 `dist` 目录，不需要另建一套桌面前端。

### 4.2 建议的前端仓储接口

接口应围绕业务动作设计，不暴露“任意路径读写”：

```ts
interface ContentRepository {
  readonly kind: 'browser' | 'tauri';

  initialize(): Promise<EditorSnapshot>;

  createDraft(input: { name: string; content: string }): Promise<Draft>;
  saveDraft(input: {
    id: string;
    content: string;
    baseRevision: string;
    conflictToken?: string;
  }): Promise<{ updatedAt: number; revision: string }>;
  renameDraft(id: string, name: string): Promise<Draft>;
  deleteDraft(id: string): Promise<void>;
  setDraftOrder(ids: string[]): Promise<void>;

  listImages(): Promise<ImageMeta[]>;
  resolveImages(names: string[]): Promise<{
    images: Record<string, string>;
    missing: { name: string; reason: 'not-found' | 'corrupt' | 'unsupported' }[];
  }>;
  putImage(input: { name: string; mime: string; bytes: Uint8Array }): Promise<ImageMeta>;
  deleteImage(name: string): Promise<void>;

  exportFile(input: { suggestedName: string; bytes: Uint8Array }): Promise<'saved' | 'cancelled'>;
}
```

说明：

- `EditorSnapshot` 可以包含所有文章正文，因为 Markdown 通常较小；图片只返回元数据，不全量返回 data URI。
- `resolveImages` 只解析当前文章实际引用的图片。切换文章后重新计算引用集合，并维护一个有上限的内存缓存。
- `baseRevision` 是正常保存的必填参数，用于避免外部编辑或异步乱序保存被静默覆盖。Web 适配器可以用递增版本号实现，Tauri 适配器可由文件修改时间、大小和内容哈希组合生成。
- 用户确认“覆盖磁盘版本”时，后端先针对当前冲突返回短时有效的 `conflictToken`；该 token 绑定文章 ID 和产生冲突时观察到的磁盘 revision，任一者改变就失效。前端不能通过省略 revision 来强制写入。
- UI 偏好，如主题、排版密度、预览设备和最后打开的文章，可继续留在各运行时自己的 `localStorage`；它们不是用户正文数据，不必放入工作区。

### 4.3 状态管理调整

无需为这次改造引入新的全局状态库。建议：

- 新建 `useEditorStore` 或同等自定义 Hook，负责异步初始化、仓储调用、保存状态和错误状态。
- `App.tsx` 保留页面编排与纯 UI 状态，不再直接访问 `localStorage`、IndexedDB 或 Tauri API。
- 启动状态明确区分 `booting`、`ready`、`needs-workspace`、`error`。
- 每篇文章维护 `clean`、`dirty`、`saving`、`saved`、`failed`、`conflict` 六种保存状态，工具栏至少显示“保存中 / 已保存 / 保存失败”。

## 5. 桌面工作区格式

### 5.1 目录结构

建议的 v1 格式：

```text
AnyDraftWorkspace/
├── anydraft-workspace.json
├── anydraft-workspace.json.bak
├── articles/
│   ├── d_01J....md
│   └── d_01K....md
├── images/
│   ├── i_a13fd812.png
│   └── i_90bb13c4.jpg
└── .anydraft-trash/                 # 桌面端软删除目录
```

设计说明：

- 文章和图片都是普通文件，工作区可整体复制、压缩和备份。
- 物理文件名使用稳定 ID，展示名放在清单中。这牺牲了一点目录可读性，但能避免重命名时的多文件事务、跨平台保留名和大小写冲突。Markdown 内容仍可用普通编辑器打开。
- Markdown 正文仍写 `![[封面.png]]` 或 `![](封面.png)`；`anydraft-workspace.json` 负责把逻辑名映射到真实图片文件。
- 临时文件写在目标文件同一目录中，成功后原子替换；启动时可清理遗留的 `*.tmp`。
- `anydraft-workspace.json.bak` 保留上一份已验证的清单。轮换顺序在 5.3 节统一定义。
- 工作区格式必须带 `schemaVersion`，以后升级格式时做显式迁移。
- 迁移函数按 `vN -> vN+1` 逐级执行，每步必须幂等。迁移前先生成带版本和时间戳的工作区备份，中断后只允许继续或回滚；高于当前应用的 schema 禁止写入。

### 5.2 清单格式

示例：

```json
{
  "schemaVersion": 1,
  "workspaceId": "w_01J...",
  "articles": [
    {
      "id": "d_01J...",
      "name": "第一篇文章",
      "file": "articles/d_01J....md"
    }
  ],
  "images": [
    {
      "name": "封面.png",
      "lookupKey": "封面.png",
      "file": "images/i_a13fd812.png",
      "mime": "image/png",
      "size": 182340
    }
  ]
}
```

约束：

- 清单只存索引和元数据，不复制文章正文或图片内容。
- `updatedAt` 优先取文件元数据，避免每次输入都重写清单。
- 文章 ID 和物理文件名一经创建不变；重命名只修改清单中的展示名。
- 图片逻辑名继续保持当前“一名对应一张图”的模型。同名新图导入时必须让用户选择“替换”或“保留两张并自动改名”，不能静默覆盖。
- 清单损坏时，先读取最近一次有效备份；仍无法恢复时，只能扫描 `articles/*.md` 和 `images/*` 生成新的“尽力恢复”目录，并报告无法还原的文章显示名、图片逻辑名和引用。恢复过程不覆盖原目录，不删除未知文件。

### 5.3 写入一致性

文章保存流程：

1. 前端防抖 300–500 ms 后把当前内容和必填的 `baseRevision` 发送给仓储。
2. 同一文章的保存请求进入串行队列；新内容可以合并尚未开始的旧请求。A 保存成功并返回 R1 后，排队的 B 必须自动把 base revision 从 R0 更新为 R1，避免伪冲突。
3. Rust 校验文章存在、工作区已打开、当前 revision 与 base revision 一致。
4. 写入目标文件的同目录临时文件，同步临时文件，替换前再比较一次 revision，替换目标文件，再同步目标父目录。Rust 实现需封装 Windows 与 Unix 对“替换已存在文件”和持久化的差异。
5. 完成上述同步后才返回新 revision；只有收到成功结果，UI 才显示“已保存”。关闭窗口时如仍有 dirty/saving 文章，必须等待落盘或提示用户，不直接退出。

这个协议能防止应用内部乱序和大多数外部覆盖，但不声称能阻止不遵守文件锁的第三方程序在最后校验与替换之间竞争写入。用户强制覆盖冲突时，先将磁盘版本保存到 `.anydraft-trash/conflicts/<article-id>-<timestamp>.md`，以便手工恢复。

所有原子文件写入都共用“写同目录临时文件 → 同步临时文件 → 替换 → 同步父目录 → 返回成功”协议。清单更新时，先写并验证新的 `anydraft-workspace.json.tmp`，再把当前有效主清单按同一协议覆盖到 `.bak`，最后用已验证的临时文件替换主清单。启动时总是先验证主清单，主清单无效或缺失才读 `.bak`。Unix 上同步目录，Windows 上用支持替换已有目标的 API 或专用 crate；两个平台都要有每一故障点的恢复测试。

跨多文件的结构操作不宣称为全局原子事务，而是用不会覆盖旧数据的顺序：

- 新建：先写新 ID 文件，再更新清单；崩溃最多留下可识别的孤儿文件。
- 重命名：只更新清单，不重命名稳定 ID 文件。
- 图片替换：先写新 ID 图片，再切换清单映射，最后将旧文件移入回收目录。
- 删除：先从清单移除，再移入 `.anydraft-trash/<timestamp>/`；崩溃留下的未索引文件只在下次启动时报告，不自动删除。

## 6. Tauri 后端设计

### 6.1 为什么使用自定义 Rust 命令

Tauri 2 的文件系统插件支持 scope 和 capability，但本项目的前端只需要少量确定的业务操作。使用自定义命令有三个好处：

- 前端只能说“保存文章 d_xxx”，不能说“写入 `/任意路径`”。
- 路径拼接、规范化、符号链接检查和原子写入集中在 Rust 侧。
- Web 与桌面仓储接口保持一致，权限模型也更容易审计。

建议命令：

```text
choose_workspace
create_workspace
reopen_last_workspace
get_runtime_info
get_workspace_snapshot
create_draft
save_draft
rename_draft
delete_draft
set_draft_order
list_images
read_images
put_image
delete_image
export_bytes
```

命令参数不应包含文章、图片或导出目标的最终绝对路径。`choose_workspace`、`create_workspace`、`export_bytes` 由 Rust 侧自行打开系统对话框并在同一命令中完成操作；不接受前端声称“来自对话框”的路径。`reopen_last_workspace` 只能打开 Rust 从自身 app config 读取的最近路径。

### 6.2 Rust 模块划分

```text
packages/desktop/src-tauri/
├── capabilities/default.json
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── lib.rs
    ├── commands.rs
    ├── workspace.rs
    ├── manifest.rs
    ├── atomic_write.rs
    └── error.rs
```

- `workspace.rs`：维护当前根目录、解析业务 ID、读写文章和图片。
- `manifest.rs`：清单结构、版本校验、迁移和恢复。
- `atomic_write.rs`：同目录临时文件与原子替换。
- `commands.rs`：Tauri IPC 的薄封装，不堆业务规则。
- `error.rs`：返回稳定错误码，如 `WORKSPACE_NOT_OPEN`、`CONFLICT`、`INVALID_NAME`、`IO_FAILED`，前端按错误码显示信息，不解析 Rust 错误字符串。

### 6.3 权限与安全边界

- 只启用主窗口需要的 command、文件对话框和剪贴板能力。
- 不授予 shell 执行、任意网络访问或全磁盘文件系统权限。
- 当前工作区路径放在 Rust managed state 中；CRUD 命令只从该根目录向下解析。
- 打开工作区时固定 canonical root。读取既有文件时规范化后验证仍是根目录后代；创建新文件时校验已存在的父目录。逐级拒绝符号链接/Windows reparse point，拒绝 `..`、绝对子路径、NUL 和设备名。如实现库支持，优先使用目录句柄相对操作降低 TOCTOU 风险。
- 物理文件名由后端生成，显示名称永远不直接当作路径。
- 图片首期接受 PNG/JPEG/GIF/WebP/AVIF，单个源文件默认不超过 25 MB；MIME 以文件签名检测结果为准，不只相信扩展名。SVG 首期拒绝或先在前端栅格化为 PNG，不作为可主动执行的本地文档直接导入。
- ZIP 导入对条目名做 Zip Slip 校验，拒绝重复目标路径、加密条目和未支持压缩方式。建议初始上限为：2,000 个条目、500 MB 解压后总量、单个 Markdown 10 MB；超限前停止写盘。
- 当前 `markdown.ts` 启用了 `html: true`。这在 Tauri WebView 中会把文章中的恶意 HTML 放大为 IPC 权限风险，因此接入 Tauri 前必须对最终 HTML 做明确允许列表消毒：禁止 `script/iframe/object/embed`、事件属性、`javascript:` URL 和未授权导航；仅保留编辑器需要的标签、属性和内联样式。消毒必须覆盖预览、复制和长图三条路径。
- 设置合理 CSP。业务需要 `data:` 和 `blob:` 图片以及内联样式，但不需要放开内联脚本或远程脚本。
- 工作区绝对路径可以保存在 Tauri app config 中；正文和图片不存入 app data，也不写入 WebView 缓存。

### 6.4 工作区状态与锁

| 输入状态 | 行为 |
| --- | --- |
| 用户选择空目录 | 确认后创建 v1 清单和子目录 |
| 非空目录且无清单 | 不原地接管；提示选择空目录或进入“尽力导入到新目录” |
| 清单为当前版本 | 校验并打开 |
| 清单版本较旧 | 先备份，在新目录或可回滚的迁移流程中升级 |
| 清单版本高于当前应用 | 只读提示并要求升级应用，绝不扫描后覆盖 |
| 清单损坏 | 尝试 `.bak`；失败则只能恢复到新目录 |
| 目录只读或失效 | 以只读打开或要求重新选择，不伪装保存成功 |

桌面端打开工作区时创建带进程信息的 `.anydraft.lock` 并持有 OS 文件锁。第二个稿域进程只能只读打开或取消，不得同时写入。锁文件内容只用于提示，是否陈旧以 OS 锁能否成功获取为准，避免崩溃后因遗留文件永久锁死。

## 7. 图片加载与渲染

当前 `renderArticle` 接收 `Record<string, string>`，值是 data URI；复制到公众号和长图导出也依赖图片最终可内嵌。为了保留这一行为，首期不改 Markdown 渲染接口，但改变图片装载方式：

1. 启动时只加载 `ImageMeta[]`，供文件树、容量统计和自动补全使用。
2. 当前文章变化时用 `collectImageRefs` 得到所需逻辑名。
3. 调用 `resolveImages(names)` 读取这些图片并转换为 data URI；返回值同时列出缺失、损坏和不支持的项。
4. 在图片准备完成前显示“图片加载中”；完成后，失败项显示带原因的缺图占位。
5. 复制公众号、导出长图之前强制等待当前文章全部图片解析完成。
6. 缓存只保留当前文章和最近使用的图片，初始预算 128 MB，超过后按 LRU 释放；当前文章所需图片不在渲染中途释放。

新导入的图片逻辑名统一为 Unicode NFC，匹配保持大小写敏感，并继续支持当前的 `![[name]]` 与 `![](relative/name)` basename 回退。导入旧备份时保留原逻辑名，并在清单显式存储 NFC `lookupKey`，避免直接改写旧 Markdown。解析时先做原名精确匹配；只有 lookup key 唯一时才做规范化回退。两个旧名称如果规范化后碰撞，禁用该 key 的回退匹配并记入导入报告，不静默指向任意一张。同名图片选择“保留两张”后，由仓储返回最终逻辑名，编辑器插入的引用必须使用该返回值。

后续若图片规模明显增大，可以让预览使用受限 asset protocol 或 blob URL，只在复制/长图导出时转 data URI。首期不建议同时改变存储层和渲染协议，风险过高。

## 8. Web 模式保留策略

`BrowserRepository` 复用当前数据和 key，不做破坏性迁移：

- 继续读取 `anydraft:drafts` 和 `anydraft:active-draft`。
- 继续读取 IndexedDB `anydraft / images`。
- 浏览器端导入、导出、复制和长图行为保持不变。
- Web 构建中不出现 Rust 依赖，也不要求浏览器提供 Tauri 全局对象。
- `npm run build` 和 `npm run deploy` 的语义保持不变，避免影响现有 Cloudflare Pages 手工发布流程。

建议为仓储接口写一组契约测试，同一套用例同时验证 `BrowserRepository` 和 `TauriRepository` 的语义，例如新建、重命名、同名图片、删除被引用图片和保存冲突。

## 9. 导入、导出与数据迁移

### 9.1 浏览器到桌面端

桌面应用无法也不应该直接读取用户常用浏览器站点的 localStorage 和 IndexedDB，因此迁移边界沿用现有备份包：

1. 用户在 Web 版导出“全部备份 `.zip`”。
2. 在桌面版首次启动页选择“从稿域备份恢复”。
3. 桌面端解析现有 `manifest.json`，把文章和图片写入选定工作区。
4. 导入完成后展示文章数、图片数、跳过项和重名处理结果。

这是首期唯一可靠的浏览器迁移方案。不要宣传“自动搬迁浏览器数据”。

### 9.2 桌面端导入

- `.md`、`.markdown`、`.txt`：继续按一文件一文章导入。
- `.zip`：兼容当前 `BACKUP_VERSION = 1` 格式。
- 图片拖拽/粘贴：前端可以继续降采样，但应把二进制而不是完整 data URI 交给 Tauri 仓储落盘。
- 所有导入先做解析、容量检查和冲突规划，用户确认后再逐项落盘。v1 明确采用“每项原子、批次允许部分成功”：结果返回已创建 ID、失败项和冲突决策，重试只处理失败项，不再复制已成功内容。
- v1 ZIP 中的文章顺序按 manifest 保留，但所有文章和图片重新分配本工作区物理 ID；逻辑图片名、MIME 和文章 `updatedAt` 尽量保留。非法 MIME、重复逻辑名和缺失条目都进入导入报告。

### 9.3 桌面端导出

- 当前文章 `.md`：使用系统“另存为”对话框；取消不算错误。
- 长图 `.png`：前端继续生成 Blob，再通过 `exportFile` 保存。
- 全量 `.zip`：首期复用现有 ZIP 编解码，仓储按需读取全部图片后生成备份；如果大型工作区出现性能问题，再把 ZIP 流式生成移到 Rust。
- 工作区本身已经可直接备份，但 `.zip` 仍需保留，用于 Web 版互通和版本迁移。

## 10. 外部修改与冲突

本地目录意味着文件可能被其他编辑器修改，不能继续假设应用是唯一写入者。

v1 建议实现：

- 应用启动、窗口重新获得焦点和执行保存前检查 revision。
- 文件在本地无未保存修改时，检测到外部变化可自动重新读取并提示。
- 文件在本地为 dirty 时，检测到 revision 不一致则停止覆盖，提供“载入磁盘版本”“另存为冲突副本”“保留编辑器版本并覆盖”三个动作。
- 外部新增的文件首期不自动进入清单；用户通过导入操作注册。外部删除或移动已跟踪文件时，在文件树显示“文件缺失”，由用户选择移除索引或重新定位。
- 递归文件监听可以列入第二阶段优化。首期使用聚焦时扫描，跨平台行为更简单，也足以避免多数静默覆盖。

## 11. 前端文件调整建议

仓库已是 npm workspaces monorepo（路径相对仓库根），当前已完成的拆分：`packages/web` 为完整 Web 应用，`packages/shared` 已迁入 `Draft` 领域类型与 ZIP 编解码，`packages/desktop` 为占位包。后续阶段建议新增或调整以下文件，名称可在实现时按项目风格微调：

```text
packages/
├── shared/src/                  # @any-draft/shared：跨运行时纯逻辑
│   ├── domain.ts                # 已有 Draft；阶段 1 补充 ImageMeta、EditorSnapshot、错误码
│   ├── zip.ts                   # 已有：ZIP 编解码
│   ├── content.ts               # 阶段 1：ContentRepository 接口
│   └── contract/                # 阶段 1：仓储契约测试套件
├── web/src/                     # @any-draft/web：唯一前端应用
│   ├── repositories/
│   │   ├── browser.ts           # 阶段 1：localStorage + IndexedDB 实现
│   │   └── createRepository.ts  # 按构建模式选择实现
│   ├── hooks/
│   │   └── useEditorStore.ts    # 初始化、保存队列、冲突与错误状态
│   ├── core/                    # 编辑器、Markdown 渲染、主题、导入导出等应用逻辑
│   ├── exchange.ts              # 保留纯编解码逻辑
│   ├── download.ts              # Web 下载实现，或并入 BrowserRepository
│   └── App.tsx                  # 只组合 UI 和仓储动作
└── desktop/                     # @any-draft/desktop：阶段 2
    ├── src/tauri.ts             # TauriRepository：invoke 包装与二进制转换（动态导入）
    └── src-tauri/               # Rust crate，见 6.2
```

现有文件的具体处理：

- `core/drafts/types.ts`、`core/transfer/zip.ts`：已迁入 `packages/shared`（分别对应 `src/domain.ts`、`src/zip.ts`），web 内引用统一改为 `@any-draft/shared`。
- `imagedb.ts`：内容迁入 `BrowserRepository` 或作为其内部依赖，不再由 `App.tsx` 直接调用。
- `exchange.ts`：拆开“生成/解析数据”和“触发浏览器下载”，便于桌面端复用编解码。
- `FileTree.tsx`：只接收统一的 `DraftSummary[]` 和 `ImageMeta[]`，不通过 data URI 计算图片大小。
- `images.ts`：让图片处理函数额外返回 MIME 与 `Uint8Array`；Web 适配器需要 data URI 时再编码。
- `App.tsx`：删除直接的 storage key、迁移函数和图片数据库调用。
- `vite.config.ts`：保持 `base: './'`，增加必要的 mode 配置，不复制一份桌面配置；当前已包含 workspace 链接包（`@any-draft/shared`）所需的 `server.fs.allow` 与 `optimizeDeps.exclude` 配置。

## 12. 构建与发布

### 12.1 建议脚本

```json
{
  "scripts": {
    "dev": "npm run dev -w @any-draft/web",
    "build": "npm run build -w @any-draft/web",
    "deploy": "npm run deploy -w @any-draft/web",
    "dev:tauri-ui": "npm run dev:tauri-ui -w @any-draft/web",
    "build:tauri-ui": "npm run build:tauri-ui -w @any-draft/web",
    "tauri:dev": "npm run tauri:dev -w @any-draft/desktop",
    "tauri:build": "npm run tauri:build -w @any-draft/desktop",
    "check": "npm run check --workspaces --if-present && cargo check --manifest-path packages/desktop/src-tauri/Cargo.toml",
    "test": "npm run test --workspaces --if-present",
    "test:rust": "cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml"
  }
}
```

最终脚本以 Tauri 初始化生成的配置为准，但必须满足：

- `npm run build` 仍只构建纯 Web 版。
- `npm run deploy` 不隐式构建桌面安装包。
- `tauri.conf.json` 的 `beforeDevCommand` 指向 `npm run dev:tauri-ui`，`beforeBuildCommand` 指向 `npm run build:tauri-ui`，桌面构建因此显式使用 Tauri mode。
- Rust 与 npm 锁文件都提交版本库，保证可重复构建。

### 12.2 发布产物

- Web：继续输出 `dist/` 并部署到 Cloudflare Pages。
- macOS：`.app` / `.dmg`，正式分发需要签名和公证。
- Windows：NSIS 或 MSI，正式分发建议代码签名。
- Linux：按目标用户选择 AppImage、deb 或 rpm。
- 桌面版本号由 `package.json`、`tauri.conf.json` 和 Cargo package 保持一致，建议增加校验脚本。
- 自动更新不属于首期存储改造的必要条件，可在签名和发布渠道稳定后再接入。

## 13. 分阶段实施计划

### 阶段 0：建立基线

工作：

- 记录现有 Web 功能清单和一份可重复使用的 `.zip` 测试备份。
- 为 Markdown/ZIP 导入导出、图片引用收集和旧数据迁移补关键测试。
- 明确首发桌面平台、应用标识符、图标、签名主体和默认工作区推荐位置。

验证：

- 当前 `npm run build` 通过。
- 测试备份可在改造前版本导出并重新导入。

### 阶段 1：抽取存储层，Web 行为不变

工作：

- 统一 `Draft`、`ImageMeta` 等类型。
- 引入 `ContentRepository` 与 `BrowserRepository`。
- 把 `App.tsx` 中的 localStorage/IndexedDB 操作迁出。
- 把导入导出编解码与浏览器下载拆开。
- 改造图片列表为元数据，当前文章按引用解析图片。

验证：

- 所有现有功能在浏览器中行为一致。
- 旧 localStorage 和 IndexedDB 数据能原地加载。
- `npm run build` 通过，Cloudflare Pages 预览可用。

### 阶段 2：Tauri 壳与本地工作区

工作：

- 初始化 Tauri 2 目录和构建配置。
- 实现工作区选择、清单、文章 CRUD、图片 CRUD 和原子写入。
- 实现 `TauriRepository`，增加启动页和保存状态提示。
- 增加工作区路径校验、错误码和 Rust 单元测试。

验证：

- 断网状态下可创建、编辑、关闭并重新打开文章。
- 磁盘上的 Markdown 和图片文件与 UI 一致。
- 尝试通过恶意名称或参数访问工作区外文件会被拒绝。

### 阶段 3：导入导出与迁移闭环

工作：

- 接通 `.md`、`.zip`、图片拖拽/粘贴和桌面“另存为”。
- 用 Web 版导出的 v1 备份恢复桌面工作区。
- 增加同名图片处理、清单恢复、磁盘满和只读目录错误提示。
- 增加 revision 冲突处理和聚焦时刷新。

验证：

- Web → 桌面 → ZIP → Web 的往返后，文章内容、名称、顺序和图片均一致。
- 取消文件对话框不会显示失败。
- 模拟写入失败不会丢失上一次完整文件。

### 阶段 4：打包与发布

工作：

- 在目标平台构建安装包并做真机烟测。
- 配置图标、应用标识符、版本同步、签名和发布说明。
- 更新 README，区分 Web 开发、桌面开发、Web 发布和桌面发版。

验证：

- 全新系统安装、升级和卸载行为符合预期；卸载不删除用户选择的工作区。
- Web 部署不包含桌面专属运行时代码。

## 14. 测试方案

### 14.1 单元测试

- 清单 schema 校验、版本迁移和损坏恢复。
- 跨平台安全文件名、保留名、超长名、大小写冲突。
- 路径越界、符号链接越界和非法参数拒绝。
- 第二进程打开同一工作区、崩溃后锁恢复和只读打开。
- 同一文章保存队列的时序，确保最后一次输入最终落盘。
- revision 冲突与三种用户选择。
- 图片逻辑名映射、替换、自动改名和未引用清理。
- 现有 ZIP v1 的导入与导出往返。
- Zip Slip、重复条目、解压炸弹和过高 schema 版本被拒绝。
- 含 `script`、事件属性、`javascript:` URL 的 Markdown/HTML 在预览、剪贴板和长图路径都不能执行。

### 14.2 仓储契约测试

对 Browser 和 Tauri 两种实现运行同一组行为用例：

- 空仓库初始化。
- 新建、保存、重命名、排序、删除文章。
- 添加、解析、替换、删除图片。
- 被引用图片删除后的统一表现。
- 导入后 ID 不冲突。

### 14.3 端到端测试

- Web：首次使用、旧数据升级、刷新后恢复、备份往返。
- 桌面：首次选择目录、重启恢复、目录只读、磁盘写入失败、外部修改冲突。
- 共通：粘贴图片、拖拽图片、复制公众号、导出长图、中文和特殊字符文件名。
- 大数据：至少 100 篇文章、500 张图片和单张接近上限的图片。在团队约定的基准机器上，冷启动到可编辑目标不超过 2 s，不含图片解码的文章切换 P95 不超过 300 ms，图片 data URI 缓存不超过 128 MB。

## 15. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 直接在组件中混入 Tauri 分支 | 后续 Web/桌面行为逐渐分叉 | 以仓储接口作为唯一运行时边界 |
| 异步自动保存乱序 | 新内容被旧请求覆盖 | 每文章串行队列 + revision |
| 启动时加载所有 data URI | 大工作区内存过高、启动慢 | 图片元数据与内容分离，按引用加载 |
| 清单与文件不一致 | 文章丢失或列表损坏 | 原子写入、稳定 ID、恢复扫描、未知文件不删除 |
| 工作区路径越界 | 本机文件安全问题 | 后端生成路径、规范化、后代校验、最小权限 |
| 浏览器数据无法自动读取 | 用户误以为安装后会自动出现旧稿 | 首次启动明确提供“从 Web 备份恢复” |
| 桌面下载 API 与浏览器不同 | 导出按钮失效或保存位置不明 | `exportFile` 抽象 + 系统另存为对话框 |
| 外部编辑产生覆盖 | 用户修改静默丢失 | revision 检测、聚焦扫描、显式冲突处理 |

## 16. 验收标准

满足以下全部条件后，可以认为改造完成：

1. `npm run build` 仍生成可独立部署的纯静态 Web 版，现有 Cloudflare Pages 流程不变。
2. Tauri 安装包无需网络即可完成文章创建、编辑、重启恢复、图片粘贴和预览。
3. 桌面端文章和图片确实存在用户选定的目录中，清理 WebView 缓存不会丢失正文数据。
4. Web 版现有 localStorage/IndexedDB 数据无需手工转换即可继续使用。
5. Web 导出的现有 v1 ZIP 可恢复到桌面端，桌面导出的 ZIP 也可导回 Web 端。
6. 复制公众号与长图导出在两种运行模式下均能正确包含本地图片。
7. 连续快速输入后重启应用，磁盘内容是最后一次显示“已保存”的版本。
8. 工作区外路径读写、`../`、绝对子路径和越界符号链接均被拒绝。
9. 应用能检测到的外部修改冲突不会被静默覆盖，写入失败不会破坏上一次完整文件；不对恶意第三方程序的竞争写入做绝对保证。
10. 第二个稿域进程不能同时写同一工作区。
11. 未信任 Markdown/HTML、图片和 ZIP 不能执行脚本、越界写文件或绕过容量上限。
12. README 包含 Web 与桌面两套开发、构建、测试和发布说明。

## 17. 实施前需要确认的产品决策

这些决策不阻塞存储层抽取，但应在阶段 2 开始前确认：

- 首个正式安装包支持哪些平台，是否需要签名和自动更新。
- 首次启动是强制用户选择工作区，还是默认建议“文档/AnyDraft”并允许修改。建议让用户明确确认目录，不静默创建。
- 同名图片的默认策略。建议默认“保留两张并自动改名”，由用户主动选择替换。
- 是否把“外部新增 Markdown 自动进入列表”列入首发。建议首期不做，只处理已跟踪文件的外部修改。

## 18. 参考资料

- [Tauri：与现有 Vite 前端集成](https://v2.tauri.app/start/frontend/vite/)
- [Tauri：从前端调用 Rust 命令](https://v2.tauri.app/develop/calling-rust/)
- [Tauri：文件系统插件与路径 scope](https://v2.tauri.app/plugin/file-system/)
- [Tauri：命令 scope 安全模型](https://v2.tauri.app/security/scope/)
