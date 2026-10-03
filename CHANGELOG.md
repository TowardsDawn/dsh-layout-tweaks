# Changelog

本项目的版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-10-03

### 变更

- **② 语义升级：从「底部入口上移」改为「功能入口并入折叠块」。**
  两个入口不再只是排在面板列表下方，而是**成为折叠块的一部分**：折叠时与面板列表一起收起，展开时一起出现。
  开关名 `moveEntries` → `foldEntries`（旧键不再读取，升级后默认开启）。
- **纳入规则改为运行时分类**（`classifyFooter`）：
  - 默认策略是「**未识别的条目一律并入折叠块**」—— 新插件注册到 `sidebar.footer.action` 的入口**自动进入折叠块**，无需更新本插件；
  - 仅有被判定为「底部常驻控件」的条目留在最下方：含 ≥2 个可点击控件的卡片、或自身/后代命中 `BOTTOM_KEEP_SELECTORS`（用量卡片、检查更新、远程访问）的条目；
  - 新增 `bottomKeep`（localStorage）用于追加自定义的「保留在底部」选择器。
- 折叠头上的计数改为「折叠块内的条目总数」（面板行数 + 功能入口数）。

### 修复

- **分类漏判包装型控件**：远程访问这类 `entryRow > trigger` 结构，可访问名落在内层按钮上，只看条目自身会漏判 → 判定改为同时检查自身与后代。
- **基线规则的 CSS 特异性反噬**：`… > *:last-child > *:first-child > *{ order:40 }` 比 `[data-dsh-lt-fold]{ order:15 }` 特异性更高，会把分类结果全部覆盖（现象：所有条目都停在 `order:40`）→ 基线加 `:not(...)`，只管未分类的条目。

### 夹具

- `test/fixture.html` 扩充为分类回归夹具：图标按钮（检查更新 / 远程访问）、功能入口（上下文洞察 / 会话管理）、多控件卡片（今日消费）与一个「示例新模块」，一次覆盖四条判定分支。

## [0.1.0] - 2026-10-03

首个版本。

### 新增

- **① 会话头上边栏拆两行**：第 1 行 = 会话名 + 工作模式（`conversation.session.header.actions` 的第一项），
  第 2 行 = 其余全部控件；页签行不受影响。
  实现为纯 CSS —— 拆掉 `titleRow` / `titleCluster` / `headerActions` 三层盒子（`display:contents`），
  用 `titleRow::after` 伪元素作零宽断行符，再用 `order` 排序，不向 DOM 插入任何节点。
- **② 侧栏底部入口上移**：「上下文洞察」（dsh-context）与「会话管理」（dsh-session-manager）
  抬到面板列表正下方；「今日消费」「设置」保持底部。
  实现为纯 CSS —— `footArea` / `footerActions` 逐层 `display:contents` + `order` 排序。
- **③ 非工作区模块折叠**：自建折叠头（`.dsh-lt-head`）插在面板列表之前，一键收起面板列表与已上移的入口；
  折叠态由 `<html data-dsh-lt-collapsed>` 驱动。
- 折叠头上的 **⚙ 布局设置** 弹层：开关 ①②、恢复默认；状态持久化于 `localStorage`
  （键名 `dsh-layout-tweaks:v1`）。
- 免构建产物：`lib/client.js` 按 `window.__ModuleLoader__.load({ id, factory })` 协议手写，
  `lib/index.js` 为 host 半空挂载点。
- 离线夹具 `test/fixture.html`：用实测的 DSH 客户端 DOM 复刻会话头与侧栏，无需登录 GUI 即可验证布局。

### 说明

- 定位全部使用 `data-slot` 锚点、结构关系与第三方插件自身的前缀类名，**不依赖 CSS Module hash**。
- `:has()` 不可用时，重排规则由 `@supports` 挡下，插件静默不生效而不会破坏宿主排版。
- 卸载时自动移除注入样式、自建节点与 `<html>` 上的状态属性。
