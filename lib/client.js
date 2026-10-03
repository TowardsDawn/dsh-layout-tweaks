/**
 * dsh-layout-tweaks —— 浏览器半（client half）。
 *
 * 设计约束：**不修改任何其他插件**，也不接管任何 slot。
 * 三个功能全部通过「注入 CSS + 一个自建折叠头」完成，React 树零感知：
 *
 *   ① 会话头上边栏拆两行   —— 纯 CSS：拆掉 titleRow / titleCluster / headerActions
 *                             三层盒子（display:contents），用 ::after 伪元素当
 *                             零宽断行符，再用 order 排序。
 *   ② 功能入口并入折叠块   —— 把侧栏 footArea / footerActions 逐层 display:contents，
 *                             让底部条目直接参与侧栏根（flex column）的排版；
 *                             再用运行时分类（见 classifyFooter）把「功能入口」与
 *                             「底部常驻控件」分开排序。
 *   ③ 非工作区模块折叠     —— CSS 负责隐藏，本插件自建的折叠头（唯一注入的 DOM）负责开关。
 *
 * 关于 ② 的分类策略：**默认所有注册进 `sidebar.footer.action` 的条目都属于折叠块**，
 * 只有被判定为「底部常驻控件」（用量卡片、检查更新、远程访问等）的才留在最下方。
 * 这样新装的插件把入口注册到 footer.action 时会**自动进入折叠块**，无需改本插件；
 * 反之若要新增一个「常驻底部」的控件，在 BOTTOM_KEEP_SELECTORS 里补一条即可
 * （或写入 localStorage 的 `bottomKeep` 数组，见 README）。
 *
 * 所有定位都走 `data-slot` 锚点、结构关系与条目的可访问名/类名后缀，
 * 不使用会随 DSH 版本变化的 CSS Module hash 前缀；找不到锚点时插件静默失效。
 */
