// 应用菜单 / 托盘菜单模板：纯数据 + 回调注入，不 require electron —— 可直接单测。
//
// 抽成模块的两个理由（都是「只有可断言才守得住」的那类改动）：
//  * role:close 的默认加速键是 Ctrl+W，会抢走渲染层的「关闭当前标签」
//    （keyboardSlice 已注册 Ctrl+W）—— 用户点关闭标签却把整个窗口关了；
//  * 托盘新增项（如「快速打开…」）必须能断言它真的发出了 app:action quickOpen，而不是摆设。

/** 窗口关闭菜单项的加速键：把 Ctrl+W 让给标签栏 */
const WINDOW_CLOSE_ACCELERATOR = 'CmdOrCtrl+Shift+W';

/**
 * 应用菜单模板（中文）。onAbout 由主进程注入 —— 模板里不碰 BrowserWindow/dialog。
 * @param {{ onAbout?: () => void }} [hooks]
 * @returns {Array<object>}
 */
function buildAppMenuTemplate(hooks = {}) {
  const onAbout = typeof hooks.onAbout === 'function' ? hooks.onAbout : () => {};
  return [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        // P1-6：设置页新增了缩放控件，但菜单入口必须保留（设置里的提示文案仍指向这里）
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        // 默认加速键 Ctrl+W 会抢走「关闭当前标签」，这里显式让位给标签栏
        { role: 'close', label: '关闭', accelerator: WINDOW_CLOSE_ACCELERATOR },
      ],
    },
    {
      label: '帮助',
      submenu: [{ label: '关于', click: () => onAbout() }],
    },
  ];
}

/**
 * 托盘右键菜单模板。所有动作由主进程注入，模板只负责顺序与文案。
 * @param {{
 *   onOpen?: () => void,
 *   onQuickNote?: () => void,
 *   onQuickOpen?: () => void,
 *   onOpenDataDir?: () => void,
 *   onQuit?: () => void,
 * }} [hooks]
 * @returns {Array<object>}
 */
function buildTrayMenuTemplate(hooks = {}) {
  const call = (fn) => () => (typeof fn === 'function' ? fn() : undefined);
  return [
    { label: '打开拾页', click: call(hooks.onOpen) },
    { label: '新建便签', click: call(hooks.onQuickNote) },
    // 快速打开（Ctrl+P）此前只有键盘入口，托盘 / 鼠标用户到不了
    { label: '快速打开…', click: call(hooks.onQuickOpen) },
    { type: 'separator' },
    { label: '打开数据目录', click: call(hooks.onOpenDataDir) },
    { type: 'separator' },
    { label: '退出', click: call(hooks.onQuit) },
  ];
}

module.exports = { buildAppMenuTemplate, buildTrayMenuTemplate, WINDOW_CLOSE_ACCELERATOR };
