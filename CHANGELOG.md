# Changelog

本项目的版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
