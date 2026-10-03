/**
 * dsh-layout-tweaks —— 浏览器半（client half）。
 *
 * 设计约束：**不修改任何其他插件**，也不接管任何 slot。
 * 全部效果由「注入一段 CSS + 一个自建折叠头」完成，React 渲染树零感知：
 *
 *   ① 会话头上边栏拆两行 —— 纯 CSS：拆掉 titleRow / titleCluster / headerActions
 *                           三层盒子（display:contents），用 ::after 伪元素当
 *                           零宽断行符，再用 order 排序。
 *   ② 面板列表折叠       —— 本插件自建的折叠头（唯一注入的 DOM）负责开关，
 *                          折叠态由 <html data-dsh-lt-collapsed> 驱动。
 *
 * 边界（v0.3.0 起）：本插件**完全不碰侧栏底部区域**。
 *
 * 0.1.0–0.2.4 曾经尝试把「上下文洞察 / 会话管理」这类底部入口并入折叠块，
 * 结论是这条路不划算：这些条目与面板列表的注册方式差异很大 —— 不同的槽位、
 * 不同的容器、不同的布局约束。
 * 跨容器搬移必须先把容器的盒子拆成 display:contents，而这会连带改变**容器自身的
 * flex 方向**：条目原本在横向容器里靠 `flex:1` 占满宽度，搬进纵向容器后同一个
 * `flex:1` 变成「纵向抢高度」，把工作区/会话列表挤成 0 高度；同时还要跟别的插件
 * 下发的 `order` 规则抢优先级。收益（少占一屏）远小于代价（布局脆弱、兼容成本高）。
 *
 * 所以现在的策略是：**底部区域一律交给宿主与其他插件，本插件一个字都不改** ——
 * 外显布局与「本插件没有任何 footer 干预」时逐像素一致，新插件注册什么就长什么样。
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

		const SIDEBAR_HOST_SELECTOR = '[data-slot="sidebar"]';
		const SESSION_HEADER_SLOT = '[data-slot="conversation.session.header"]';
		const WORKSPACES_SLOT = '[data-slot="sidebar.workspaces"]';

		const DEFAULT_STATE = {
			headerTwoRows: true,
			collapsed: false,
		};

		const TEXT_ZH = {
			head: '面板与插件',
			headAria: '面板与插件：点击折叠或展开',
			collapse: '折叠面板与插件',
			expand: '展开面板与插件',
		};

		const TEXT_EN = {
			head: 'Panels & plugins',
			headAria: 'Panels and plugins: click to collapse or expand',
			collapse: 'Collapse panels and plugins',
			expand: 'Expand panels and plugins',
		};

		/* ================================================================
		 * 样式
		 *
		 * 重排规则依赖 :has()，统一包在 @supports 里；不支持时插件静默不生效，
		 * 而不是把宿主排版改一半。
		 *
		 * 注意：侧栏底部区域（入口行 / 用量卡片 / 设置）在这里**没有任何规则** ——
		 * 那是有意为之，见文件头注释。
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

/* 侧栏收起成 56px 轨道时，折叠头没有意义 */
${SIDEBAR_HOST_SELECTOR} > div[class*="collapsed"] .dsh-lt-head{ display:none; }

@media (prefers-reduced-motion:reduce){
  .dsh-lt-head, .dsh-lt-caret{ transition:none; }
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
}

/* ---------- ② 折叠：收起面板列表 ---------- */
html[${COLLAPSED_ATTR}] ${SIDEBAR_HOST_SELECTOR} > div > nav{ display:none; }
`;

		/* ================================================================
		 * 状态：读 / 写 / 投影到 <html>
		 * ================================================================ */

		/** 本地持久化的开关状态；localStorage 不可用时回退默认值。 */
		function readState() {
			const state = {
				headerTwoRows: DEFAULT_STATE.headerTwoRows,
				collapsed: DEFAULT_STATE.collapsed,
			};
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (!raw) return state;
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object') {
					if (typeof parsed.headerTwoRows === 'boolean') state.headerTwoRows = parsed.headerTwoRows;
					if (typeof parsed.collapsed === 'boolean') state.collapsed = parsed.collapsed;
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

		/** 把开关状态投影成 <html> 上的属性，CSS 由它们驱动。 */
		function applyState(state) {
			const html = document.documentElement;
			if (state.headerTwoRows) html.setAttribute(FLAG_ATTR, FLAG_HEADER);
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

		/** 工作区 / 会话列表区域（折叠头的兜底锚点）。 */
		function regionArea() {
			const root = sidebarRoot();
			if (!root) return null;
			try {
				return root.querySelector(':scope > div:has(> ' + WORKSPACES_SLOT + ')');
			} catch (error) {
				return null;
			}
		}

		/* ================================================================
		 * 图标
		 * ================================================================ */

		const CARET_SVG =
			'<svg class="dsh-lt-caret" viewBox="0 0 16 16" aria-hidden="true">' +
			'<path d="M4 6.5L8 10.5L12 6.5" fill="none" stroke="currentColor" stroke-width="1.6" ' +
			'stroke-linecap="round" stroke-linejoin="round"/></svg>';

		/* ================================================================
		 * 插件主体
		 * ================================================================ */

		const name = PLUGIN_ID;

		/**
		 * 挂载插件：注入样式、投影状态、维护折叠头、观察 DOM 变化。
		 * @param ctx - 客户端 Cordis 上下文（本插件只用它做生命周期 effect）。
		 */
		function apply(ctx) {
			const text = pickText();
			const state = readState();

			let headEl = null;
			let frame = 0;
			let disposed = false;

			injectStyle();

			/* ---------- 状态变更入口 ---------- */

			/** 合并一次开关变更：落盘 → 投影 → 刷新折叠头。 */
			function onChange(patch) {
				for (const key of Object.keys(patch)) state[key] = patch[key];
				saveState(state);
				applyState(state);
				syncHead();
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

				// 计数 = 面板列表里的行数，让折叠头如实反映块内容量。
				const nav = panelList();
				const count = nav ? nav.querySelectorAll('button').length : 0;
				setText(headEl.querySelector('.dsh-lt-count'), count > 0 ? String(count) : '');
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
				head.innerHTML = CARET_SVG + '<span class="dsh-lt-title"></span><span class="dsh-lt-count"></span>';
				return head;
			}

			/**
			 * 保证折叠头位于面板列表（退化为工作区列表）之前。
			 * 幂等：已就位时只刷新文案与计数。
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
				document.removeEventListener('click', onDocumentClick);
				document.removeEventListener('keydown', onDocumentKeydown);
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
