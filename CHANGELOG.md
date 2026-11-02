# Changelog

本项目的版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.4.1] - 2026-11-02

### 变更

- **移除 dsh-update 相关的排布配置**。`dsh-update` 已从聚合包（`@linxin666/dsh-web-all`）退役，
  footer 槽位只剩余 `dsh-remote-bridge` 与 `dsh-session-manager` 两个占用者。
- 顺带把 ③ 改成**不认具体插件**：除了「会话与工作区」（`sm-footerBtn`，唯一需要独占整行的那类），
  其余条目一律走零特异性基线 `order:1` —— 都排在第 2 行，靠左还是靠右由它们自己的样式决定。
  好处是**新插件注册进来就自动归位**，插件退役时也不会留下永远不到达的死规则。

### 说明

- 现在 ③ 只有两条规则：`> [class*="sm-footerBtn"]{ order:0 }` 与 `> :where(*){ order:1 }`。
  源码里不再出现任何 `data-dsh-plugin="…"` 选择器。
- `npm test` 增加一条反向断言：源码一旦出现 `data-dsh-plugin` 即失败。
- 顺带修好一处旧注释：夹具里"已知三条 / 三家 CSS"的措辞。

### 测试

- `npm test` 仍为 **28 项**（去掉两条硬编码插件断言，加入一条"不硬编码"的反向断言）。
- `test/fixture.html` 同步移除 `dsh-update` 的条目与它的 CSS，改为
  「会话与工作区 + 远程访问 + 未知条目」：关闭插件 3 行、开启后 2 行，右下角浮层直接报行数。

## [0.4.0] - 2026-11-01

### 新增

- **③ 底栏排布**（`sidebar.footer.action`）：把「会话与工作区」放第一行独占，其余底部动作
  （检查更新 / 手机App远程访问）排第二行，各自保留原有对齐。**与 ② 的顶栏面板折叠完全独立** ——
  独立的开关（`footerLayout`）、独立的 flag（`footer-layout`），互不影响。
- 这是个**多方共享**的槽位：条目仍由各插件自己渲染，本插件只决定它们落在第几行。
  实现只用 `order` 加一个容器 `flex-wrap`，**不搬 DOM、不改容器方向、不碰宽度与对齐**。

### 说明

- 旧版（0.1.0–0.2.4）的「把底部入口搬进折叠块」仍然保持移除状态：那套要拆容器盒子
  （`display:contents`）并改变容器自身的 flex 方向，已确认不划算。这次只在**原容器内**排序。
- 选择器只认稳定标识：`data-dsh-plugin="update"` / `data-dsh-plugin="remote-bridge"`
  （插件自己写在元素上的常量）与无 hash 的类名后缀 `sm-footerBtn`；
  未识别的条目走零特异性基线 `order:3`，排在最后一行之后，不会被挤进目标两行。
- 只在**侧栏展开**时接管。收起成 56px 轨道时底部区域整体隐藏、各插件有自己的竖排逻辑，
  本插件不参与。
- 所有 `order` 都带 `!important`：真机上存在第三方规则
  `[data-dsh-frame]:not(...) [class*="footerActions"] > [data-slot="sidebar.footer.action"] > :not(...) { order: 1 }`，
  不加会被它整片覆盖。夹具里保留了这条规则作为回归用例。

### 测试

- `npm test` 增至 **28 项**：新增底栏相关正向断言（`sidebar.footer.action` / `footerActions` /
  `sm-footerBtn` / 两个 `data-dsh-plugin`），同时保留旧搬运机制的反向断言。
- `test/fixture.html` 升级为**三段回归夹具**：如实复刻三个插件的真实 CSS 规则
  （session-manager 的 `:has()` 换行 + `flex:1 1 100%`、update 的胶囊 `flex:auto`、
  remote-bridge 的 `order:1` + `margin-inline-start:auto`）与一条第三方 `order` 规则。
  未启用插件时复现「3 行」，启用后应为「2 行」，右下角浮层直接报行数与每行成员。

