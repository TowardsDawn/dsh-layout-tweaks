#!/usr/bin/env node
/**
 * 离线预检 —— 不需要 DSH 运行时、不需要浏览器。
 *
 * 拦住最容易在客户端插件上翻车的一类错误：
 *   1. `lib/client.js` 语法必须合法。**整段 CSS 活在一个模板字符串里，
 *      注释里误用反引号会提前终止字符串、让模块 import 失败**（真踩过），
 *      而这一步在构造阶段就会把它抛出来；
 *   2. 必须按 `window.__ModuleLoader__.load({ id, factory })` 协议注册自己；
 *   3. `factory()` 必须返回 `{ name, apply }`；
 *   4. host 半必须能被 import 且导出 `name` / `apply`；
 *   5. 关键标记与必需文件必须存在（防止误删 / 漏提交）；
 *   6. 底栏排布的选择器必须只认稳定标识，已废弃的「入口并入折叠块」
 *      搬运机制（拆容器盒子那套）不得回潮。
 *
 * 用法：`npm test` 或 `node test/smoke.mjs`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const results = [];
const failures = [];

/**
 * 记录一项检查结果。
 * @param label - 人类可读的检查项名称。
 * @param ok - 是否通过。
 * @param detail - 失败时的补充说明。
 */
function check(label, ok, detail) {
	results.push({ label, ok, detail });
	if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
}

/* ---------- 1~3：浏览器半 ---------- */

const clientPath = join(ROOT, 'lib', 'client.js');
const source = readFileSync(clientPath, 'utf8');
let registration;

try {
	// new Function 在「构造」阶段就解析语法：模板字符串被反引号截断会在这里抛错。
	const run = new Function('window', source);
	run({
		__ModuleLoader__: {
			load(value) {
				registration = value;
			},
		},
	});
	check('client.js 通过语法解析', true);
} catch (error) {
	check('client.js 通过语法解析', false, String((error && error.message) || error));
}

check('按 __ModuleLoader__.load 协议注册', !!registration && registration.id === 'dsh-layout-tweaks');

let plugin = null;
try {
	plugin = registration ? registration.factory() : null;
	check(
		'factory() 返回插件导出',
		!!plugin && plugin.name === 'dsh-layout-tweaks' && typeof plugin.apply === 'function',
	);
} catch (error) {
	check('factory() 返回插件导出', false, String((error && error.message) || error));
}

/* ---------- 4：host 半 ---------- */

try {
	const host = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);
	check('host 半导出 name/apply', host.name === 'dsh-layout-tweaks' && typeof host.apply === 'function');
} catch (error) {
	check('host 半导出 name/apply', false, String((error && error.message) || error));
}

/* ---------- 5：关键标记与必需文件 ---------- */

for (const token of ['dsh-lt-head', 'dsh-lt-caret', 'header-two-rows', 'footer-layout', 'data-dsh-lt-collapsed', 'conversation.session.header']) {
	check(`源码包含 ${token}`, source.includes(token));
}

/*
 * 6：底栏排布必须只依赖稳定标识。
 * `data-dsh-plugin` 是各插件自己写在元素上的常量，`sm-footerBtn` 是无 hash 的
 * 类名后缀 —— 两者都不会随打包或语言变化。若以后有人图省事改用
 * `[class*="hHd-Xa_"]` 这类 hash 前缀或 aria 文案，这里会先炸。
 */
for (const token of [
	'sidebar.footer.action',
	'footerActions',
	'sm-footerBtn',
	'data-dsh-plugin="update"',
	'data-dsh-plugin="remote-bridge"',
]) {
	check(`源码包含 ${token}（底栏排布）`, source.includes(token));
}

/*
 * 7：边界防回归 —— 已废弃的「入口并入折叠块」实现不得回潮。
 * 那几个标记会拆容器盒子（display:contents）并改变容器自身的 flex 方向，
 * 正是 0.1.0–0.2.4 那段被删掉的逻辑。现在的底栏排布只在**原容器内**排序。
 */
for (const token of [
	'data-dsh-lt-fold',
	'data-dsh-lt-keep',
	'data-dsh-lt-box',
	'data-dsh-lt-settings',
	'BOTTOM_KEEP_SELECTORS',
]) {
	check(`源码不包含 ${token}（旧搬运机制）`, !source.includes(token));
}

check('夹具存在', existsSync(join(ROOT, 'test', 'fixture.html')));

for (const file of ['package.json', 'cordis.patch.yml', 'README.md', 'README.en.md', 'CHANGELOG.md', 'LICENSE', 'lib/index.js']) {
	check(`必需文件存在：${file}`, existsSync(join(ROOT, file)));
}

/* ---------- 输出 ---------- */

for (const item of results) {
	console.log(`${item.ok ? '  ok  ' : '  FAIL'}  ${item.label}${item.detail ? `  (${item.detail})` : ''}`);
}
console.log('');

if (failures.length > 0) {
	console.error(`${failures.length} 项未通过：`);
	for (const item of failures) console.error(`  - ${item}`);
	process.exit(1);
}
console.log(`全部 ${results.length} 项通过。`);
