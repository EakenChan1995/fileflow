# FileFlow

一个本地运行的文件批处理工具箱。Electron + React + TypeScript，六个可独立使用的模块，所有操作都在本机完成，不上传任何数据。

核心设计原则是**先预览、后执行、可回滚**：任何写磁盘的操作都会先给出完整预览清单，执行前有二次确认，执行后可通过「操作历史」回滚；删除类操作一律走系统回收站。

---

## 功能

| 模块 | 能力 |
| --- | --- |
| **批量重命名** | 7 类规则按顺序组成管道：查找替换（含正则）、插入前后缀、序号（起始/步长/位数/分隔符）、大小写、截断、插入日期（当前时间或文件修改时间）、扩展名处理。预览会标出冲突项并自动跳过 |
| **图片批处理** | 格式转换（JPEG / PNG / WebP / AVIF）、质量压缩、缩放（百分比 / 限制最长边 / 固定宽高 + 5 种 fit 模式）。输出可放同目录、指定目录（可选保留相对结构）或覆盖原文件 |
| **重复文件清理** | 体积 → 快速哈希（首尾 64KB）→ 可选完整 SHA-256 三级收敛；支持保留最旧 / 最新 / 路径最短，可逐个调整，处理方式为回收站或移动到隔离目录 |
| **目录同步** | 源 → 目标单向增量同步，比较依据可选体积 / 体积+修改时间 / 内容哈希；镜像模式可删除目标端多余文件，逐项可勾选 |
| **文件整理** | 按类型（内置中文分类，可自定义映射）/ 修改日期 / 体积区间归档到子目录，移动或复制，同名冲突可自动重命名、跳过或覆盖 |
| **规则清理** | 按空文件、空目录、体积大于 N MB、超过 N 天未修改、指定后缀、文件名通配（`*`/`?`）筛选，命中结果列表确认后清理 |

另外提供 **操作历史**（最多 30 条，可回滚 / 删除记录）与 **设置**（并发数、执行前确认、最近目录）。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（Vite HMR + 主进程自动重启）
npm run dev

# 3. 类型检查 + 构建到 out/
npm run build

# 4. 以生产构建启动，验证打包前行为
npm run start

# 5. 打包当前平台安装包到 dist/
npm run dist
```

要求 Node.js 22+。首次安装会下载 Electron 二进制，国内网络可设置镜像：

```bash
# bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

---

## 目录结构

```
fileflow/
├── src/
│   ├── main/                    # 主进程（Node 环境）
│   │   ├── index.ts             # 窗口创建、进度广播绑定
│   │   ├── ipc/index.ts         # 全部 IPC handler（唯一的能力出口）
│   │   ├── lib/                 # 扫描 / 哈希 / 文件操作 / 任务调度 / 持久化
│   │   └── modules/             # 六个模块的纯逻辑（预览与执行分离）
│   ├── preload/index.ts         # contextBridge，向渲染进程暴露白名单 API
│   ├── shared/                  # 主进程与渲染进程共享的类型与常量
│   └── renderer/src/            # React 界面
│       ├── components/          # Sidebar / Footer / 通用控件 / 图标
│       ├── modules/             # 六个模块的面板
│       └── lib/taskbus.tsx      # 进度与日志总线
├── .github/                     # CI / Release / Issue / PR 模板
├── electron.vite.config.ts
└── tsconfig.json / tsconfig.node.json
```

---

## 架构

```
┌─────────────────────────┐   contextBridge    ┌──────────────────────┐
│  Renderer (React)       │◄──────────────────►│  Preload             │
│  只调用 window.api.*    │   window.api       │  invoke 白名单        │
└─────────────────────────┘                    └──────────┬───────────┘
                                                          │ ipcRenderer.invoke
                                               ┌──────────▼───────────┐
                                               │  Main (Node)         │
                                               │  ipc/index.ts        │
                                               │  ↓                   │
                                               │  modules/* 纯逻辑    │
                                               │  lib/* 基础能力      │
                                               └──────────┬───────────┘
                                                          │ webContents.send('task:progress')
                                               ┌──────────▼───────────┐
                                               │  Renderer 进度 / 日志 │
                                               └──────────────────────┘
```

