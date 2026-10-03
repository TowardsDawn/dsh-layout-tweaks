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
 *   5. 关键标记与必需文件必须存在（防止误删 / 漏提交）。
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

for (const token of ['data-dsh-lt-box', 'data-dsh-lt-fold', 'data-dsh-lt-keep', 'data-dsh-lt-settings', '!important']) {
	check(`源码包含 ${token}`, source.includes(token));
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
