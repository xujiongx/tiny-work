# 案头 · 个人工作台

一个本地优先的个人工作台桌面应用：记录每天做了什么、管理今天要做的事、按项目归档，并最终自动生成周报。所有数据留在本机，没有账号，没有云同步。

基于 [tinyjs](https://tinyjs.app)：WebView 前端 + txiki.js 后端 + SQLite。前端无框架、无构建、无 npm 依赖。

> 当前进度：**M0–M6 + 绩效评价模块已完成**，具备日常使用和 v0.1 交付所需的完整闭环。
> 下一步是 M7：真机走查、性能/备份演练与打包发布。规划见 [docs/05-开发计划.md](docs/05-开发计划.md)。

---

## 已经能做什么

- **今日**：一句话快速记录（类型、项目、标签、耗时）、时间线行内编辑、删除撤销、今日待办、概览、日报抽屉
- **记录**：月历浏览、按日分组、全文搜索、类型/项目/标签/日期范围组合筛选、分页、下钻
- **任务**：今天 / 接下来 / 收集箱 / 已完成，优先级、截止日、预计耗时、项目、拖拽排序、完成自动记一条
- **项目**：新建（5 种颜色）、详情、描述、归档/恢复、删除（记录不级联删除）、本周记录/未完成/最近时间
- **回顾**：周/月/自定义区间统计、项目/类型/标签分布、12 周热力图、心情与能量趋势、下钻
- **周报/月报**：确定性 Markdown 草稿，可编辑、复制、导出 `.md`
- **绩效**：按季度维护“考核维度 / 评语 / 下季度期望及要求”，根据 2026 Q3 评价表自动生成首份数据，支持编辑、定稿、签字、复制与导出
- **片段**：命令/文本/链接片段，搜索、复制、编辑、删除；记录可一键存为片段
- **专注**：15–90 分钟计时、进行中/放弃/完成、完成后自动记入记录、托盘倒计时
- **系统**：应用菜单、托盘、全局快速记录小窗（`⌘⇧Space`）、工作日提醒、自动备份、深色/跟随系统
- **数据**：SQLite 本地存储、JSON 全量导出/导入（合并/替换 + 自动备份）、旧便签 `.txt/.md` 按行导入

绩效评价的初始内容来自 `assets/徐炯-青牛智胜2026年Q3个人绩效考核评价表.xlsx`。应用首次升级时会自动生成一份 2026 Q3 评价表，之后可自由增删改。

## 快速开始

```bash
cd tinyjs-demo
tinyjs dev
```

首次启动会自动创建数据库和数据目录：

```text
~/Library/Application Support/app.local.deskwork/
├── workbench.db
├── workbench.db-wal
└── backups/workbench-YYYYMMDD-HHmmss.db
```

`tinyjs dev` 和构建后的应用共用同一个数据目录。修改 `tinyjs.json` 的 `id` 等于换一个新目录，旧数据不会自动迁移。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `tinyjs dev` | 开发模式，前端热刷新，后端改动自动重启 |
| `tinyjs build` | 构建到 `dist/` |
| `tinyjs doctor` | 检查运行环境与项目配置 |
| `~/.tinyjs/bin/tjs run test/backend.test.js` | 无界面后端测试（临时数据目录） |
| `sh test/run-ui-test.sh` | 自驱动 UI 冒烟测试，结果打印在终端 |
| `~/.tinyjs/bin/tjs run test/perf.test.js` | 1 万条记录搜索性能测试（临时数据目录） |

## 项目结构

```text
tinyjs-demo/
├── docs/                         # 需求、产品、技术、视觉、开发计划
├── src/
│   ├── backend/
│   │   ├── main.js               # api 注册与事件
│   │   ├── db.js                 # 打开数据库、迁移、工具函数
│   │   ├── schema.js             # SQLite DDL
│   │   ├── repo/                 # projects / entries / tasks / snippets
│   │   └── services/             # settings / stats / daily / report / focus / performance / data / backup
│   └── frontend/
│       ├── index.html  quick.html
│       ├── style.css
│       ├── app.js                # 启动、路由、菜单、托盘、快捷键、小窗
│       ├── quick.js              # 快速记录小窗
│       └── js/
│           ├── util.js  api.js  store.js  components.js
│           └── views/            # today / journal / tasks / projects / review / performance / snippets / settings
├── test/
│   ├── backend.test.js           # tjs 直接跑的后端冒烟测试
│   ├── run-ui-test.sh            # 生成自包含页面并启动 UI 测试
│   ├── ui.test.js                # WebView 内的自驱动 UI 测试
│   └── perf.test.js              # 1 万条记录搜索性能测试
├── assets/icon.png
├── tinyjs.json
└── types/                        # 编辑器类型提示
```

## 数据与备份

- SQLite 单文件，WAL 模式；每次启动检查当天是否已备份，没有就自动备份一次。
- 默认保留 7 份备份，可在设置里调整；备份文件通过 SQLite `integrity_check` 验证。
- 设置页可“立即备份”和“在访达中显示”数据目录。
- 删除记录/任务为软删除，可撤销；项目删除不会级联删除记录。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `⌘1…⌘5` | 今日 / 记录 / 任务 / 项目 / 回顾 |
| `⌘6` | 绩效 |
| `⌘7` | 片段 |
| `⌘,` | 设置 |
| `⌘⇧Space` | 全局快速记录小窗（其他应用前台时也可用） |
| `⌘N` | 快速记录 |
| `⌘⇧N` | 新建任务（收集箱） |
| `⌘K` | 搜索记录 |
| `⌘Z` | 撤销最近的删除（记录 / 任务 / 片段，60 秒内） |
| `J` / `K` | 记录页前一天 / 后一天 |
| `Space` | 任务页勾选当前/第一个任务 |
| `Enter` | 保存记录 / 添加待办 |
| `Shift+Enter` | 记录内换行 |

## 文档

- [文档索引](docs/README.md)
- [需求文档](docs/01-需求文档.md)
- [产品设计](docs/02-产品设计.md)
- [技术设计](docs/03-技术设计.md)
- [视觉与交互规范](docs/04-视觉与交互规范.md)
- [开发计划](docs/05-开发计划.md)

## 路线图

- **M0–M6 已完成**：核心记录、任务、项目、日报、周报、系统集成与 P1 增强。
- **M6.5 已完成**：绩效评价模块，首份数据来自 2026 Q3 评价表。
- **M7 进行中**：全键盘走查、200% 缩放/长内容边界、备份恢复演练、文案校对、`tinyjs build` 与真机试用。
- 真机待验证项：全局快捷键在后台应用前台时的注册/冲突提示、快速记录窗保存后主窗口实时刷新、通知点击定位日报。