几个关键决策：

- **渲染进程不接触 Node。** 全部能力经 `src/preload/index.ts` 白名单暴露，`contextIsolation: true`、`nodeIntegration: false`，界面层无法越权访问文件系统。
- **预览与执行分离。** 每个模块的 `preview` 只做只读扫描与计算并返回完整清单，`apply` 只负责按清单落地。UI 上对应「生成预览 → 确认 → 执行」三步。
- **统一任务执行器。** `lib/task.ts` 的 `runTask` 负责进度广播（带节流）、并发控制、取消与错误收集；单条失败不影响整批，错误最终汇总进 `TaskResult.errors`。
- **撤销栈。** 每次 `apply` 都把原子操作（`Op[]`）写入 `userData/undo/*.json`，回滚时逆序执行反向操作。不可逆的操作（回收站、覆盖原文件）会被标记 `reversible: false` 并拒绝自动回滚。
- **删除只进回收站。** 统一走 `shell.trashItem`，代码中不做直接 `unlink`。

### IPC 一览

| Channel | 说明 |
| --- | --- |
| `dialog:pickDirectory` / `dialog:pickFiles` / `dialog:confirm` | 原生对话框 |
| `fs:scan` / `fs:stat` | 目录扫描与属性读取 |
| `rename:preview` / `rename:apply` | 批量重命名 |
| `image:preview` / `image:apply` | 图片批处理 |
| `dedupe:scan` / `dedupe:pick` / `dedupe:remove` | 重复文件 |
| `sync:preview` / `sync:apply` | 目录同步 |
| `organize:preview` / `organize:apply` | 文件整理 |
| `clean:preview` / `clean:apply` | 规则清理 |
| `undo:list` / `undo:revert` / `undo:remove` | 操作历史 |
| `settings:get` / `settings:set` / `settings:recent` | 配置持久化 |
| `task:cancel` | 取消进行中的任务 |

---

## 安全与容错

- **预览优先**：没有预览就不会有写操作，预览阶段会标出所有冲突（目标已存在、批内重名），冲突项执行时自动跳过。
- **二次确认**：写操作前弹出原生确认框，可在设置中关闭。
- **回收站而非删除**：清理、去重、镜像删除都进系统回收站。
- **操作历史**：移动 / 重命名 / 复制均可回滚；回收站与覆盖类操作明确标注不可自动回滚。
- **失败隔离**：单个文件失败（权限、占用、路径过长）只记入错误列表，不影响其余文件。
- **并发可控**：默认 4 并发，可在设置中调整，避免一次打开过多文件句柄。

---

## 开发

```bash
npm run typecheck     # 主进程 + 渲染进程类型检查
npm run lint          # ESLint
npm run format        # Prettier 格式化
npm run build         # 构建到 out/
```

新增模块的完整步骤见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 已知限制

- 批量重命名不处理「链式冲突」（A→B 同时 B→C），这类情况会在预览中标为冲突并跳过。
- 覆盖模式的图片处理不可逆，会替换原图。
- 目录同步目前只支持单向（源 → 目标）。
- 界面暂未实现深色主题（设置项已预留）。

### 路线图

- [ ] 深色主题
- [ ] 规则与参数保存为「方案」，支持复用
- [ ] 重命名支持链式冲突自动拓扑排序
- [ ] 图片水印与 EXIF 保留开关
- [ ] 任务队列：多个批处理排队执行

---

## 技术栈

Electron 44 · React 19 · TypeScript 5 · Vite 7（electron-vite）· sharp · electron-builder

## 许可

[MIT](./LICENSE)
