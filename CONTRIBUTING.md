# 参与贡献

感谢你愿意改进 FileFlow。下面几条约定能让协作更顺畅。

## 开发环境

- Node.js 22+（推荐 22 LTS）
- npm 10+
- Windows / macOS / Linux 均可；打包 Windows 安装包需在 Windows 上执行

```bash
npm install
npm run dev        # 启动开发模式，带热更新
```

> 首次安装若 Electron 二进制下载缓慢，可设置镜像后重试：
> `npm config set electron_mirror https://npmmirror.com/mirrors/electron/`（Windows 用 `set ELECTRON_MIRROR=...`）

## 常用脚本

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（Vite HMR + 主进程自动重启） |
| `npm run typecheck` | 主进程与渲染进程分别做类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |
| `npm run build` | 类型检查 + 产出 `out/` |
| `npm run start` | 以生产构建启动，验证打包前行为 |
| `npm run dist` | 打包当前平台安装包到 `dist/` |

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
feat(rename): 支持按文件修改时间插入日期
fix(dedupe): 修正同体积文件被误判为重复的问题
docs: 补充目录同步的使用说明
refactor(ipc): 统一任务进度广播
chore(deps): 升级 electron 到 44.x
```

常用类型：`feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore`。
括号内为影响范围，一般填模块名（rename / image / dedupe / sync / organize / clean / undo / ui）。

## 新增一个批处理模块的步骤

1. 在 `src/shared/types.ts` 定义该模块的选项与结果类型。
2. 在 `src/main/modules/` 实现纯逻辑（**只读的预览函数** + 供执行阶段调用的原子操作）。
3. 在 `src/main/ipc/index.ts` 注册 `preview` / `apply` 两个 handler，`apply` 必须：
   - 用 `runTask` 包裹以广播进度；
   - 收集 `Op[]` 并调用 `saveUndo` 写入撤销记录；
   - 通过 `toResult` 返回统一的 `TaskResult`。
4. 在 `src/shared/api.ts` 与 `src/preload/index.ts` 暴露方法。
5. 在 `src/renderer/src/modules/` 新增面板，在 `Sidebar.tsx` 注册入口。
6. 更新 README 的模块清单。

## 代码约定

- 所有写操作必须「先预览，后执行」，且在 `apply` 前调用 `guard()` 做二次确认。
- 不允许在渲染进程中直接使用 Node API，一切经 preload 白名单。
- 删除一律走 `shell.trashItem`（进回收站），不要直接 `fs.unlink`。
- 主进程单条失败不应中断整批，错误统一收集到 `TaskResult.errors`。

## 提交 PR

请填写 PR 模板中的自检清单，确保 `typecheck`、`lint`、`build` 均通过。