## [0.3.0] - 2026-10-04

### 移除（破坏性）

- **不再干预侧栏底部区域。** 删除「把上下文洞察 / 会话管理等功能入口并入折叠块」的整套实现
  （条目搬运 + 运行时分类 + `data-dsh-lt-*` 标记 + 相关 `order` 规则），以及折叠头上的
  **⚙ 布局设置** 与它的弹层。

  这套逻辑的收益与代价不匹配：底部入口与面板列表的注册方式差异很大 —— 不同的槽位、不同的容器、
  不同的布局约束。要跨界搬移，就必须先把容器盒子拆成 `display:contents`，而这一步会**连带改变
  容器自身的 flex 方向**：条目原本待在横向容器里靠 `flex:1` 占满宽度，进入纵向容器后同一个
  `flex:1` 变成「抢占高度」，把工作区列表挤成 0 高度；同时还要与其他插件下发的 `order` 规则
  争优先级。v0.2.1 → v0.2.4 连续四个补丁都花在这条链上，而它换来的只是「少占一屏」。

### 变更

- **外显布局回到宿主原生状态**：`上下文洞察 / 会话管理 / 检查更新 / 远程访问 / 今日消费 / 设置`
  的位置、顺序与横向排列全部由宿主和其他插件决定，本插件**一个属性都不写、一条规则都不下** ——
  与「本插件从未有过 footer 干预」时逐像素一致，新插件注册什么就长什么样。
- **折叠头保留**：仍然一键折叠面板列表，只是不再带动功能入口；计数改为「面板列表行数」。
- `localStorage` 状态精简为 `{ headerTwoRows, collapsed }`。旧的 `foldEntries` / `bottomKeep`
  字段不再读取（留在存储里也不影响，清掉即可）。
- `headerTwoRows` 的 UI 开关随弹层一起移除。需要关闭两行模式时，手动改
  `localStorage` 的 `dsh-layout-tweaks:v1`（见 README 的「配置」一节）。

### 测试

- `npm test` 增至 **24 项**，新增一组**反向断言**：源码中一旦重新出现
  `data-dsh-lt-fold` / `data-dsh-lt-keep` / `data-dsh-lt-box` / `data-dsh-lt-settings` /
  `BOTTOM_KEEP_SELECTORS` / `sidebar.footer.action` / `footerActions`，测试直接失败 ——
  防止那段会改变容器 flex 方向、并与其他插件抢 `order` 的逻辑悄悄回潮。
- `test/fixture.html` 改为**零干预回归用例**：保留真机底部区域的原样结构（图标按钮 / 功能入口 /
  多控件卡片 / 设置），右下角浮层实时报告「底部区域被本插件写入的节点数」，该数必须为 0。

## [0.2.4] - 2026-10-04

### 修复

- **入口被撑高、工作区列表消失**：`display:contents` 把条目从 `footerActions`（`display:flex`，横向容器）
  搬进了侧栏根（`flex-direction:column`，纵向容器），而这些条目原本靠 `flex:1` 在横向容器里占满宽度 ——
  到了纵向容器里，同一个 `flex:1` 就变成「**纵向抢高度**」：入口被撑到 125px（正常 36px），
  工作区列表（`flex:1`）被压到 89px 而内容需要 234px，真机上直接被压成 0（看起来"列表不见了"）。
  现在 `[data-dsh-lt-fold]` 与 `[data-dsh-lt-keep]` 都带 `flex:0 0 auto !important`，各按内容高度排列。
- **底部控件位置回退**：「检查更新 / 远程访问」的 `order` 由 40 调整为 45，排在用量卡片之后、设置之前，
  贴近宿主原生位置。

### 说明

- 关闭「把入口并入折叠块」时不会触发上述问题：那时不拆 `footerActions`，容器方向没有被改变。

## [0.2.3] - 2026-10-04

### 修复

