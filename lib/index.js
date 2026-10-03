/**
 * dsh-layout-tweaks —— host 半。
 *
 * 本插件的全部工作都发生在浏览器半（`lib/client.js`）：它只做 DOM/CSS 层面的
 * 布局重排，不读取会话、不注册工具、不碰 Host 服务。因此这里不需要任何
 * Cordis 服务依赖，`apply` 保持为空 —— 这一行只是装配树里的挂载点，
 * 让 `cordis.patch.yml` 的 insert 有一个可加载的包主入口。
 */

/** 插件名（与客户端半、package.json 保持一致）。 */
const name = 'dsh-layout-tweaks';

/** 空实现：一切逻辑都在浏览器半。 */
function apply() {}

export { apply, name };
