/* 核心：工具函数、路由、顶栏、帮助、退出、报告弹层、按角色裁剪数据。 */
(function () {
  "use strict";
  var D = window.P9_DATA, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt;
  var P9 = window.P9 = { D: D, views: {}, state: {} };

  P9.TABS = [
    { id: "screen", name: "大屏", key: "0", desc: "数据大屏（打开时默认进入）：知识图谱主视觉、动态图表、学生轮播（姓名学号打码）、隐私保护面板、合成的实时动态。固定 1920×1080 设计稿等比缩放。" },
    { id: "cockpit", name: "驾驶舱", key: "1", desc: "给学校领导看的全校画像：学业、作业、知识掌握、心理健康群体风险、课堂参与（概念），按年级和班级对比，只显示汇总。" },
    { id: "student", name: "学生全景", key: "2", desc: "给老师看的单个学生：雷达图、成长曲线、知识追踪、认知诊断、自适应测验、引导建议和评语示例。" },
    { id: "homework", name: "作业评阅", key: "3", desc: "复用 p4：家长拍照上传 → AI 初评 → 教师复核的流程，量规、演示数据和截图。" },
    { id: "psych", name: "群体心理", key: "4", desc: "复用 p3：证据森林图、判别力上限、贴标签风险，以及在本校（合成）上的年级层面应用。" },
    { id: "reports", name: "多角色报告", key: "5", desc: "学生、老师、家长、学校领导、教育局五个视图，信息粒度各不相同，每个都能导出一页报告。" },
    { id: "methods", name: "方法墙", key: "6", desc: "每项方法的出处（已核实）、在本平台用在哪、成熟度标签，以及多模态学习分析的概念演示。" },
    { id: "compliance", name: "合规边界", key: "7", desc: "哪些数据可以用、需要谁同意，哪些用途禁止（附逐字核实的条款），本平台的默认设置。" },
  ];

  /* ---------------------------------------------------------------- 计时器与动画登记（退出时统一停止） */
  var viewTimers = [], globalTimers = [], rafs = {}, cleanups = [];
  P9.onLeave = function (fn) { cleanups.push(fn); };
  P9.hidden = function () { return document.hidden; };
  /* 静态模式：给配置差的电脑；系统设置了“减少动态效果”时默认开启 */
  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduce = false; }
  P9.isStatic = function () { return document.body.classList.contains("static"); };
  P9.every = function (fn, ms, global) { var id = setInterval(fn, ms); (global ? globalTimers : viewTimers).push(id); return id; };
  P9.later = function (fn, ms) { var id = setTimeout(fn, ms); viewTimers.push(id); return id; };
  P9.anim = function (name, fn) {
    // fn(t) 返回 false 时停止
    if (rafs[name]) cancelAnimationFrame(rafs[name].id);
    var rec = { id: 0, alive: true };
    rafs[name] = rec;
    function loop(t) { if (!rec.alive) return; if (fn(t) === false) { rec.alive = false; return; } rec.id = requestAnimationFrame(loop); }
    rec.id = requestAnimationFrame(loop);
  };
  P9.stopView = function () {
    viewTimers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
    viewTimers = [];
    Object.keys(rafs).forEach(function (k) { rafs[k].alive = false; cancelAnimationFrame(rafs[k].id); });
    rafs = {};
    var cs = cleanups; cleanups = [];
    cs.forEach(function (fn) { try { fn(); } catch (e) { /* 忽略清理中的错误 */ } });
  };
  P9.stopAll = function () {
    P9.stopView();
    globalTimers.forEach(function (id) { clearInterval(id); });
    globalTimers = [];
  };

  /* ---------------------------------------------------------------- HTML 小工具 */
  P9.h = {
    panel: function (title, body, opt) {
      opt = opt || {};
      return '<section class="panel fade-in' + (opt.cls ? " " + opt.cls : "") + '"' + (opt.id ? ' id="' + opt.id + '"' : "") + ">" +
        (title ? "<h2>" + title + (opt.tags || "") + "</h2>" : "") + body + "</section>";
    },
    tag: function (kind, text, title) {
      return '<span class="tag ' + kind + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + esc(text) + "</span>";
    },
    maturity: function (m) {
      var map = { implemented: "impl", concept: "concept", research: "research" };
      return P9.h.tag(map[m], D.methods.maturity[m]);
    },
    syn: function () { return P9.h.tag("syn", "合成数据", "这些数字来自程序生成的虚构数据，在合成数据上真实计算"); },
    p3: function () { return P9.h.tag("p3", "来自 p3", "数字取自 p3-student-mh 的 result.json"); },
    p4: function () { return P9.h.tag("p4", "来自 p4", "取自 p4-edu-eval 的量规、演示数据或截图"); },
    lit: function () { return P9.h.tag("lit", "论文数字", "数字来自已发表文献"); },
    concept: function () { return P9.h.tag("concept", "概念演示", "合成信号或示意动画，没有真实模型，也不处理任何真实数据"); },
    kpi: function (v, l, opt) {
      opt = opt || {};
      return '<div class="kpi" title="' + esc(opt.title || "") + '"><div class="v num" data-count="' + (opt.raw != null ? opt.raw : "") + '" data-dec="' + (opt.dec || 0) + '">' + v +
        (opt.unit ? "<small>" + opt.unit + "</small>" : "") + '</div><div class="l">' + l + "</div></div>";
    },
    legend: function (items) {
      return '<div class="legend">' + items.map(function (it) {
        return '<span><i class="' + (it.dash ? "dash" : "") + '" style="background:' + it.color + ";color:" + it.color + '"></i>' + esc(it.label) + "</span>";
      }).join("") + "</div>";
    },
    pct: function (v, d) { return v == null ? "—" : fmt(100 * v, d == null ? 1 : d) + "%"; },
    refList: function (keys) {
      if (!keys || !keys.length) return '<p class="note">本平台自己的实现，没有对应的单篇论文。</p>';
      return '<ul class="reflist">' + keys.map(function (k) {
        var r = D.refs[k];
        if (!r || !r.verified) return "<li>" + esc(k) + ' <span class="tag warn">[未核实]</span></li>';
        return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.text) + "</a> " +
          '<span class="tag ok" title="已用 Crossref / arXiv / Semantic Scholar 核对标题与发表处（' + esc(D.refs_checked_at) + '）">已核实</span></li>';
      }).join("") + "</ul>";
    },
    clauseChip: function (id) {
      var c = P9.clause(id);
      if (!c) return "";
      var s = D.legal.sources[c.source];
      return '<a class="chip" href="#/compliance/' + c.id + '" title="' + esc(s.title + " " + c.article + "：" + c.summary) + '">' +
        esc(shortLaw(c.source) + " " + c.article) + (c.verified ? "" : " [未核实]") + "</a>";
    },
  };
  function shortLaw(src) {
    return { eu_ai_act: "欧盟 AI 法", eu_omnibus: "欧盟 2026/1744", gdpr: "GDPR", pipl: "个人信息保护法", face_rules: "人脸识别办法",
      minor_online: "未成年人网络保护条例", child_info: "儿童个人信息规定", moe_apps: "教育部等八部门意见", school_protect: "未成年人学校保护规定" }[src] || src;
  }
  P9.shortLaw = shortLaw;
  P9.clause = function (id) { for (var i = 0; i < D.legal.clauses.length; i++) if (D.legal.clauses[i].id === id) return D.legal.clauses[i]; return null; };
  P9.student = function (sid) {
    var ss = D.focal.students;
    for (var i = 0; i < ss.length; i++) if (ss[i].sid === sid) return ss[i];
    return ss[0];
  };
  P9.studentsSorted = function () { return D.focal.students.slice().sort(function (a, b) { return a.sid < b.sid ? -1 : 1; }); };
  P9.weekLabels = function () { var x = ["上学期末"]; for (var w = 1; w <= 6; w++) x.push("第" + w + "周"); return x; };
  P9.dayLabels = function () { var x = []; for (var d = 0; d < D.meta.n_days; d++) x.push(d % D.meta.days_per_week === 0 ? "第" + (d / D.meta.days_per_week + 1) + "周" : ""); return x; };

  /* 数字滚动动画 */
  P9.countUp = function (root) {
    var els = (root || document).querySelectorAll("[data-count]");
    var t0 = null;
    var items = [];
    els.forEach(function (el) {
      var raw = parseFloat(el.getAttribute("data-count"));
      if (isNaN(raw)) return;
      var unit = el.querySelector("small");
      items.push({ el: el, v: raw, dec: parseInt(el.getAttribute("data-dec") || "0", 10), unit: unit ? unit.outerHTML : "" });
    });
    if (!items.length) return;
    if (P9.isStatic()) return;  // 静态模式直接显示最终值（HTML 里已经是最终值）
    P9.anim("countup", function (t) {
      if (t0 == null) t0 = t;
      var f = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - f, 3);
      items.forEach(function (it) {
        var v = it.v * e;
        it.el.innerHTML = (it.v >= 1000 ? Math.round(v).toLocaleString("zh-CN") : v.toFixed(it.dec)) + it.unit;
      });
      return f < 1;
    });
  };

  /* ---------------------------------------------------------------- 按角色裁剪数据：报告只能拿到这里返回的对象 */
  var CHILD_NAME = "张小明";
  function childRecord(withFlag) {
    var s = D.focal.students.filter(function (x) { return x.name === CHILD_NAME; })[0];
    var o = { name: s.name, sid: s.sid, class_name: s.class_name, radar: s.radar, growth: s.growth, homework: s.homework,
      homework_summary: s.homework_summary, behavior: s.behavior, kt_end: { bkt: s.kt.bkt[s.kt.bkt.length - 1] },
      cat_final: s.cat.trace[s.cat.trace.length - 1],
      guidance: s.guidance.filter(function (g) { return g.category !== "关怀"; }), comment: s.comment.text };
    if (withFlag) o.psych_flag = s.psych_flag;
    return o;
  }
  P9.scope = function (role) {
    if (role === "student") return { role: role, me: childRecord(false), kcs: D.meta.kcs };
    if (role === "parent") return { role: role, child: childRecord(false), kcs: D.meta.kcs, consent: D.p4.no_consent.indexOf(CHILD_NAME) < 0 };
    if (role === "teacher") return {
      role: role, class_name: D.meta.focal_class, class_mean: D.focal.class_mean, kcs: D.meta.kcs,
      students: P9.studentsSorted().map(function (s) {
        return { sid: s.sid, name: s.name, radar: s.radar, psych_flag: s.psych_flag, kt_end: s.kt.bkt[s.kt.bkt.length - 1],
          n_guidance: s.guidance.length, top_guidance: s.guidance.filter(function (g) { return g.category === "知识"; }).slice(0, 1).map(function (g) { return g.title; }) };
      }),
    };
    if (role === "leader") return { role: role, school: D.school.summary, grades: D.school.grades, classes: D.school.classes, psych: D.school.psych, kcs: D.meta.kcs };
    if (role === "bureau") return { role: role, region: D.region, kcs: D.meta.kcs };
    return {};
  };

  /* ---------------------------------------------------------------- 路由 */
  P9.parse = function () {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h ? h.split("/").map(decodeURIComponent) : [];
    if (!parts[0] || !P9.views[parts[0]]) parts[0] = "screen";
    return parts;
  };
  P9.go = function (path) { location.hash = "#/" + path; };
  var lastView = null;
  P9.render = function () {
    var parts = P9.parse();
    P9.stopView();
    document.body.classList.toggle("screen-mode", parts[0] === "screen");
    var view = document.getElementById("view");
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-id") === parts[0]); });
    try {
      view.innerHTML = P9.views[parts[0]](parts.slice(1)) || "";
      if (P9.views[parts[0]].after) P9.views[parts[0]].after(parts.slice(1));
    } catch (e) {
      view.innerHTML = '<section class="panel"><h2>渲染出错</h2><pre class="code">' + esc(e && e.stack || e) + "</pre></section>";
      throw e;
    }
    if (lastView !== parts[0]) window.scrollTo(0, 0);
    lastView = parts[0];
    P9.countUp(view);
    markVisited(parts[0] === "reports" ? "reports/" + (parts[1] || "teacher") : parts[0]);
  };

  /* ---------------------------------------------------------------- 帮助 / 汇报路线 */
  var ROUTE = [
    ["screen", "数据大屏：知识图谱、学生轮播（打码）、隐私保护面板"],
    ["cockpit", "驾驶舱：全校画像一屏看完"],
    ["student", "学生全景：知识追踪 + 认知诊断 + 自适应测验，三种方法相互印证"],
    ["homework", "作业评阅：家长拍照 → AI 初评 → 教师复核"],
    ["psych", "群体心理：为什么只做群体层面"],
    ["reports/teacher", "多角色报告：老师视图"],
    ["reports/parent", "多角色报告：家长视图（只看自己的孩子）"],
    ["reports/bureau", "多角色报告：教育局视图（只有汇总）"],
    ["methods", "方法墙：每项方法的出处与成熟度"],
    ["compliance", "合规边界：可信 AI 的设计"],
  ];
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  var visited = {};
  try { visited = JSON.parse(store("p9.visited") || "{}") || {}; } catch (e) { visited = {}; }
  function markVisited(k) { visited[k] = 1; store("p9.visited", JSON.stringify(visited)); if (document.getElementById("help-modal").classList.contains("show")) helpBody(); }
  function helpBody() {
    var tabs = P9.TABS.map(function (t) { return "<tr><td><kbd>" + t.key + "</kbd> " + esc(t.name) + "</td><td>" + esc(t.desc) + "</td></tr>"; }).join("");
    var route = ROUTE.map(function (r, i) {
      return '<li class="' + (visited[r[0]] ? "done" : "") + '"><span class="ck">' + (visited[r[0]] ? "✓" : i + 1) + '</span><a href="#/' + r[0] + '" data-close="1">' + esc(r[1]) + "</a></li>";
    }).join("");
    document.getElementById("help-body").innerHTML =
      '<div class="row"><h2 class="grow">操作说明</h2><button class="btn" id="help-close">开始看（Esc）</button></div>' +
      '<p>这是一个<b>离线展示版</b>：把 p3（学生心理群体风险）和 p4（作业智评）合进一个“学生成长全景评价”界面。' +
      '页面上的学校、学生、成绩和作答记录<b>全部是程序生成的合成数据</b>（右上角一直显示“演示数据 · 合成”）；' +
      '模型是在这些合成数据上真实训练和计算的，论文里的数字附出处。</p>' +
      '<div class="grid2"><div><h3>推荐汇报路线（看过的会自动打勾）</h3><ol class="route">' + route + "</ol></div>" +
      '<div><h3>模块</h3><table class="t"><colgroup><col style="width:30%"><col></colgroup>' + tabs + "</table>" +
      '<h3>快捷键</h3><p class="note"><kbd>0</kbd> 数据大屏　<kbd>1</kbd>–<kbd>7</kbd> 切换模块　<kbd>H</kbd> 打开本说明　<kbd>B</kbd> 投影比例　<kbd>S</kbd> 静态模式（关闭动画）　<kbd>P</kbd> 自动巡演　<kbd>Esc</kbd> 关闭弹层</p>' +
      '<h3>小提示</h3><ul class="note"><li>图上的点和格子都可以悬停查看数值。</li><li>“学生全景”右侧的子标签可以切换知识追踪、认知诊断、自适应测验等证据；自适应测验可以自己作答。</li>' +
      "<li>“多角色报告”里每个视图都能导出成一页报告（打印或另存为 PDF）。</li></ul></div></div>";
    document.getElementById("help-close").onclick = closeHelp;
    document.querySelectorAll("#help-body [data-close]").forEach(function (a) { a.addEventListener("click", closeHelp); });
  }
  function openHelp() { helpBody(); document.getElementById("help-modal").classList.add("show"); }
  function closeHelp() { document.getElementById("help-modal").classList.remove("show"); store("p9.helpSeen", "1"); }
  P9.openHelp = openHelp;

  /* ---------------------------------------------------------------- 报告弹层 */
  P9.openReport = function (html) {
    document.getElementById("report-body").innerHTML = html;
    document.getElementById("report-modal").classList.add("show");
  };
  function closeReport() { document.getElementById("report-modal").classList.remove("show"); }

  /* ---------------------------------------------------------------- 巡演：大屏与各页面之间自动轮播，适合无人值守投影 */
  /* 覆盖全部 8 个模块：学生全景的 4 个证据子页、5 个角色报告、方法墙（含情绪识别的概念演示）。
     停留时间：大屏 30 秒；内容多的页面 14–18 秒；其余 9–12 秒。一轮约 3 分 30 秒。
     {sid} 在运行时换成学生全景默认的那名学生。页面比窗口高时，停留期间缓慢滚到底部再回到顶部。 */
  var tourId = null, tourScroll = null;
  var TOUR = [["screen", 30000], ["cockpit", 16000], ["student/{sid}/kt", 12000], ["student/{sid}/cdm", 11000], ["student/{sid}/cat", 14000],
    ["student/{sid}/guide", 11000], ["homework", 15000], ["psych", 15000], ["reports/student", 9000], ["reports/teacher", 10000],
    ["reports/parent", 9000], ["reports/leader", 10000], ["reports/bureau", 9000], ["methods/dkt", 11000], ["methods/mm_emotion", 11000],
    ["compliance", 18000]];
  P9.TOUR = TOUR;
  function tourPath(i) { return TOUR[i][0].replace("{sid}", P9.student().sid); }
  function tourBtns() {
    document.querySelectorAll("#tour-btn, [data-tour-btn]").forEach(function (b) { b.classList.toggle("on", !!tourId); });
  }
  function stopTourScroll() { if (tourScroll) { clearInterval(tourScroll); tourScroll = null; } }
  function tourAutoScroll(ms) {
    stopTourScroll();
    var t0 = Date.now(), wait = 3000, tail = 1500;   // 先停 3 秒看首屏，最后 1.5 秒停在底部
    tourScroll = setInterval(function () {
      if (P9.hidden()) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max < 40 || document.body.classList.contains("screen-mode")) return;
      var f = (Date.now() - t0 - wait) / Math.max(1, ms - wait - tail);
      window.scrollTo(0, Math.round(max * Math.max(0, Math.min(1, f))));
    }, 60);
  }
  function tourStep(i) {
    tourAutoScroll(TOUR[i][1]);
    tourId = setTimeout(function () {
      var j = (i + 1) % TOUR.length;
      closeHelp(); closeReport();
      P9.go(tourPath(j));
      window.scrollTo(0, 0);
      tourStep(j);
    }, TOUR[i][1]);
  }
  function stopTour() { if (tourId) { clearTimeout(tourId); tourId = null; } stopTourScroll(); tourBtns(); }
  function toggleTour() {
    if (tourId) { stopTour(); return; }
    var cur = P9.parse().join("/"), i = 0;
    TOUR.forEach(function (t, k) { if (cur.indexOf(tourPath(k)) === 0 || cur === t[0]) i = k; });
    tourStep(i);
    tourBtns();
  }
  P9.toggleTour = toggleTour;
  P9.isTouring = function () { return !!tourId; };

  /* ---------------------------------------------------------------- 退出 */
  function exitApp() {
    P9.stopAll();
    stopTour();
    window.removeEventListener("hashchange", P9.render);
    document.removeEventListener("keydown", onKey);
    document.getElementById("view").innerHTML = "";
    window.P9_DATA = null;
    P9.D = null;
    try { window.close(); } catch (e) { /* 浏览器通常不允许脚本关闭用户打开的标签页 */ }
    document.getElementById("ended").classList.add("show");
  }

  function onKey(e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") { closeHelp(); closeReport(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.key.toLowerCase();
    if (k === "h" || k === "?") openHelp();
    else if (k === "b") toggleBig();
    else if (k === "p") toggleTour();
    else if (k === "s") P9.toggleStatic();
    else {
      var t = P9.TABS.filter(function (t) { return t.key === k; })[0];
      if (t) P9.go(t.id);
    }
  }
  P9.toggleStatic = function (force) {
    var on = force == null ? !P9.isStatic() : !!force;
    document.body.classList.toggle("static", on);
    store("p9.static", on ? "1" : "0");
    document.querySelectorAll("[data-static-btn]").forEach(function (b) { b.classList.toggle("on", on); });
    if (P9.parse()[0] === "screen") P9.render();
  };
  function toggleBig() {
    document.body.classList.toggle("big");
    document.getElementById("big-btn").classList.toggle("on", document.body.classList.contains("big"));
    store("p9.big", document.body.classList.contains("big") ? "1" : "0");
  }

  P9.boot = function () {
    var tabs = document.getElementById("tabs");
    tabs.innerHTML = P9.TABS.map(function (t) {
      return '<button data-id="' + t.id + '" title="' + esc(t.desc + "（按 " + t.key + "）") + '">' + esc(t.name) + "</button>";
    }).join("");
    tabs.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) P9.go(b.getAttribute("data-id")); });
    document.getElementById("help-btn").onclick = openHelp;
    document.getElementById("big-btn").onclick = toggleBig;
    document.querySelectorAll("#top [data-static-btn]").forEach(function (b) { b.onclick = function () { P9.toggleStatic(); }; });
    document.getElementById("tour-btn").onclick = toggleTour;
    document.getElementById("exit-btn").onclick = exitApp;
    document.getElementById("close-report").onclick = closeReport;
    document.getElementById("print-btn").onclick = function () { window.print(); };
    document.getElementById("help-modal").addEventListener("click", function (e) { if (e.target.id === "help-modal") closeHelp(); });
    document.getElementById("report-modal").addEventListener("click", function (e) { if (e.target.id === "report-modal") closeReport(); });
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", P9.render);
    var f = D.footer;
    document.getElementById("credits").innerHTML = esc(f.author) + " · " + esc(f.university_en) + " · " + esc(f.university_ko) + " · " + esc(f.license) +
      "<br>AI 教学演示案例 / AI Teaching Demos · gaoshuyao.mk@gmail.com · 全部学生、学校与成绩均为程序生成的合成数据，仅作概念演示 · 构建 " + esc(D.build.version) + " / " + esc(D.build.run_id) + " · 指标见 " + esc(D.build.result_path);
    if (store("p9.big") === "1") toggleBig();
    var st = store("p9.static");
    if (st === "1" || (st == null && reduce)) document.body.classList.add("static");
    document.querySelectorAll("[data-static-btn]").forEach(function (b) { b.classList.toggle("on", P9.isStatic()); });
    /* 启动参数（启动演示.bat 与在线链接用）：?tour 打开即巡演、不弹说明；?static 强制静态模式 */
    var q = location.search;
    if (/[?&]static\b/.test(q)) document.body.classList.add("static");
    document.querySelectorAll("[data-static-btn]").forEach(function (b) { b.classList.toggle("on", P9.isStatic()); });
    P9.render();
    if (/[?&]tour\b/.test(q)) toggleTour();
    else if (!store("p9.helpSeen") && !/[?&]nohelp/.test(q)) openHelp();
  };
})();
