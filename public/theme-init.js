/* 首帧前应用主题 / 字体，避免深色用户每次启动看到白闪（FOUC）。
 *
 * 为什么是独立文件而不是 index.html 内联脚本：
 * 生产 CSP 为 script-src 'self'，内联脚本会被直接拦截。
 *
 * 这里只做最小必要工作（读 localStorage → 写 html 属性），
 * 完整初始化（自定义主色 / 跟随系统监听）在 src/shared/hooks 的 initTheme()。
 */
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('notes-theme');
    var font = localStorage.getItem('notes-font');

    if (theme === 'system') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (theme) root.setAttribute('data-theme', theme);
    if (font) root.setAttribute('data-font', font);
  } catch (err) {
    /* 存储不可用时保持默认主题 */
  }
})();
