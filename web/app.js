/* 启动：所有 view_*.js 已注册到 P9.views。 */
(function () {
  "use strict";
  if (!window.P9_DATA) {
    document.getElementById("view").innerHTML = '<p style="padding:40px">没有找到 data.js。请先运行 <code>python -m p9 build</code>。</p>';
    return;
  }
  window.P9.boot();
})();