window.__ModuleLoader__.load({
	id: 'dsh-layout-tweaks',
	factory: () => {
		var module = { exports: {} };

		/* ================================================================
		 * 常量与文案
		 * ================================================================ */

		const PLUGIN_ID = 'dsh-layout-tweaks';
		const STYLE_ID = PLUGIN_ID + '-style';
		const HEAD_ID = PLUGIN_ID + '-head';
		const STORAGE_KEY = PLUGIN_ID + ':v1';

		/** 多值特性开关，写在 <html> 上，CSS 用 `[data-dsh-lt~="…"]` 匹配。 */
		const FLAG_ATTR = 'data-dsh-lt';
		/** 折叠态开关，写在 <html> 上。 */
		const COLLAPSED_ATTR = 'data-dsh-lt-collapsed';
		const FLAG_HEADER = 'header-two-rows';
		const FLAG_FOLD = 'fold-entries';

		/** 运行时分类标记（写在侧栏底部条目上，仅本插件读写）。 */
		const DATA_FOLD = 'data-dsh-lt-fold';
		const DATA_KEEP = 'data-dsh-lt-keep';

		const SIDEBAR_HOST_SELECTOR = '[data-slot="sidebar"]';
		const SESSION_HEADER_SLOT = '[data-slot="conversation.session.header"]';
		const WORKSPACES_SLOT = '[data-slot="sidebar.workspaces"]';

		const DEFAULT_STATE = {
			headerTwoRows: true,
			foldEntries: true,
			collapsed: false,
			/** 额外的「保留在底部」CSS 选择器（高级用法，见 README）。 */
			bottomKeep: [],
		};

		/**
		 * 底部常驻控件的内置识别规则。
		 *
		 * 判定顺序见 classifyFooter：
		 *   1. 含 ≥2 个可点击控件的卡片（如用量卡的「主按钮 + 展开箭头」）→ 常驻底部；
		 *   2. 命中本表的条目 → 常驻底部；
		 *   3. 命中用户自定义 bottomKeep 的条目 → 常驻底部；
		 *   4. 其余（含未来新插件注册的入口）→ 并入折叠块。
		 *
		 * 表内用「类名后缀 / 可访问名」而非完整类名：前缀 hash 会随打包变化，后缀与可访问名不会。
		 */
		const BOTTOM_KEEP_SELECTORS = [
			// 用量 / 统计卡片（DeepSeek 今日消费）
			'[class*="footCard"]',
			'[class*="footMain"]',
			'[class*="footToggle"]',
			'[aria-label*="使用统计"]',
			'[aria-label*="用量"]',
			'[aria-label*="Usage"]',
			'[aria-label*="usage"]',
			// 检查更新（@linxin666/dsh-update）
			'[aria-label*="检查更新"]',
			'[title*="检查更新"]',
			'[aria-label*="Check for update"]',
			'[aria-label*="Check for updates"]',
			'[title*="Check for update"]',
			// 远程访问（remote-web-ui）
			'[aria-label*="远程访问"]',
			'[title*="远程访问"]',
			'[aria-label*="Remote access"]',
			'[title*="Remote access"]',
		];

		const TEXT_ZH = {
			head: '面板与插件',
			headAria: '面板与插件：点击折叠或展开',
			collapse: '折叠面板与插件',
			expand: '展开面板与插件',
			settings: '布局设置',
			optHeader: '会话头上边栏拆成两行',
			optFold: '把「上下文洞察 / 会话管理」等入口并入折叠块',
			reset: '恢复默认',
		};

		const TEXT_EN = {
			head: 'Panels & plugins',
			headAria: 'Panels and plugins: click to collapse or expand',
			collapse: 'Collapse panels and plugins',
			expand: 'Expand panels and plugins',
			settings: 'Layout settings',
			optHeader: 'Split the session header into two rows',
			optFold: 'Fold entry modules (Context, Session manager, …) into the block',
			reset: 'Reset to defaults',
		};

		/* ================================================================
		 * 样式
		 *
		 * 重排规则依赖 :has()，统一包在 @supports 里；不支持时插件静默不生效，
		 * 而不是把宿主排版改一半。
		 * ================================================================ */

		const CSS = `
/* ---------- 折叠头（本插件自建节点） ---------- */
.dsh-lt-head{
  display:flex; align-items:center; gap:6px;
  box-sizing:border-box; min-height:28px; margin:2px 2px 6px; padding:0 8px;
  border-radius:var(--dsw-radius-md, 8px);
  color:var(--dsw-alias-label-secondary, #8a8f98);
  font-size:12px; line-height:18px;
  cursor:pointer; user-select:none;
  transition:background-color .12s ease, color .12s ease;
}
.dsh-lt-head:hover{
  background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary, inherit);
}
.dsh-lt-head:focus-visible{
  outline:2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset:-2px;
}
.dsh-lt-caret{ width:12px; height:12px; flex:none; transition:transform .15s ease; }
html[${COLLAPSED_ATTR}] .dsh-lt-caret{ transform:rotate(-90deg); }
.dsh-lt-title{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-lt-count{ flex:none; opacity:.6; font-variant-numeric:tabular-nums; }
.dsh-lt-gear{
  flex:none; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center;
  padding:0; border:0; border-radius:6px; background:transparent; color:inherit;
  cursor:pointer; opacity:.7; transition:background-color .12s ease, opacity .12s ease;
}
.dsh-lt-gear:hover{ background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16)); opacity:1; }

/* 侧栏收起成 56px 轨道时，折叠头没有意义 */
${SIDEBAR_HOST_SELECTOR} > div[class*="collapsed"] .dsh-lt-head{ display:none; }

/* ---------- 设置弹层 ---------- */
.dsh-lt-pop{
  position:fixed; z-index:4000; box-sizing:border-box; min-width:236px; padding:10px;
  border:.5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28));
  border-radius:12px;
  background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff));
  box-shadow:0 8px 28px rgba(0,0,0,.18);
  color:var(--dsw-alias-label-primary, inherit);
  font-size:13px; line-height:20px;
}
.dsh-lt-pop-title{ padding:2px 8px 8px; font-weight:600; opacity:.9; }
.dsh-lt-pop label{ display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:8px; cursor:pointer; }
.dsh-lt-pop label:hover{ background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsh-lt-pop input{ margin:4px 0 0; flex:none; accent-color:var(--dsw-alias-brand-primary, #4d6bfe); }
.dsh-lt-pop-foot{ display:flex; justify-content:flex-end; padding-top:8px; }
.dsh-lt-pop-foot button{
  padding:4px 10px; border-radius:8px; cursor:pointer; font:inherit; color:inherit;
  border:.5px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28));
  background:transparent;
}
.dsh-lt-pop-foot button:hover{ background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
@media (prefers-reduced-motion:reduce){
  .dsh-lt-head, .dsh-lt-caret, .dsh-lt-gear{ transition:none; }
}

@supports selector(:has(*)) {
  /* ==================================================================
   * ① 会话头上边栏：拆成两行
   *
   * 目标：第 1 行 = 会话名 + 工作模式（actions 的第 1 项，agent-preset，
   *       order:-10 保证它恒定排在最前）；第 2 行 = 其余全部控件。
   *
   * titleRow 是 flex 容器，拆掉 titleCluster 与 headerActions 两层盒子后，
   * crumbs / 各 action 条目 / utilities / corner 都成为它的 flex item；
   * 再用 titleRow::after 这个零宽伪元素（order 卡在两组之间）强制换行。
   * ================================================================== */
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} > div:first-child{
    flex-wrap:wrap; gap:0 8px; row-gap:4px;
  }
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} > div:first-child > div:has(> nav){
    display:contents;                                            /* titleCluster */
  }
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} div:has(> [data-slot="conversation.session.header.actions"]){
    display:contents;                                            /* headerActions */
  }
  /* 第 1 行 */
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} nav{ order:0; }
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] [data-slot="conversation.session.header.actions"] > *:nth-child(1){ order:1; }
  /* 零宽断行符：伪元素本身就是 titleRow 的 flex item */
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} > div:first-child::after{
    content:""; order:5; flex-basis:100%; height:0;
  }
  /* 第 2 行起：其余控件（超出时由 flex-wrap 自然继续换行） */
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] [data-slot="conversation.session.header.actions"] > *:nth-child(n+2){ order:10; }
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} > div:first-child > div:has(> [data-slot="conversation.session.header.utilities"]){ order:11; }
  html[${FLAG_ATTR}~="${FLAG_HEADER}"] ${SESSION_HEADER_SLOT} > div:first-child > div:has(> [data-slot="conversation.session.header.corner"]){ order:12; }

  /* ==================================================================
   * ② 折叠块：面板列表 + 功能入口
   *
   * 侧栏根（root 元素）是 flex column，panelList / regionArea / footArea
   * 都是它的直接子元素。把 footArea 与 footerActions 逐层 display:contents
   * 打开后，底部条目在布局上成为 root 的 flex item，即可用 order 精确排序。
   *
   * 分类由 JS 在运行期完成（见 classifyFooter）：
   *   [data-dsh-lt-fold] → 属于折叠块（面板列表正下方，折叠时一起收起）
   *   [data-dsh-lt-keep] → 常驻底部
   *
   * 注意两者的分工：order 作用于「布局上的 flex item」，而选择器必须按
   * 「DOM 层级」书写 —— footerActions 只是布局透明，DOM 上仍是这些条目的父元素。
   * 用结构定位（footArea 是 root 的最后一个子元素，footerActions 是它的第一个
   * 子元素），避免依赖 CSS Module 的 hash 类名。
   * ================================================================== */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *:last-child{
    display:contents;                                            /* footArea */
  }
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *:last-child > *:first-child{
    display:contents;                                            /* footerActions */
  }
  /* 序位基线：其余底部条目留在最下方。
     必须用 :not(...) 排掉已分类的条目 —— 这条选择器更长、特异性更高，
     否则会盖过下面 [data-dsh-lt-fold] / [data-dsh-lt-keep] 的 order。 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *{ order:40; }
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *:last-child > *:first-child > *:not([${DATA_FOLD}]):not([${DATA_KEEP}]){ order:40; }
  /* 品牌行 + 新会话保持在最上方 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *:nth-child(-n+2){ order:0; }
  /* 本插件自建的折叠头紧贴面板列表之上 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > .dsh-lt-head{ order:9; }
  /* 面板列表（插件 / 任务看板 / 技能中心 / SSH） */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > nav{ order:10; }
  /* 折叠块的功能入口：紧跟面板列表 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} [${DATA_FOLD}]{ order:15; margin:0 2px 4px; }
  /* 常驻底部控件 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} [${DATA_KEEP}]{ order:40; }
  /* 工作区 / 会话列表 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > div:has(> ${WORKSPACES_SLOT}){ order:30; }
  /* 设置留底 */
  html[${FLAG_ATTR}~="${FLAG_FOLD}"] ${SIDEBAR_HOST_SELECTOR} > div > *:last-child > *:last-child{ order:50; }
}

/* ---------- ③ 折叠：收起面板列表与折叠块内的功能入口 ---------- */
html[${COLLAPSED_ATTR}] ${SIDEBAR_HOST_SELECTOR} > div > nav{ display:none; }
html[${FLAG_ATTR}~="${FLAG_FOLD}"][${COLLAPSED_ATTR}] ${SIDEBAR_HOST_SELECTOR} > div > *:last-child > *:first-child > [${DATA_FOLD}]{
  display:none;
}
`;

		/* ================================================================
		 * 状态：读 / 写 / 投影到 <html>
		 * ================================================================ */

		/** 本地持久化的开关状态；localStorage 不可用时回退默认值。 */
		function readState() {
			const state = {
				headerTwoRows: DEFAULT_STATE.headerTwoRows,
				foldEntries: DEFAULT_STATE.foldEntries,
				collapsed: DEFAULT_STATE.collapsed,
				bottomKeep: [],
			};
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (!raw) return state;
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object') {
					if (typeof parsed.headerTwoRows === 'boolean') state.headerTwoRows = parsed.headerTwoRows;
					if (typeof parsed.foldEntries === 'boolean') state.foldEntries = parsed.foldEntries;
					if (typeof parsed.collapsed === 'boolean') state.collapsed = parsed.collapsed;
					if (Array.isArray(parsed.bottomKeep)) {
						state.bottomKeep = parsed.bottomKeep.filter((item) => typeof item === 'string' && item.length > 0);
					}
				}
			} catch (error) {
				/* 隐私模式 / 反序列化失败：静默使用默认值 */
			}
			return state;
		}

		/** 持久化开关状态（写失败不影响本次会话内的效果）。 */
		function saveState(state) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch (error) {
				/* 忽略 */
			}
		}

		/** 把开关状态投影成 <html> 上的两个属性，CSS 由它们驱动。 */
		function applyState(state) {
			const html = document.documentElement;
			const flags = [];
			if (state.headerTwoRows) flags.push(FLAG_HEADER);
			if (state.foldEntries) flags.push(FLAG_FOLD);
			if (flags.length > 0) html.setAttribute(FLAG_ATTR, flags.join(' '));
			else html.removeAttribute(FLAG_ATTR);
			if (state.collapsed) html.setAttribute(COLLAPSED_ATTR, 'on');
			else html.removeAttribute(COLLAPSED_ATTR);
		}

		/** 取当前语言文案（不依赖 locale 服务，纯 navigator 判断）。 */
		function pickText() {
			let lang = '';
			try {
				lang = String(window.navigator.language || '').toLowerCase();
			} catch (error) {
				/* 忽略 */
			}
			return lang.indexOf('zh') === 0 ? TEXT_ZH : TEXT_EN;
		}

		/** 注入 / 复用样式表，返回 style 元素。 */
		function injectStyle() {
			let el = document.getElementById(STYLE_ID);
			if (el) return el;
			el = document.createElement('style');
			el.id = STYLE_ID;
			el.textContent = CSS;
			document.head.appendChild(el);
			return el;
		}

		/* ================================================================
		 * DOM 锚点
		 * ================================================================ */

		/** 侧栏根元素（ui-sidebar 的 SidebarRoot 根节点，即侧栏宿主的第一个子元素），找不到返回 null。 */
		function sidebarRoot() {
			try {
				const host = document.querySelector(SIDEBAR_HOST_SELECTOR);
				return host ? host.firstElementChild : null;
			} catch (error) {
				return null;
			}
		}

		/** 全局面板列表（插件 / 任务看板 / …），即侧栏根的直接 nav 子元素。 */
		function panelList() {
			const root = sidebarRoot();
			if (!root) return null;
			try {
				return root.querySelector(':scope > nav');
			} catch (error) {
				return null;
			}
		}

		/** 工作区 / 会话列表区域。 */
		function regionArea() {
			const root = sidebarRoot();
			if (!root) return null;
			try {
				return root.querySelector(':scope > div:has(> ' + WORKSPACES_SLOT + ')');
			} catch (error) {
				return null;
			}
		}

		/** 侧栏底部区（root 的最后一个子元素）。 */
		function footArea() {
			const root = sidebarRoot();
			if (!root) return null;
			return root.lastElementChild;
		}

		/** 侧栏底部条目的直接父容器（footerActions，即底部区的第一个子元素）。 */
		function footerActions() {
			const foot = footArea();
			return foot ? foot.firstElementChild : null;
		}

		/* ================================================================
		 * 运行时分类：功能入口 vs 常驻底部控件
		 * ================================================================ */

		/** 是否含 ≥2 个可点击控件（用量卡这类「主按钮 + 展开箭头」的卡片结构）。 */
		function isMultiControlCard(el) {
			try {
				return el.querySelectorAll('button, [role="button"]').length >= 2;
			} catch (error) {
				return false;
			}
		}

		/** 是否命中给定选择器列表中的任意一条（非法选择器静默跳过）。 */
		function matchesAny(el, selectors) {
			for (const selector of selectors) {
				try {
					if (el.matches(selector)) return true;
				} catch (error) {
					/* 用户填了非法选择器：忽略这一条 */
				}
			}
			return false;
		}

		/**
		 * 条目自身或其后代是否命中给定选择器。
		 *
		 * 需要看后代：有的插件把按钮包一层容器再注册（例如远程访问的
		 * `entryRow > trigger`），可访问名落在内层按钮上，只看自身会漏判。
		 * @param el - 待判定的条目。
		 * @param selectors - 选择器列表。
		 */
		function matchesSelfOrDescendant(el, selectors) {
			if (matchesAny(el, selectors)) return true;
			for (const selector of selectors) {
				try {
					if (el.querySelector(selector) !== null) return true;
				} catch (error) {
					/* 非法选择器：忽略这一条 */
				}
			}
			return false;
		}

		/**
		 * 判断一个底部条目是否应当常驻底部（而不是并入折叠块）。
		 * @param el - footerActions 的直接子元素。
		 * @param userSelectors - 用户自定义的额外「保留在底部」选择器。
		 */
		function isBottomKeep(el, userSelectors) {
			if (isMultiControlCard(el)) return true;
			if (matchesSelfOrDescendant(el, BOTTOM_KEEP_SELECTORS)) return true;
			if (userSelectors.length > 0 && matchesSelfOrDescendant(el, userSelectors)) return true;
			return false;
		}

		/**
		 * 给侧栏底部条目打上分类标记。
		 *
		 * 默认策略：**未识别的条目一律视为功能入口（并入折叠块）** —— 这样新插件注册到
		 * `sidebar.footer.action` 的入口会自动进入折叠块，无需更新本插件。
		 * 关闭 ② 时清除全部标记，让侧栏回到宿主原状。
		 * @param enabled - 是否启用「功能入口并入折叠块」。
		 * @param userSelectors - 用户自定义的「保留在底部」选择器。
		 */
		function classifyFooter(enabled, userSelectors) {
			const box = footerActions();
			if (!box) return;
			for (const item of box.children) {
				if (!enabled) {
					item.removeAttribute(DATA_FOLD);
					item.removeAttribute(DATA_KEEP);
					continue;
				}
				if (isBottomKeep(item, userSelectors)) {
					if (item.hasAttribute(DATA_FOLD)) item.removeAttribute(DATA_FOLD);
					if (item.getAttribute(DATA_KEEP) !== '') item.setAttribute(DATA_KEEP, '');
				} else {
					if (item.hasAttribute(DATA_KEEP)) item.removeAttribute(DATA_KEEP);
					if (item.getAttribute(DATA_FOLD) !== '') item.setAttribute(DATA_FOLD, '');
				}
			}
		}

		/* ================================================================
		 * 图标
		 * ================================================================ */

		const CARET_SVG =
			'<svg class="dsh-lt-caret" viewBox="0 0 16 16" aria-hidden="true">' +
			'<path d="M4 6.5L8 10.5L12 6.5" fill="none" stroke="currentColor" stroke-width="1.6" ' +
			'stroke-linecap="round" stroke-linejoin="round"/></svg>';

		const GEAR_SVG =
			'<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
			'<path d="M8 5.2A2.8 2.8 0 1 0 8 10.8A2.8 2.8 0 1 0 8 5.2Z ' +
			'M8 1.4v1.5 M8 13.1v1.5 M1.4 8h1.5 M13.1 8h1.5 ' +
			'M3.4 3.4l1.1 1.1 M11.5 11.5l1.1 1.1 M3.4 12.6l1.1-1.1 M11.5 4.5l1.1-1.1" ' +
			'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

		/* ================================================================
		 * 插件主体
		 * ================================================================ */

		const name = PLUGIN_ID;

		/**
		 * 挂载插件：注入样式、投影状态、维护折叠头与设置弹层、观察 DOM 变化。
		 * @param ctx - 客户端 Cordis 上下文（本插件只用它做生命周期 effect）。
		 */
		function apply(ctx) {
			const text = pickText();
			const state = readState();

			let headEl = null;
			let popEl = null;
			let frame = 0;
			let disposed = false;

			injectStyle();

			/* ---------- 状态变更入口 ---------- */

			/** 合并一次开关变更：落盘 → 投影 → 刷新折叠头/弹层/分类。 */
			function onChange(patch) {
				for (const key of Object.keys(patch)) state[key] = patch[key];
				saveState(state);
				applyState(state);
				classifyFooter(state.foldEntries, state.bottomKeep);
				syncHead();
				syncPopover();
			}

			/* ---------- 折叠头同步 ---------- */

			/** 只在文本真的变化时写入，避免 MutationObserver 自激循环。 */
			function setText(el, value) {
				if (el && el.textContent !== value) el.textContent = value;
			}

			function syncHead() {
				if (!headEl) return;
				const expanded = state.collapsed ? 'false' : 'true';
				if (headEl.getAttribute('aria-expanded') !== expanded) {
					headEl.setAttribute('aria-expanded', expanded);
				}
				const title = state.collapsed ? text.expand : text.collapse;
				if (headEl.getAttribute('title') !== title) headEl.setAttribute('title', title);
				setText(headEl.querySelector('.dsh-lt-title'), text.head);

				// 计数 = 面板列表行数 + 折叠块内的功能入口数，让折叠头如实反映块内容量。
				const nav = panelList();
				let count = nav ? nav.querySelectorAll('button').length : 0;
				const box = footerActions();
				if (box) count += box.querySelectorAll(':scope > [' + DATA_FOLD + ']').length;
				setText(headEl.querySelector('.dsh-lt-count'), count > 0 ? String(count) : '');
			}

			/* ---------- 设置弹层 ---------- */

			function syncPopover() {
				if (!popEl) return;
				for (const input of popEl.querySelectorAll('input[data-dsh-lt-opt]')) {
					const key = input.getAttribute('data-dsh-lt-opt');
					if (key) input.checked = Boolean(state[key]);
				}
			}

			function closePopover() {
				if (!popEl) return;
				if (popEl.parentElement) popEl.parentElement.removeChild(popEl);
				popEl = null;
				document.removeEventListener('pointerdown', onOutsidePointer, true);
				document.removeEventListener('keydown', onPopoverKey, true);
			}

			function onOutsidePointer(event) {
				if (!popEl) return;
				if (popEl.contains(event.target)) return;
				if (headEl && headEl.contains(event.target)) return;
				closePopover();
			}

			function onPopoverKey(event) {
				if (event.key === 'Escape') closePopover();
			}

			/** 在齿轮按钮附近打开设置弹层（自动避免溢出视口）。 */
			function openPopover(anchor) {
				closePopover();
				const pop = document.createElement('div');
				pop.className = 'dsh-lt-pop';
				pop.setAttribute('role', 'dialog');
				pop.setAttribute('aria-label', text.settings);

				const options = [
					['headerTwoRows', text.optHeader],
					['foldEntries', text.optFold],
				];
				let html = '<div class="dsh-lt-pop-title">' + text.settings + '</div>';
				for (const pair of options) {
					html +=
						'<label><input type="checkbox" data-dsh-lt-opt="' + pair[0] + '"><span>' + pair[1] + '</span></label>';
				}
				html += '<div class="dsh-lt-pop-foot"><button type="button" data-dsh-lt-reset>' + text.reset + '</button></div>';
				pop.innerHTML = html;

				for (const input of pop.querySelectorAll('input[data-dsh-lt-opt]')) {
					const key = input.getAttribute('data-dsh-lt-opt');
					input.checked = Boolean(state[key]);
					input.addEventListener('change', () => {
						const patch = {};
						patch[key] = input.checked;
						onChange(patch);
					});
				}
				const reset = pop.querySelector('[data-dsh-lt-reset]');
				if (reset) {
					reset.addEventListener('click', () => {
						onChange({
							headerTwoRows: DEFAULT_STATE.headerTwoRows,
							foldEntries: DEFAULT_STATE.foldEntries,
							collapsed: DEFAULT_STATE.collapsed,
							bottomKeep: [],
						});
						closePopover();
					});
				}

				document.body.appendChild(pop);
				const rect = anchor.getBoundingClientRect();
				const left = Math.min(
					Math.max(8, rect.left),
					Math.max(8, window.innerWidth - pop.offsetWidth - 8),
				);
				let top = rect.bottom + 6;
				if (top + pop.offsetHeight > window.innerHeight - 8) {
					top = Math.max(8, rect.top - pop.offsetHeight - 6);
				}
				pop.style.left = left + 'px';
				pop.style.top = top + 'px';

				popEl = pop;
				document.addEventListener('pointerdown', onOutsidePointer, true);
				document.addEventListener('keydown', onPopoverKey, true);
			}

			/* ---------- 折叠头挂载 / 重挂载 ---------- */

			/** 构建折叠头元素。 */
			function buildHead() {
				const head = document.createElement('div');
				head.id = HEAD_ID;
				head.className = 'dsh-lt-head';
				head.setAttribute('role', 'button');
				head.setAttribute('tabindex', '0');
				head.setAttribute('aria-label', text.headAria);
				head.innerHTML =
					CARET_SVG +
					'<span class="dsh-lt-title"></span>' +
					'<span class="dsh-lt-count"></span>' +
					'<button type="button" class="dsh-lt-gear" aria-label="' + text.settings + '">' + GEAR_SVG + '</button>';
				return head;
			}

			/**
			 * 保证折叠头位于面板列表（或工作区列表）之前，并维持底部条目的分类标记。
			 * 幂等：已就位时只刷新文案、计数与分类。
			 */
			function ensure() {
				if (disposed) return;
				const root = sidebarRoot();
				if (!root) return;
				const anchor = panelList() || regionArea();
				if (!anchor || anchor.parentElement !== root) return;

				// 热重载/重复挂载时可能残留同 id 的旧节点，先清掉。
				const stale = document.getElementById(HEAD_ID);
				if (stale && stale !== headEl) {
					if (stale.parentElement) stale.parentElement.removeChild(stale);
				}
				if (!headEl || headEl.id !== HEAD_ID) headEl = buildHead();

				if (headEl.parentElement !== root || headEl.nextElementSibling !== anchor) {
					root.insertBefore(headEl, anchor);
				}
				classifyFooter(state.foldEntries, state.bottomKeep);
				syncHead();
			}

			/** 合并同一帧内的多次 DOM 变更。 */
			function schedule() {
				if (disposed || frame) return;
				frame = window.requestAnimationFrame(() => {
					frame = 0;
					ensure();
				});
			}

			/* ---------- 事件（委托到 document，重挂载后依然有效） ---------- */

			function onDocumentClick(event) {
				const target = event.target;
				if (!target || !target.closest || headEl === null) return;
				const head = target.closest('.dsh-lt-head');
				if (!head || head !== headEl) return;
				const gear = target.closest('.dsh-lt-gear');
				if (gear) {
					if (popEl) closePopover();
					else openPopover(gear);
					return;
				}
				onChange({ collapsed: !state.collapsed });
			}

			function onDocumentKeydown(event) {
				const target = event.target;
				if (!target || !target.closest || headEl === null) return;
				if (target !== headEl) return;
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onChange({ collapsed: !state.collapsed });
				}
			}

			/* ---------- 启动 ---------- */

			applyState(state);
			classifyFooter(state.foldEntries, state.bottomKeep);
			const observer = new MutationObserver(schedule);
			observer.observe(document.documentElement, { childList: true, subtree: true });
			document.addEventListener('click', onDocumentClick);
			document.addEventListener('keydown', onDocumentKeydown);
			schedule();

			/* ---------- 卸载 ---------- */

			const dispose = () => {
				if (disposed) return;
				disposed = true;
				observer.disconnect();
				if (frame) window.cancelAnimationFrame(frame);
				closePopover();
				document.removeEventListener('click', onDocumentClick);
				document.removeEventListener('keydown', onDocumentKeydown);
				classifyFooter(false, state.bottomKeep);
				if (headEl && headEl.parentElement) headEl.parentElement.removeChild(headEl);
				headEl = null;
				document.documentElement.removeAttribute(FLAG_ATTR);
				document.documentElement.removeAttribute(COLLAPSED_ATTR);
				const style = document.getElementById(STYLE_ID);
				if (style && style.parentElement) style.parentElement.removeChild(style);
			};

			if (ctx && typeof ctx.effect === 'function') {
				ctx.effect(() => dispose, 'dsh-layout-tweaks: sidebar head');
			}
		}

		module.exports = { name, inject: [], apply };
		return module.exports;
	},
});