- **模块导入失败**（DSH web 启动时提示 `web boot: 1 entry did not activate` /
  `dsh-layout-tweaks: import failed`）：0.2.2 在 CSS 模板字符串的**注释里用反引号**标注了一条第三方选择器 ——
  而反引号会**提前终止模板字符串**，整个 `lib/client.js` 因此语法不合法，浏览器侧模块无法导入。
  现在注释改为无反引号写法，并在该处留下明确警示。

### 新增

- **离线预检 `npm test`**（`test/smoke.mjs`）：不需要 DSH、不需要浏览器，检查语法解析、模块注册协议
  （`window.__ModuleLoader__.load`）、`factory()` 导出、host 半导出、关键标记与必需文件，共 17 项。
  0.2.2 那次事故正是它要拦下的类型 —— 建议每次 push 前先跑一次。

## [0.2.2] - 2026-10-04

### 修复

- **与第三方插件的 `order` 冲突（表现为「入口跑到侧栏最顶部」）**：页面上另一个插件（用 `data-dsh-frame` /
  `data-dsh-part` 标记侧栏）会下发这样一条规则：

  ```css
  [data-dsh-frame]:not([data-sidebar-collapsed]) [class*="footerActions"] >
  [data-slot="sidebar.footer.action"] > :not([data-dsh-part="entry"]):not([class*="entryRow"])
  { order: 1 }
  ```

  它的特异性 `(0,6,0)` 高于本插件的 `(0,3,1)`，把 `[data-dsh-lt-fold]{ order:15 }` 与
  `[data-dsh-lt-keep]{ order:40 }` 整片压掉 —— 现象是入口虽然被打上分类标记、也确实从底部区"浮"到了侧栏根
  这一层，却因为 `order` 仍是对方给的 `1` 而排到了**最前面**。

  现在本插件的**所有 `order` 声明都带 `!important`**（对方并没有用 `!important`），排序不再被覆盖。

### 说明

- 该冲突的定位方式：在真机上遍历 `document.styleSheets`，列出所有命中该条目且声明了 `order` 的规则及其
  特异性，一眼看到"非本插件"的那条；随后注入带 `!important` 的覆盖样式当场验证顺序恢复正确，再落到代码里。

## [0.2.1] - 2026-10-04

### 修复

- **真机层级假设错误（表现为「插件装了但布局没变」）**：旧版按「`footArea` → `footerActions` → 条目」两级结构定位
  并写死选择器，而实测真机是三层：`footerActions` 之下还有一层**槽位锚点宿主**
  （`[data-slot="sidebar.footer.action"]`，无 class 的透明 div），且 `footArea` 内除 `footerActions` / `settingsArea`
  外还有第三个容器（用量卡片所在的容器）。结果分类器只看到那层宿主、把它当成一个「多控件卡片」判为常驻底部，
  `data-dsh-lt-fold` 一个都没有 —— 界面上就是「折叠头在、入口没进折叠块」。
  现在改为：`footerActions` 用槽位锚点的父元素定位；条目容器优先取锚点自身，锚点缺失时向下穿透单子元素包装层；
  「底部区 → … → 条目容器」整条链由 JS 打 `data-dsh-lt-box` 标记，**CSS 只认属性，不再写死层级**。
- **「设置」没有留底**：`settingsArea` 位于底部区内部、层级不固定，改为由 JS 在设置锚点的父容器上打
  `data-dsh-lt-settings` 标记后按属性排序。
- **`order` 基线特异性**：基线改用 `:where()` 压低特异性，避免盖住 `[data-dsh-lt-fold]` / `[data-dsh-lt-keep]` 的排序。

### 夹具

- `test/fixture.html` 升级为**真机层级复刻**：`footerActions` 下加一层槽位锚点宿主、`footArea` 内加入用量卡片的独立容器、
  设置区加入锚点宿主。这次修复之所以能先回归再交付，靠的就是夹具先复现了真机的三层形状。

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
