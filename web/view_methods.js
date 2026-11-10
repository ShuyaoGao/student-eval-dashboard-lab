/* 前沿方法墙：卡片 + 选中卡片的详情（出处、用在哪、实测指标、概念演示动画）。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;
  var filter = "all";

  function metricBlock(key) {
    var M = D.models;
    if (!key) return "";
    if (key.indexOf("kt") === 0 && key !== "kt.fairness") {
      var A = M.kt.auc, m = key.split(".")[1];
      return '<div class="grid3"><div class="kpi"><div class="v num">' + fmt(A[m].value, 3) + '</div><div class="l">留出学生上的 AUC</div></div>' +
        '<div class="kpi"><div class="v num">' + fmt(A[m].ci_low, 3) + "–" + fmt(A[m].ci_high, 3) + '</div><div class="l">95% 区间（按学生 bootstrap）</div></div>' +
        '<div class="kpi"><div class="v num">' + A[m].n_responses.toLocaleString("zh-CN") + '</div><div class="l">留出作答次数</div></div></div>' +
        (m === "dkt" ? '<p class="note">' + esc(M.kt.dkt.arch) + "，共 " + M.kt.dkt.n_params + " 个参数；按验证集 AUC 选第 " + M.kt.dkt.best_epoch + " 轮。</p>" : "");
    }
    if (key === "kt.fairness") {
      var F = M.kt.fairness, lab = { female: "女生", male: "男生", left_behind: "留守", not_left_behind: "非留守" };
      return '<table class="t"><tr><th>分组</th><th class="n">学生数</th><th class="n">BKT AUC</th><th class="n">DKT-lite AUC</th></tr>' + Object.keys(F).map(function (k) {
        return "<tr><td>" + lab[k] + '</td><td class="n">' + F[k].n_students + '</td><td class="n">' + fmt(F[k].bkt, 3) + '</td><td class="n">' + fmt(F[k].dkt, 3) + "</td></tr>";
      }).join("") + '</table><p class="note">合成数据的生成机制里没有对任何群体设置偏差，所以各组差别小是预期结果；这张表的意义在于“每次换数据、换模型都要重算”。</p>';
    }
    if (key === "cdm") {
      var C = M.cdm;
      return '<div class="grid3"><div class="kpi"><div class="v num">' + h.pct(C.attribute_accuracy_mean) + '</div><div class="l">属性判定准确率</div></div>' +
        '<div class="kpi"><div class="v num">' + h.pct(C.pattern_accuracy) + '</div><div class="l">全部属性判对</div></div>' +
        '<div class="kpi"><div class="v num">' + fmt(C.slip_rmse, 3) + " / " + fmt(C.guess_rmse, 3) + '</div><div class="l">失误率 / 猜对率 估计误差</div></div></div>';
    }
    if (key === "irt") {
      var I = M.irt;
      return '<div class="grid3"><div class="kpi"><div class="v num">' + I.n_calibration_examinees + '</div><div class="l">标定样本（每人 ' + I.responses_per_examinee + " 题）</div></div>" +
        '<div class="kpi"><div class="v num">' + fmt(I.corr_a, 3) + '</div><div class="l">区分度 a 与真值的相关</div></div>' +
        '<div class="kpi"><div class="v num">' + fmt(I.corr_b, 3) + '</div><div class="l">难度 b 与真值的相关</div></div></div>';
    }
    if (key === "cat") {
      var S = M.cat;
      return '<div class="grid3"><div class="kpi"><div class="v num">' + fmt(S.maxinfo.rmse_by_step[9], 3) + '</div><div class="l">10 题后 RMSE（自适应）</div></div>' +
        '<div class="kpi"><div class="v num">' + fmt(S.random.rmse_by_step[9], 3) + '</div><div class="l">10 题后 RMSE（随机抽题）</div></div>' +
        '<div class="kpi"><div class="v num">' + h.pct(S.maxinfo.coverage95_final) + '</div><div class="l">95% 区间覆盖率</div></div></div>';
    }
    if (key === "psych") {
      var sm = D.p3.sim_models.depression, ra = D.p3.real_auc;
      return '<div class="grid3"><div class="kpi"><div class="v num">' + fmt(sm.auc.value, 3) + '</div><div class="l">合成数据上限 AUC</div></div>' +
        '<div class="kpi"><div class="v num">' + fmt(ra.real_dep_cesdc29.value, 3) + '</div><div class="l">真实开放数据 AUC</div></div>' +
        '<div class="kpi"><div class="v num">' + h.pct(sm.screening.false_positive_share_of_selected.value) + '</div><div class="l">前 20% 名单中并非阳性</div></div></div>';
    }
    return "";
  }

  function card(m, sel) {
    var cls = { implemented: "impl", concept: "concept", research: "research" }[m.maturity];
    return '<div class="mcard' + (m.id === sel ? " on" : "") + '" data-m="' + m.id + '" title="点击查看详情"><div class="g">' + esc(m.group) + '</div><div class="nm">' + esc(m.name) + "</div>" +
      '<span class="tag ' + cls + '">' + esc(D.methods.maturity[m.maturity]) + "</span>" + '<div class="ol" style="margin-top:4px">' + esc(m.one_line) + "</div></div>";
  }

  function detail(m) {
    var demo = m.demo ? '<h3>概念演示（合成信号，不调用摄像头或麦克风）</h3><canvas class="demo" id="demo-cv" width="900" height="300"></canvas><p class="note" id="demo-cap"></p>' : "";
    var legal = m.legal ? "<h3>相关条款</h3><p>" + m.legal.map(h.clauseChip).join("") + "</p>" : "";
    return h.panel(esc(m.name), h.maturity(m.maturity) + '<p style="margin-top:8px">' + esc(m.one_line) + "</p>" +
      '<p class="note"><b>在本平台用在哪：</b>' + esc(m.where) + "</p>" + metricBlock(m.metric) + demo + legal +
      "<h3>论文出处</h3>" + h.refList(m.refs) + '<p class="note">出处用 Crossref / arXiv / Semantic Scholar 自动核对（' + esc(D.refs_checked_at) + "），脚本 tools/verify_refs.py。</p>");
  }

  function compare() {
    var A = D.models.kt.auc, S = D.models.cat;
    var NAMES = { baseline: "基线", pfa: "PFA", bkt: "BKT", dkt: "DKT-lite", oracle: "生成机制上限" };
    var bars = Ch.hbars(["baseline", "pfa", "bkt", "dkt", "oracle"].map(function (k, i) {
      return { label: NAMES[k], value: A[k].value, color: ["#5a7298", "#6aa8ff", "#3fe0ff", "#a58bff", "#ffc857"][i], text: fmt(A[k].value, 3) };
    }), { max: 1, left: 110, right: 60, w: 480, rowH: 24 });
    var steps = []; for (var i = 1; i <= 10; i++) steps.push(String(i));
    var cat = Ch.line(steps, [{ label: "自适应", color: "#3fe0ff", values: S.maxinfo.rmse_by_step }, { label: "随机", color: "#ff6fae", values: S.random.rmse_by_step }], { h: 150, yMin: 0, yMax: 1, yDec: 1, tipDec: 3 });
    return h.panel("实测指标总览（合成数据上的真实计算）", '<div class="grid2"><div><h3 style="margin-top:0">知识追踪 AUC</h3>' + bars + "</div><div>" +
      '<h3 style="margin-top:0">CAT：估计误差随题数下降</h3>' + h.legend([{ label: "自适应", color: "#3fe0ff" }, { label: "随机抽题", color: "#ff6fae" }]) + cat + "</div></div>" +
      '<p class="note">所有指标都在 ' + esc(D.build.result_path) + " 里，页面直接读取，不手写数字。合成数据的生成机制已知，这些数字说明“方法实现正确、在理想条件下能做到什么”，<b>不是</b>真实课堂上的准确率。</p>", { tags: h.syn() });
  }

  function view(args) {
    var cards = D.methods.cards, sel = args[0] || "dkt";
    var m = cards.filter(function (c) { return c.id === sel; })[0] || cards[0];
    var counts = { implemented: 0, concept: 0, research: 0 };
    cards.forEach(function (c) { counts[c.maturity]++; });
    var chips = [["all", "全部 " + cards.length], ["implemented", D.methods.maturity.implemented + " " + counts.implemented], ["concept", D.methods.maturity.concept + " " + counts.concept], ["research", D.methods.maturity.research + " " + counts.research]]
      .map(function (c) { return '<button data-f="' + c[0] + '" class="' + (filter === c[0] ? "on" : "") + '">' + esc(c[1]) + "</button>"; }).join("");
    var shown = cards.filter(function (c) { return filter === "all" || c.maturity === filter; });
    var head = '<div class="page-head"><h1>前沿方法墙 · <em>新方法也要有出处</em></h1><span class="sub">每张卡片都标明成熟度和已核实的出处；点击查看详情</span></div>';
    var wall = h.panel("方法一览", '<div class="subtabs" id="mfilter">' + chips + '</div><div class="wall">' + shown.map(function (c) { return card(c, m.id); }).join("") + "</div>" +
      '<p class="note">成熟度只有三档：<span class="tag impl">已在本演示中实现</span> 在合成数据上真实计算；<span class="tag concept">概念演示</span> 合成信号或流程演示；<span class="tag research">仅研究阶段</span> 只引用论文，本平台没有实现。</p>');
    return head + '<div class="cols"><div>' + wall + '</div><div id="m-detail">' + detail(m) + compare() + "</div></div>";
  }

  /* ---------------------------------------------------------------- 概念演示动画（全部是合成信号） */
  function runDemo(kind) {
    var cv = document.getElementById("demo-cv");
    if (!cv) return;
    var ctx = cv.getContext("2d"), W = cv.width, H = cv.height, L = D.school.lesson_concept, cap = document.getElementById("demo-cap");
    var t0 = null;
    function axes() {
      ctx.fillStyle = "#030a1a"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(84,176,255,0.12)"; ctx.lineWidth = 1;
      for (var x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (var y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    function phases(px) {
      L.phases.forEach(function (p, i) {
        var x0 = px(p[0]), x1 = px(p[1]);
        ctx.fillStyle = i % 2 ? "rgba(165,139,255,0.06)" : "rgba(63,224,255,0.05)"; ctx.fillRect(x0, 20, x1 - x0, H - 50);
        ctx.fillStyle = "#8aa3c8"; ctx.font = "16px Microsoft YaHei"; ctx.fillText(p[2], x0 + 6, 40);
      });
    }
    function series(vals, px, py, color, upto) {
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath();
      for (var i = 0; i < upto; i++) { var x = px(L.t[i]), y = py(vals[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    var px = function (t) { return 50 + t / 45 * (W - 70); };
    if (kind === "engagement") {
      cap.textContent = "合成的“班级参与度指数”随一节 45 分钟课的变化：小组讨论时上升、长时间讲授后下降。真实系统需要多源信号融合，本平台不采集任何视频或音频。";
      P9.anim("demo", function (t) {
        if (t0 == null) t0 = t;
        var n = Math.min(L.t.length, Math.floor((t - t0) / 40) % (L.t.length + 40));
        axes(); phases(px);
        series(L.engagement, px, function (v) { return H - 30 - (v - 30) / 70 * (H - 80); }, "#3fe0ff", n);
        ctx.fillStyle = "#3fe0ff"; ctx.font = "15px Microsoft YaHei"; ctx.fillText("参与度指数（合成）" + (n ? "：" + L.engagement[n - 1].toFixed(0) : ""), W - 230, H - 10);
      });
    } else if (kind === "speech") {
      cap.textContent = "合成的“教师讲授 / 学生发言”占比曲线，用来演示课堂话语分析能给老师什么反馈。不录音，不调用麦克风。";
      P9.anim("demo", function (t) {
        if (t0 == null) t0 = t;
        var n = Math.min(L.t.length, Math.floor((t - t0) / 40) % (L.t.length + 40));
        axes(); phases(px);
        var py = function (v) { return H - 30 - v * (H - 80); };
        series(L.teacher_talk, px, py, "#a58bff", n);
        series(L.student_talk, px, py, "#ffc857", n);
        ctx.font = "15px Microsoft YaHei"; ctx.fillStyle = "#a58bff"; ctx.fillText("教师讲授占比", W - 290, H - 10); ctx.fillStyle = "#ffc857"; ctx.fillText("学生发言占比", W - 160, H - 10);
      });
    } else if (kind === "gaze") {
      cap.textContent = "合成的注视点轨迹叠在一张示意课件上（标题 / 图 / 文字区）。真实眼动研究需要专门设备、知情同意和伦理审查。";
      var pts = [], rnd = 7;
      function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      var aois = [[60, 30, 780, 50, "标题"], [60, 100, 380, 170, "图示"], [470, 100, 370, 170, "文字说明"]];
      P9.anim("demo", function (t) {
        if (t0 == null) t0 = t;
        axes();
        aois.forEach(function (a) { ctx.strokeStyle = "rgba(138,163,200,0.5)"; ctx.strokeRect(a[0], a[1], a[2], a[3]); ctx.fillStyle = "#5a7298"; ctx.font = "15px Microsoft YaHei"; ctx.fillText(a[4], a[0] + 8, a[1] + 20); });
        if (pts.length < 60 && (t - t0) / 120 > pts.length) {
          var a = aois[pts.length < 4 ? 0 : (r() < 0.6 ? 1 : 2)];
          pts.push([a[0] + 20 + r() * (a[2] - 40), a[1] + 25 + r() * (a[3] - 40), 6 + r() * 14]);
        }
        if (pts.length >= 60 && (t - t0) > 60 * 120 + 2500) { pts = []; t0 = t; }
        pts.forEach(function (p, i) {
          var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], p[2] * 3);
          g.addColorStop(0, "rgba(255,111,174,0.45)"); g.addColorStop(1, "rgba(255,111,174,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], p[2] * 3, 0, 7); ctx.fill();
          if (i) { ctx.strokeStyle = "rgba(63,224,255,0.35)"; ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
        });
      });
    } else if (kind === "emotion") {
      cap.textContent = "抽象粒子示意，不是人脸，也不处理任何图像。教育机构中的情绪推断在欧盟属于禁止做法，表情推断情绪的科学基础也存在争议，所以本平台默认关闭、没有实现。";
      var parts = [];
      for (var i = 0; i < 160; i++) parts.push([Math.random() * W, Math.random() * H, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6]);
      P9.anim("demo", function () {
        axes();
        parts.forEach(function (p) {
          p[0] = (p[0] + p[2] + W) % W; p[1] = (p[1] + p[3] + H) % H;
          ctx.fillStyle = "rgba(138,163,200,0.5)"; ctx.fillRect(p[0], p[1], 2, 2);
        });
        ctx.fillStyle = "rgba(3,10,26,0.72)"; ctx.fillRect(W / 2 - 300, H / 2 - 56, 600, 112);
        ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 300, H / 2 - 56, 600, 112);
        ctx.fillStyle = "#ff9aa6"; ctx.font = "bold 26px Microsoft YaHei"; ctx.textAlign = "center";
        ctx.fillText("情绪识别 · 默认关闭", W / 2, H / 2 - 8);
        ctx.font = "16px Microsoft YaHei"; ctx.fillStyle = "#dbe9ff";
        ctx.fillText("欧盟《人工智能法》第 5 条第 1 款 (f) 项：禁止在教育机构推断情绪", W / 2, H / 2 + 28);
        ctx.textAlign = "start";
      });
    }
  }

  view.after = function (args) {
    var sel = args[0] || "dkt";
    document.querySelectorAll("[data-m]").forEach(function (c) { c.onclick = function () { P9.go("methods/" + c.getAttribute("data-m")); }; });
    document.querySelectorAll("#mfilter [data-f]").forEach(function (b) { b.onclick = function () { filter = b.getAttribute("data-f"); P9.render(); }; });
    var m = D.methods.cards.filter(function (c) { return c.id === sel; })[0];
    if (m && m.demo) runDemo(m.demo);
  };
  P9.views.methods = view;
})();
