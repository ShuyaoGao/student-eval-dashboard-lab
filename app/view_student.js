/* 学生成长全景（教师视角）：雷达、成长曲线、作业分项 + 知识追踪 / 认知诊断 / 自适应测验 / 引导建议 / 评语。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;
  var KCOL = ["#3fe0ff", "#a58bff", "#ff6fae", "#ffc857", "#4be3a5", "#6aa8ff"];
  var SUBS = [["kt", "知识追踪"], ["cdm", "认知诊断"], ["cat", "自适应测验"], ["guide", "引导建议"], ["comment", "评语示例"]];

  /* ---------------------------------------------------------------- CAT（与 p9/irt_cat.py 相同的网格与公式） */
  var GRID = [], PRIOR = [];
  (function () {
    var s = 0;
    for (var i = 0; i < 81; i++) { var t = -4 + i * 0.1; GRID.push(t); PRIOR.push(Math.exp(-0.5 * t * t)); s += PRIOR[i]; }
    for (i = 0; i < 81; i++) PRIOR[i] /= s;
  })();
  function eap(items, resp, a, b) {
    var post = PRIOR.slice(), s = 0, m = 0, v = 0, i, k;
    for (k = 0; k < items.length; k++) {
      var j = items[k];
      for (i = 0; i < 81; i++) { var p = 1 / (1 + Math.exp(-a[j] * (GRID[i] - b[j]))); post[i] *= resp[k] === 1 ? p : 1 - p; }
    }
    for (i = 0; i < 81; i++) s += post[i];
    for (i = 0; i < 81; i++) { post[i] /= s; m += post[i] * GRID[i]; }
    for (i = 0; i < 81; i++) v += post[i] * (GRID[i] - m) * (GRID[i] - m);
    return [m, Math.sqrt(v)];
  }
  function info(th, a, b) { var p = 1 / (1 + Math.exp(-a * (th - b))); return a * a * p * (1 - p); }
  function select(est, used, a, b) {
    var best = -1, bi = -1;
    for (var j = 0; j < a.length; j++) {
      if (used.indexOf(j) >= 0) continue;
      var v = info(est, a[j], b[j]);
      if (v > best) { best = v; bi = j; }
    }
    return bi;
  }
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /* 给定作答序列，复算整条 CAT 轨迹（用于测试与 Python 对比） */
  function replay(responses, a, b) {
    var used = [], resp = [], est = 0, sd = 1, out = [];
    for (var s = 0; s < responses.length; s++) {
      var j = select(est, used, a, b);
      used.push(j); resp.push(responses[s]);
      var r = eap(used, resp, a, b); est = r[0]; sd = r[1];
      out.push({ step: s + 1, item: j, x: responses[s], eap: est, psd: sd });
    }
    return out;
  }
  window.P9_CAT = { eap: eap, select: select, info: info, replay: replay, GRID: GRID };

  /* ---------------------------------------------------------------- 主视图 */
  function view(args) {
    var st = P9.student(args[0]), sub = args[1] || "kt";
    var cm = D.focal.class_mean;
    var opts = P9.studentsSorted().map(function (s) {
      return '<option value="' + s.sid + '"' + (s.sid === st.sid ? " selected" : "") + ">" + esc(s.sid + "  " + s.name) + "</option>";
    }).join("");
    var head = '<div class="page-head"><h1>学生成长全景 · <em>' + esc(st.name) + "</em></h1>" +
      '<span class="sub">' + esc(st.class_name) + " · 教师视角 · 学生按学号排列，不排名</span>" + h.syn() +
      '<span class="grow"></span><label class="note">选择学生 <select id="stu-sel" title="初二(3)班全部学生（按学号）">' + opts + "</select></label></div>";

    var consent = st.from_p4 && st.p4_consent.indexOf("basic") < 0;
    var who = '<div class="who"><div class="avatar">' + esc(st.name.slice(-1)) + '</div><div class="grow"><div class="nm">' + esc(st.name) + "</div>" +
      '<span class="chip">学号 ' + esc(st.sid) + '</span><span class="chip">' + esc(st.class_name) + "</span>" +
      (st.from_p4 ? '<span class="chip" title="这名学生沿用 p4 演示班的虚构姓名，作业分项直接来自 p4 演示数据库">作业数据：p4 演示流水线</span>' : '<span class="chip">作业数据：合成（按 p4 量规结构）</span>') +
      (consent ? '<span class="chip" style="color:#ff9aa6;border-color:#ff9aa6">监护人未签署同意 · 作业 AI 评阅关闭</span>' : "") +
      (st.p4_consent.indexOf("cloud_ai") >= 0 ? '<span class="chip">已单独同意云端 AI</span>' : "") + "</div></div>";
    var flag = st.psych_flag === "建议关注";
    var care = '<div class="care ' + (flag ? "" : "normal") + '" style="margin-top:10px"><b>心理健康 · ' + esc(st.psych_flag) + "</b>　" +
      '<span class="note">仅班主任可见。依据是家庭与作息等<b>群体层面的风险因素</b>（p3 风险计算器，全校最高的 20% 标为“建议关注”），<b>不是诊断</b>，' +
      "不进入任何排名，不对学生和家长出示，只用于决定先把普遍性支持送给谁。</span></div>";

    var R = st.radar, axes = [{ label: "学业成绩" }, { label: "作业质量" }, { label: "写作·内容" }, { label: "写作·表达" }, { label: "知识掌握" }, { label: "学习行为" }];
    var cmv = [cm.academic, cm.homework, cm.homework_dims.content, cm.homework_dims.language, cm.mastery, cm.behavior];
    var radar = Ch.radar(axes, [{ label: "班级平均", color: "#8aa3c8", values: cmv, fill: 0.05, dash: true },
      { label: st.name, color: "#3fe0ff", values: [R.academic, R.homework, R.content, R.language, R.mastery, R.behavior] }], { w: 420, h: 330 });
    var radarNote = (R.homework == null ? '<p class="note">作业维度为空：' + (consent ? "监护人未签署同意，AI 评阅未启用。" : "暂无作业数据。") + "</p>" : "") +
      '<p class="note">0–100。学业 = 三科周测得分率；作业 = 量规总分得分率；写作·内容 / 表达 = p4 量规中“内容”“语言”维度的分项得分率；知识掌握 = BKT 掌握概率平均；学习行为 = 按时提交 35% + 练习量 35% + 订正率 30%。</p>';
    var left = h.panel(null, who + care) +
      h.panel("综合画像", h.legend([{ label: st.name, color: "#3fe0ff" }, { label: "班级平均", color: "#8aa3c8", dash: true }]) + radar + radarNote, { tags: h.syn() });

    var g = st.growth;
    var growth = Ch.line(P9.weekLabels(), [
      { label: "学业成绩", color: "#3fe0ff", values: g.academic },
      { label: "知识掌握", color: "#a58bff", values: g.mastery },
      { label: "学习行为", color: "#4be3a5", values: g.behavior },
    ], { h: 210, yMin: 0, yMax: 100 });
    var hwPts = st.homework.filter(function (r) { return r.ratio != null; });
    var hwChart = hwPts.length ? Ch.line(hwPts.map(function (r) { return r.date.slice(5); }), [{ label: "作业得分率", color: "#ffc857", values: hwPts.map(function (r) { return 100 * r.ratio; }) }],
      { h: 150, yMin: 0, yMax: 100, ySuffix: "%" }) : '<p class="note">没有作业数据。</p>';
    left += h.panel("成长曲线", h.legend([{ label: "学业成绩", color: "#3fe0ff" }, { label: "知识掌握", color: "#a58bff" }, { label: "学习行为", color: "#4be3a5" }]) + growth +
      "<h3>每次作业的得分率（p4 量规）</h3>" + hwChart);

    var STAT = { reviewed: ["已复核", "ok"], ai_done: ["待复核", "concept"], missing: ["缺交", "warn"], no_consent: ["未授权", "warn"] };
    var rows = st.homework.map(function (r) {
      var s = STAT[r.status] || [r.status, "lit"];
      var crit = (r.criteria || []).map(function (c) { return esc(c.name) + " " + fmt(c.score, 1) + "/" + fmt(c.max, 0); }).join("；");
      return "<tr><td>" + esc(r.date.slice(5)) + "</td><td>" + esc(r.title) + "</td><td>" + h.tag(s[1], s[0]) + '</td><td class="n">' +
        (r.total != null ? fmt(r.total, 1) + "/" + fmt(r.max, 0) : "—") + "</td><td>" + esc(r.band || "") + '</td><td class="note">' + crit + "</td></tr>";
    }).join("");
    left += h.panel("作业评阅记录（量规分项）", '<table class="t"><colgroup><col style="width:9%"><col style="width:27%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col></colgroup>' +
      '<tr><th>日期</th><th>作业</th><th>状态</th><th class="n">得分</th><th>档次</th><th>分项</th></tr>' + rows + "</table>" +
      '<p class="note">“待复核”的分数是 AI 初评，老师复核后才会推送给家长。' + (st.from_p4 ? "这名学生的记录来自 p4 演示数据库：AI 为规则 mock 评分，复核为模拟教师。" : "") + "</p>",
      { tags: st.from_p4 ? h.p4() : h.syn() });

    var tabs = '<div class="subtabs">' + SUBS.map(function (s) {
      return '<button data-sub="' + s[0] + '" class="' + (s[0] === sub ? "on" : "") + '">' + s[1] + "</button>";
    }).join("") + "</div>";
    var right = '<section class="panel fade-in" id="evi">' + tabs + '<div id="sub-body">' + (SUBV[sub] || SUBV.kt)(st) + "</div></section>";
    return head + '<div class="cols"><div>' + left + "</div><div>" + right + "</div></div>";
  }

  /* ---------------------------------------------------------------- 知识追踪 */
  var ktMode = "bkt";
  function ktChart(st) {
    var kcs = D.meta.kcs, src = st.kt[ktMode];
    var series = kcs.map(function (k, i) {
      return { label: k.name, color: KCOL[i], values: src.map(function (r) { return r[i]; }), dots: false, width: ktMode === "truth" ? 1.6 : 2.2 };
    });
    var marks = [1, 2, 3, 4, 5].map(function (w) { return { i: w * D.meta.days_per_week, label: "" }; });
    return Ch.line(P9.dayLabels(), series, { h: 240, yMin: 0, yMax: 1, yDec: 1, marks: marks, maxXLabels: 6, tipDec: 2 });
  }
  function subKT(st) {
    var kcs = D.meta.kcs, M = D.models.kt, A = M.auc, last = st.kt.bkt.length - 1;
    var modeBtn = [["bkt", "BKT 掌握概率"], ["dkt", "DKT-lite 预测答对率"], ["truth", "合成真值（只有合成数据才有）"]].map(function (m) {
      return '<button class="btn' + (m[0] === ktMode ? " primary" : "") + '" data-ktmode="' + m[0] + '">' + m[1] + "</button>";
    }).join(" ");
    var rows = kcs.map(function (k, i) {
      return '<tr><td><i style="display:inline-block;width:10px;height:10px;background:' + KCOL[i] + ';margin-right:6px"></i>' + esc(k.name) + '</td><td class="n">' + st.kt.n_by_kc[i] +
        '</td><td class="n">' + (st.kt.acc_by_kc[i] == null ? "—" : h.pct(st.kt.acc_by_kc[i], 0)) + '</td><td class="n">' + fmt(st.kt.bkt[last][i], 2) +
        '</td><td class="n">' + fmt(st.kt.dkt[last][i], 2) + '</td><td class="n">' + (st.kt.truth[last][i] ? "会" : "未会") + "</td></tr>";
    }).join("");
    var NAMES = { baseline: "基线（知识点平均正确率）", pfa: "PFA 逻辑回归", bkt: "BKT（EM）", dkt: "DKT-lite（numpy RNN）", oracle: "生成机制上限（用真值）" };
    var COL = { baseline: "#5a7298", pfa: "#6aa8ff", bkt: "#3fe0ff", dkt: "#a58bff", oracle: "#ffc857" };
    var bars = Ch.hbars(["baseline", "pfa", "bkt", "dkt", "oracle"].map(function (m) {
      return { label: NAMES[m], value: A[m].value, color: COL[m], text: fmt(A[m].value, 3) + "（" + fmt(A[m].ci_low, 3) + "–" + fmt(A[m].ci_high, 3) + "）" };
    }), { max: 1, left: 190, right: 150, w: 600 });
    return '<h2 style="margin-top:0">知识追踪 · 掌握概率随时间的变化 ' + h.syn() + "</h2>" +
      '<div class="row" style="margin-bottom:6px">' + modeBtn + "</div>" +
      h.legend(kcs.map(function (k, i) { return { label: k.name, color: KCOL[i] }; })) + '<div id="kt-chart">' + ktChart(st) + "</div>" +
      '<p class="note">横轴为本学期 30 个上课日（每 5 天一周）。BKT 曲线 = 每次作答后用贝叶斯公式更新的“已掌握”后验概率；DKT-lite 曲线 = 循环神经网络读完历史后对各知识点下一题答对率的预测；合成真值 = 生成数据时设定的真实掌握状态（真实场景里不可能知道）。</p>' +
      '<table class="t"><colgroup><col style="width:26%"><col><col><col><col><col></colgroup><tr><th>知识点</th><th class="n">作答次数</th><th class="n">正确率</th><th class="n">BKT 末值</th><th class="n">DKT 末值</th><th class="n">真值</th></tr>' + rows + "</table>" +
      "<h3>模型对照：预测下一题对错的 AUC（" + A.bkt.n_students + " 名留出学生、" + A.bkt.n_responses.toLocaleString("zh-CN") + " 次作答，95% 区间为按学生 bootstrap）</h3>" + bars +
      '<p class="note"><b>怎么读：</b>这些是在<b>合成数据</b>上的真实计算。合成作答按“带个体差异的 BKT”生成，BKT 与生成机制同族，所以它的 AUC 偏乐观；DKT-lite 只是 ' +
      esc(M.dkt.n_params) + " 个参数的单层 RNN（" + esc(M.dkt.arch) + "，第 " + M.dkt.best_epoch + " 轮验证集最好），不是原论文的 LSTM。真实课堂数据上的表现需要重新评估。" +
      "训练 " + M.split.train + " 人 / 验证 " + M.split.val + " 人 / 测试 " + M.split.test + " 人；初二(3)班 " + M.split.focal_class_heldout + " 人不参与训练，页面上的曲线是样本外预测。</p>";
  }

  /* ---------------------------------------------------------------- 认知诊断 */
  function qMatrix(st) {
    var Q = D.models.cdm.Q, kcs = D.meta.kcs, resp = st.cdm.responses, J = Q.length, K = kcs.length;
    var cw = 21, ch = 21, L = 110, T = 30, W = L + J * cw + 6, H = T + (K + 1) * ch + 16, b = "";
    for (var j = 0; j < J; j++) b += '<text x="' + (L + j * cw + cw / 2) + '" y="' + (T - 8) + '" text-anchor="middle" class="tick">' + (j + 1) + "</text>";
    kcs.forEach(function (k, i) {
      b += '<text x="' + (L - 8) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end" class="lab">' + esc(k.name) + "</text>";
      for (var j = 0; j < J; j++) {
        b += '<rect x="' + (L + j * cw + 1) + '" y="' + (T + i * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="2" fill="' +
          (Q[j][i] ? KCOL[i] : "rgba(84,176,255,0.06)") + '" fill-opacity="' + (Q[j][i] ? 0.8 : 1) + '"><title>第 ' + (j + 1) + " 题" + (Q[j][i] ? "需要" : "不需要") + "「" + esc(k.name) + "」</title></rect>";
      }
    });
    var y = T + K * ch + 6;
    b += '<text x="' + (L - 8) + '" y="' + (y + ch / 2 + 4) + '" text-anchor="end" class="lab">本人作答</text>';
    for (j = 0; j < J; j++) {
      b += '<rect x="' + (L + j * cw + 1) + '" y="' + (y + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="2" fill="' + (resp[j] ? "rgba(75,227,165,0.75)" : "rgba(255,107,107,0.7)") +
        '"><title>第 ' + (j + 1) + " 题：" + (resp[j] ? "答对" : "答错") + "</title></rect>" +
        '<text x="' + (L + j * cw + cw / 2) + '" y="' + (y + ch / 2 + 4) + '" text-anchor="middle" class="cell-t dark">' + (resp[j] ? "✓" : "✗") + "</text>";
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="chart" viewBox="0 0 ' + W + " " + H + '">' + b + "</svg>";
  }
  function subCDM(st) {
    var M = D.models.cdm, kcs = D.meta.kcs, post = st.cdm.attr_posterior, last = st.kt.bkt.length - 1;
    var bars = Ch.hbars(kcs.map(function (k, i) {
      return { label: k.name, value: post[i], color: post[i] >= 0.5 ? "#4be3a5" : "#ff6b6b", text: fmt(post[i], 2) + (post[i] >= 0.5 ? " 掌握" : " 未掌握") + "　BKT " + fmt(st.kt.bkt[last][i], 2) };
    }), { max: 1, left: 120, right: 150, w: 600 });
    return '<h2 style="margin-top:0">认知诊断 · DINA 模型 ' + h.syn() + "</h2>" +
      '<p class="note">第 6 周末的 24 题诊断测验。上方色块是 Q 矩阵：每道题需要哪些知识点（属性）；最下一行是这名学生的对错。DINA 假设“题目要求的属性全部掌握才会答对（可能失误），否则只能猜对”，用 EM 估计每道题的失误率和猜对率，再算每个属性的掌握后验。</p>' +
      qMatrix(st) + "<h3>属性掌握后验（≥0.5 判为掌握），右侧附 BKT 末值作对照</h3>" + bars +
      '<div class="grid3" style="margin-top:8px">' +
      '<div class="kpi"><div class="v num">' + fmt(100 * M.attribute_accuracy_mean, 1) + '<small>%</small></div><div class="l">属性判定准确率（对照合成真值）</div></div>' +
      '<div class="kpi"><div class="v num">' + fmt(100 * M.pattern_accuracy, 1) + '<small>%</small></div><div class="l">6 个属性全部判对的学生比例</div></div>' +
      '<div class="kpi"><div class="v num">' + fmt(100 * M.agreement_with_bkt_mean, 1) + '<small>%</small></div><div class="l">与 BKT 判定（0.5 阈值）一致</div></div></div>' +
      '<p class="note">' + M.n_students + " 名学生、" + M.n_items + " 题、" + M.n_attributes + " 个属性，EM " + M.iterations + " 轮收敛。失误率估计误差 RMSE " + fmt(M.slip_rmse, 3) + "，猜对率 " + fmt(M.guess_rmse, 3) +
      "。合成数据里诊断测验的真实属性 = 知识追踪序列结束时的真实掌握状态，所以两种方法可以互相印证；真实场景中 Q 矩阵要由学科教师标注并检验。</p>";
  }

  /* ---------------------------------------------------------------- 自适应测验 */
  var cat = null;
  function catPreset(st, preset) {
    var tr = st.cat.trace;
    if (preset === "self") return { preset: preset, theta: st.cat.theta_true, steps: tr.map(function (s) { return { item: s.item, x: s.x, eap: s.eap, psd: s.psd }; }), shown: 0, manual: false };
    if (preset === "manual") return { preset: preset, theta: null, steps: [], shown: 0, manual: true };
    var th = { low: -1.5, mid: 0, high: 1.5 }[preset], rnd = mulberry(1000 + Math.round(th * 10) + st.sid.charCodeAt(st.sid.length - 1));
    var a = D.models.irt.a, b = D.models.irt.b, used = [], resp = [], est = 0, steps = [];
    for (var s = 0; s < 10; s++) {
      var j = select(est, used, a, b), p = 1 / (1 + Math.exp(-a[j] * (th - b[j]))), x = rnd() < p ? 1 : 0;
      used.push(j); resp.push(x);
      var r = eap(used, resp, a, b); est = r[0];
      steps.push({ item: j, x: x, eap: r[0], psd: r[1] });
    }
    return { preset: preset, theta: th, steps: steps, shown: 0, manual: false };
  }
  function catChart() {
    var x = ["先验"], est = [0], band = [[-1.96, 1.96]];
    for (var i = 0; i < 10; i++) {
      x.push("第" + (i + 1) + "题");
      if (i < cat.shown) { var s = cat.steps[i]; est.push(s.eap); band.push([s.eap - 1.96 * s.psd, s.eap + 1.96 * s.psd]); } else { est.push(null); band.push(null); }
    }
    var series = [{ label: "能力估计 EAP", color: "#3fe0ff", values: est, band: band, r: 3.4 }];
    if (cat.theta != null) series.push({ label: "真实能力（合成）", color: "#ffc857", values: x.map(function () { return cat.theta; }), dash: "6 4", dots: false, width: 1.4 });
    return Ch.line(x, series, { h: 230, yMin: -3.5, yMax: 3.5, yTicks: 7, maxXLabels: 11 });
  }
  function catPanelInner() {
    var a = D.models.irt.a, b = D.models.irt.b;
    var cells = "";
    for (var i = 0; i < 10; i++) {
      var s = cat.steps[i], cls = i < cat.shown ? "r" + s.x : (i === cat.shown && cat.manual ? "cur" : "");
      cells += '<div class="' + cls + '" title="' + (i < cat.shown ? "题号 " + (s.item + 1) + "，难度 b=" + fmt(b[s.item], 2) + "，区分度 a=" + fmt(a[s.item], 2) : "") + '">' + (i < cat.shown ? (s.x ? "✓" : "✗") + " b" + fmt(b[s.item], 1) : i + 1) + "</div>";
    }
    var cur = cat.shown ? cat.steps[cat.shown - 1] : { eap: 0, psd: 1 };
    var q = "";
    if (cat.manual && cat.shown < 10) {
      var used = cat.steps.map(function (s) { return s.item; }), j = select(cur.eap, used, a, b);
      cat.pending = j;
      q = '<div class="bigq"><b>第 ' + (cat.shown + 1) + " 题</b>：题库第 " + (j + 1) + " 题（难度 b = " + fmt(b[j], 2) + "，区分度 a = " + fmt(a[j], 2) +
        "，在当前估计处的信息量 " + fmt(info(cur.eap, a[j], b[j]), 2) + '）　<button class="btn ok" data-ans="1">答对</button> <button class="btn no" data-ans="0">答错</button>' +
        '<div class="note">题目内容是合成题库里的编号，这里只演示“答一题、估一次、再选题”的过程。</div></div>';
    }
    return '<div id="cat-chart">' + catChart() + '</div><div class="cat-items">' + cells + "</div>" + q +
      '<div class="row note"><span>当前估计 θ = <b class="num">' + fmt(cur.eap, 2) + "</b>，95% 区间 <b class=num>[" + fmt(cur.eap - 1.96 * cur.psd, 2) + ", " + fmt(cur.eap + 1.96 * cur.psd, 2) +
      "]</b>，后验标准差 " + fmt(cur.psd, 2) + "</span>" + (cat.theta != null ? "<span>真实能力（合成） " + fmt(cat.theta, 2) + "</span>" : "") + "</div>";
  }
  function subCAT(st) {
    if (!cat || cat.sid !== st.sid) { cat = catPreset(st, "self"); cat.sid = st.sid; }
    var S = D.models.cat, I = D.models.irt;
    var pres = [["self", "本学生"], ["low", "较弱 θ=−1.5"], ["mid", "中等 θ=0"], ["high", "较强 θ=+1.5"], ["manual", "我来作答"]].map(function (p) {
      return '<button class="btn' + (cat.preset === p[0] ? " primary" : "") + '" data-preset="' + p[0] + '" title="' + (p[0] === "manual" ? "自己逐题点“答对 / 答错”" : "模拟一名该能力水平的考生，自动作答") + '">' + p[1] + "</button>";
    }).join(" ");
    var steps = []; for (var i = 1; i <= 10; i++) steps.push("第" + i + "题");
    var study = Ch.line(steps, [
      { label: "最大信息量选题：RMSE", color: "#3fe0ff", values: S.maxinfo.rmse_by_step },
      { label: "随机抽题：RMSE", color: "#ff6fae", values: S.random.rmse_by_step },
      { label: "最大信息量：平均后验标准差", color: "#3fe0ff", values: S.maxinfo.mean_psd_by_step, dash: "5 4", dots: false },
    ], { h: 190, yMin: 0, yMax: 1, yDec: 1, tipDec: 3 });
    return '<h2 style="margin-top:0">自适应测验 · IRT + CAT（10 题） ' + h.syn() + "</h2>" +
      '<div class="row" style="margin-bottom:6px">' + pres + ' <button class="btn" id="cat-replay" title="从第 1 题重新播放">重新播放</button></div>' +
      '<div id="cat-box">' + catPanelInner() + "</div>" +
      '<p class="note">每答一题，用 EAP（先验 N(0,1)、81 点网格）更新能力估计和 95% 区间，再从 ' + I.n_items + " 题题库中挑“在当前估计处信息量最大”的下一题。题库的区分度和难度由 " + I.n_calibration_examinees +
      " 名合成考生（每人 " + I.responses_per_examinee + " 题）用边际极大似然 EM 标定：与真实参数的相关 a " + fmt(I.corr_a, 3) + "、b " + fmt(I.corr_b, 3) + "。“本学生”的作答按真实参数生成、用估计参数计分，标定误差也算在里面。</p>" +
      "<h3>为什么要自适应：" + S.n_sim + " 名模拟考生上的对比</h3>" +
      h.legend([{ label: "最大信息量选题 RMSE", color: "#3fe0ff" }, { label: "随机抽题 RMSE", color: "#ff6fae" }, { label: "平均后验标准差", color: "#3fe0ff", dash: true }]) + study +
      '<p class="note">10 题后估计误差（RMSE）：自适应 ' + fmt(S.maxinfo.rmse_by_step[9], 3) + "，随机抽题 " + fmt(S.random.rmse_by_step[9], 3) + "；自适应 95% 区间覆盖真值的比例 " + h.pct(S.maxinfo.coverage95_final) +
      "。随机抽 10 题后的误差，自适应在第 " + (function () { for (var k = 0; k < 10; k++) if (S.maxinfo.rmse_by_step[k] <= S.random.rmse_by_step[9]) return k + 1; return "10+"; })() +
      " 题就能达到。</p>";
  }
  function catPlay() {
    if (!cat || cat.manual) return;
    cat.shown = 0;
    var box = document.getElementById("cat-box");
    if (!box) return;
    box.innerHTML = catPanelInner();
    var id = P9.every(function () {
      if (!document.getElementById("cat-box") || cat.shown >= cat.steps.length) { clearInterval(id); return; }
      cat.shown++;
      document.getElementById("cat-box").innerHTML = catPanelInner();
    }, 750);
  }

  /* ---------------------------------------------------------------- 引导建议 */
  function subGuide(st) {
    var cards = st.guidance.map(function (g) {
      var ev = g.evidence.map(function (e) {
        return '<li class="' + (e.agrees ? "" : "no") + '">' + (e.agrees ? "● " : "○ ") + "<b>" + esc(e.source) + "</b>：" + esc(e.text) + "</li>";
      }).join("");
      return '<div class="gcard c-' + g.confidence + '"><div class="gt"><span class="tag lit">' + esc(g.category) + "</span>" + esc(g.title) +
        '<span class="conf c-' + g.confidence + '">可信度 ' + g.confidence + '</span></div><div class="ga">' + esc(g.action) + "</div><ul>" + ev + "</ul>" +
        '<div class="note">定级理由：' + esc(g.confidence_reason) + "</div></div>";
    }).join("");
    return '<h2 style="margin-top:0">引导建议 · 每条都写明依据 ' + h.syn() + "</h2>" + cards +
      '<div class="bigq note"><b>可信度怎么定</b>（规则写在 p9/guidance.py）：<br>高 = 至少 3 项相互独立的证据一致（如 BKT、DKT、DINA 都指向同一知识点），或是直接观测的行为记录；' +
      "<br>中 = 2 项证据一致，或单一来源但不确定性已量化且较小；<br>低 = 只有 1 项证据，或证据本身的个体区分力有限（例如心理健康的群体风险因素）。<br>" +
      "● 表示支持该结论的证据，○ 表示局限或反向证据。建议只供老师参考，不直接推送给学生或家长。</div>";
  }

  /* ---------------------------------------------------------------- 评语 */
  function subComment(st) {
    var c = st.comment;
    return '<h2 style="margin-top:0">“大模型生成的教师评语”示例 ' + h.tag("concept", c.kind) + "</h2>" +
      '<div class="quote">' + esc(c.text) + "</div>" +
      '<p class="note">本版<b>没有调用任何大模型</b>：这段评语由模板根据左边和“引导建议”里的证据拼接而成（p4 的真实模型接入还在等 API key）。' +
      "接入后，系统只把下面这份结构化证据发给模型，并要求“只能使用证据里的事实、不涉及心理健康信息、教师审核后才发送”，便于老师核对模型有没有“编”。</p>" +
      "<h3>将发送给大模型的结构化提示（示例）</h3><pre class=\"code\">" + esc(JSON.stringify(c.llm_prompt_preview, null, 2)) + "</pre>";
  }

  var SUBV = { kt: subKT, cdm: subCDM, cat: subCAT, guide: subGuide, comment: subComment };

  view.after = function (args) {
    var st = P9.student(args[0]), sub = args[1] || "kt";
    document.getElementById("stu-sel").onchange = function () { cat = null; P9.go("student/" + this.value + "/" + sub); };
    document.querySelectorAll("#evi [data-sub]").forEach(function (b) {
      b.onclick = function () { P9.go("student/" + st.sid + "/" + b.getAttribute("data-sub")); };
    });
    var evi = document.getElementById("evi");
    evi.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      if (t.hasAttribute("data-ktmode")) {
        ktMode = t.getAttribute("data-ktmode");
        document.getElementById("sub-body").innerHTML = subKT(st);
      } else if (t.hasAttribute("data-preset")) {
        cat = catPreset(st, t.getAttribute("data-preset")); cat.sid = st.sid;
        document.getElementById("sub-body").innerHTML = subCAT(st);
        P9.stopView(); catPlay();
      } else if (t.id === "cat-replay") {
        if (cat.manual) { cat = catPreset(st, "manual"); cat.sid = st.sid; document.getElementById("cat-box").innerHTML = catPanelInner(); }
        else { P9.stopView(); catPlay(); }
      } else if (t.hasAttribute("data-ans") && cat && cat.manual) {
        var a = D.models.irt.a, b = D.models.irt.b, x = parseInt(t.getAttribute("data-ans"), 10);
        var items = cat.steps.map(function (s) { return s.item; }).concat([cat.pending]);
        var resp = cat.steps.map(function (s) { return s.x; }).concat([x]);
        var r = eap(items, resp, a, b);
        cat.steps.push({ item: cat.pending, x: x, eap: r[0], psd: r[1] });
        cat.shown = cat.steps.length;
        document.getElementById("cat-box").innerHTML = catPanelInner();
      }
    });
    if (sub === "cat") catPlay();
  };
  P9.views.student = view;
})();
