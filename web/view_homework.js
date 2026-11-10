/* 作业评阅（复用 p4）：家长拍照上传 → AI 初评 → 教师复核的流程演示、量规、演示班数据、公开数据集基线。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;
  var STEPS = [
    { label: "① 家长拍照上传", shots: ["m_upload.jpg"], text: "家长在手机上拍下作业，上传时去掉照片里的 EXIF / GPS 信息。监护人未签署同意的学生无法上传。" },
    { label: "② 预处理", shots: ["pp_zh_before.jpg", "pp_zh_after.jpg"], text: "OpenCV 检测纸张边缘，做透视矫正、纠偏和去阴影，多页拼接。" },
    { label: "③ AI 初评", shots: ["m_result.jpg"], text: "手写识别后按量规打分：总分、分项分、档次、评语、置信度，并判断是否需要人工复核。本演示用规则 mock 评分。" },
    { label: "④ 错误定位", shots: ["m_result_errors.jpg"], text: "错误按原文位置标注（位置由服务端根据引文在识别文字中定位，不信任模型给的偏移量）。" },
    { label: "⑤ 教师复核", shots: ["m_review_form.jpg"], text: "老师逐项改分、批注、改评语；每次修改都留痕，并用于评估 AI 与教师的一致性。" },
    { label: "⑥ 家长看到结果", shots: ["m_parent_sees_review.jpg"], text: "家长端只显示教师复核后的最终结果，看不到 AI 原始结果和老师的内部备注。" },
    { label: "⑦ 画像更新", shots: ["m_profile_after.jpg"], text: "复核结果进入学生画像：成绩趋势、知识点掌握、写作能力雷达、高频错误。" },
  ];
  var step = 0, auto = true, exIdx = 0, rubricKey = null;

  function shot(f) {
    var cap = (D.p4.screenshots.filter(function (s) { return s.file === f; })[0] || {}).caption || f;
    return '<img class="shot" src="assets/p4/' + esc(f) + '" alt="' + esc(cap) + '"><div class="shot-cap">' + esc(cap) + "（p4 截图，演示数据）</div>";
  }
  function flowInner() {
    var s = STEPS[step];
    var btns = STEPS.map(function (x, i) { return '<button data-step="' + i + '" class="' + (i === step ? "on" : i < step ? "done" : "") + '">' + esc(x.label) + "</button>"; }).join("");
    var imgs = s.shots.length === 2 ? '<div class="grid2">' + s.shots.map(shot).join("") + "</div>" : shot(s.shots[0]);
    return '<div class="flow">' + btns + "</div>" + '<p style="margin:2px 0 8px">' + esc(s.text) + "</p>" + imgs;
  }
  function essay(ex) {
    var t = ex.ocr_text || "", errs = (ex.errors || []).filter(function (e) { return e.start != null && e.end != null && e.end <= t.length; })
      .sort(function (a, b) { return a.start - b.start; });
    var out = "", pos = 0;
    errs.forEach(function (e) {
      if (e.start < pos) return;
      out += esc(t.slice(pos, e.start)) + '<mark title="' + esc(e.message + (e.suggestion ? "　建议：" + e.suggestion : "")) + '">' + esc(t.slice(e.start, e.end)) + "</mark>";
      pos = e.end;
    });
    return '<div class="essay">' + out + esc(t.slice(pos)) + "</div>";
  }
  function examplePanel() {
    var exs = D.p4.examples;
    if (!exs.length) return "";
    var ex = exs[Math.min(exIdx, exs.length - 1)];
    var tabs = '<div class="subtabs">' + exs.map(function (e, i) { return '<button data-ex="' + i + '" class="' + (i === exIdx ? "on" : "") + '">' + esc(e.title) + "</button>"; }).join("") + "</div>";
    var crit = (ex.criteria || []).map(function (c) { return "<tr><td>" + esc(c.name) + '</td><td class="n">' + fmt(c.score, 1) + " / " + fmt(c.max, 0) + "</td></tr>"; }).join("");
    var errs = (ex.errors || []).map(function (e) { return "<li><b>" + esc(e.quote) + "</b>：" + esc(e.message) + (e.suggestion ? " → " + esc(e.suggestion) : "") + "</li>"; }).join("");
    return h.panel("评阅样例：" + esc(ex.student) + "的作业", tabs + essay(ex) +
      '<div class="grid2" style="margin-top:8px"><div><table class="t"><tr><th>分项</th><th class="n">得分</th></tr>' + crit +
      '<tr><td><b>总分</b></td><td class="n"><b>' + fmt(ex.total, 1) + " / " + fmt(ex.max, 0) + "</b>（" + esc(ex.band) + "）</td></tr></table>" +
      '<p class="note">AI 初评 ' + fmt(ex.ai_total, 1) + " → " + (ex.status === "reviewed" ? "教师复核 " + fmt(ex.total, 1) : "待复核") + "；置信度 " + fmt(ex.confidence, 2) + "</p></div>" +
      '<div><h3 style="margin-top:0">标注的错误</h3><ul class="note" style="padding-left:18px;margin:0">' + (errs || "<li>无</li>") + "</ul><h3>评语</h3><p class=note>" + esc(ex.comment) + "</p></div></div>" +
      '<p class="note">识别文字来自 p4 合成的“手写照片”，评分为规则 mock，复核为模拟教师；悬停红色标注可看说明。</p>', { tags: h.p4() });
  }
  function rubricPanel() {
    var R = D.p4.rubrics, r = R.filter(function (x) { return x.key === rubricKey; })[0] || R[0];
    rubricKey = r.key;
    var sel = '<select id="rub-sel">' + R.map(function (x) { return '<option value="' + x.key + '"' + (x.key === r.key ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>";
    var crit = r.criteria.length ? Ch.hbars(r.criteria.map(function (c, i) {
      return { label: c.name, value: c.max, color: Ch.PAL[i % 7], text: c.max + " 分" };
    }), { left: 130, right: 60, w: 520 }) : '<p class="note">逐题给分：每道题是一个评分维度，分值和参考答案在布置作业时由老师填写；“结果分 + 过程分”。</p>';
    var bands = r.bands.map(function (b) { return "<tr><td>" + esc(b.name) + '</td><td class="n">' + b.min + "–" + b.max + '</td><td class="note">' + esc(b.descriptor) + "</td></tr>"; }).join("");
    var ded = r.deductions.map(function (d) { return esc(d.name + "：" + d.rule); }).join("；");
    return h.panel("量规（p4 内置 " + R.length + " 套，教师可自定义）", '<div class="row" style="margin-bottom:6px">' + sel + "</div>" + crit +
      '<table class="t" style="margin-top:6px"><colgroup><col style="width:14%"><col style="width:14%"><col></colgroup><tr><th>档次</th><th class="n">区间</th><th>描述</th></tr>' + bands + "</table>" +
      (ded ? '<p class="note">扣分项：' + ded + "</p>" : "") + '<p class="note">来源说明：' + esc(r.source) + '</p><p class="src">' + esc(r.file) + "</p>", { tags: h.p4() });
  }

  function view() {
    var P = D.p4;
    var head = '<div class="page-head"><h1>作业评阅 · <em>拍照上传 → AI 初评 → 教师复核</em></h1><span class="sub">复用 p4-edu-eval：流程、量规、演示数据和截图</span>' + h.p4() + "</div>";
    var fe = P.flow_example;
    var flow = h.panel("流程演示", '<div id="flow-box">' + flowInner() + "</div>" +
      '<div class="row" style="margin-top:8px"><button class="btn" id="flow-auto">' + (auto ? "暂停自动播放" : "自动播放") + '</button><button class="btn" id="flow-gif" title="p4 用无头 Edge 录制的 11 帧流程动图">看流程动图</button>' +
      (fe ? '<span class="note">p4 演示数据中的一例：《' + esc(fe.title) + "》AI 初评 <b>" + fmt(fe.ai_total, 1) + "</b> → 教师复核 <b>" + fmt(fe.teacher_total, 1) + "</b> / " + fmt(fe.max, 0) + "，家长端显示复核后的分数。</span>" : "") + "</div>" +
      '<div id="gif-box"></div>', { tags: h.p4() });
    var left = flow + examplePanel();

    var rows = P.assignments.map(function (a) {
      return "<tr><td>" + esc(a.date.slice(5)) + "</td><td>" + esc(a.title) + '</td><td class="n">' + a.n + '</td><td class="n">' + a.n_reviewed + '</td><td class="n">' + a.n_changed +
        '</td><td class="n">' + (a.mean_abs_change == null ? "—" : fmt(a.mean_abs_change, 2)) + '</td><td class="n">' + h.pct(a.mean_ratio, 0) + "</td></tr>";
    }).join("");
    var demo = h.panel("p4 演示班（" + P.n_students + " 名学生、" + P.n_submissions + " 份提交）", '<table class="t"><colgroup><col style="width:9%"><col style="width:35%"><col><col><col><col><col></colgroup>' +
      '<tr><th>日期</th><th>作业</th><th class="n">提交</th><th class="n">已复核</th><th class="n">教师改分</th><th class="n">平均改动</th><th class="n">平均得分率</th></tr>' + rows + "</table>" +
      '<p class="note">AI 初评是规则 mock，教师复核是模拟的，<b>两边都是演示数据</b>。改分统计只说明“复核留痕 → 一致性评估”这条链路跑通了，不代表任何模型的准确率。</p>', { tags: h.p4() });
    var ev = P.eval_baselines.map(function (e) {
      return "<tr><td>" + esc(e.label) + '</td><td class="n">' + e.n + '</td><td class="n">' + fmt(e.qwk, 3) + '</td><td class="n">' + (e.human_human_qwk == null ? "—" : fmt(e.human_human_qwk, 3)) + "</td></tr>";
    }).join("");
    var evp = h.panel("公开数据集上的规则基线（p4 实测）", '<table class="t"><colgroup><col style="width:50%"><col><col><col></colgroup><tr><th>数据集</th><th class="n">篇数</th><th class="n">规则基线 QWK</th><th class="n">人-人 QWK</th></tr>' + ev + "</table>" +
      '<p class="note">QWK = 二次加权 Kappa，衡量机器分与人工分的一致性。规则基线明显低于人和人之间的一致性（CFMS-34：' + fmt(P.eval_baselines[0] && P.eval_baselines[0].qwk, 3) + " vs " +
      fmt(P.eval_baselines[0] && P.eval_baselines[0].human_human_qwk, 3) + "），所以要得到有意义的自动评分必须接入大模型——这一步 <b>还没有实测</b>（p4 还没有 API key）。</p>" +
      '<p class="src">' + P.eval_baselines.map(function (e) { return esc(e.source + " → " + e.locator); }).join("<br>") + "</p>", { tags: h.p4() });
    var gate = h.panel("合规闸门（p4 的设计）", "<ul class=\"note\" style=\"padding-left:18px;margin:0\">" +
      "<li><b>" + esc(P.no_consent.join("、") || "无") + "</b>：监护人没有签署同意，系统拒绝上传，作业 AI 评阅不启用（在“学生全景”里可以看到）。</li>" +
      "<li><b>" + esc(P.cloud_ai.join("、") || "无") + "</b>：监护人另外勾选了“允许云端 AI 处理”；其他学生只能用本地模型或 mock。</li>" +
      "<li>家长看不到 AI 原始结果和老师的内部备注；所有改分留痕。</li></ul>" +
      '<p>' + h.clauseChip("pipl_31") + h.clauseChip("pipl_29") + h.clauseChip("minor_32") + "</p>", { tags: h.p4() });
    return head + '<div class="cols"><div>' + left + "</div><div>" + rubricPanel() + demo + evp + gate + "</div></div>";
  }
  view.after = function () {
    function redraw() { document.getElementById("flow-box").innerHTML = flowInner(); }
    document.getElementById("flow-box").addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]");
      if (b) { step = parseInt(b.getAttribute("data-step"), 10); redraw(); }
    });
    document.getElementById("flow-auto").onclick = function () { auto = !auto; this.textContent = auto ? "暂停自动播放" : "自动播放"; };
    document.getElementById("flow-gif").onclick = function () {
      var box = document.getElementById("gif-box");
      box.innerHTML = box.innerHTML ? "" : (D.p4.flow_gif ? '<img class="shot" style="margin-top:8px" src="assets/p4/' + esc(D.p4.flow_gif) + '" alt="p4 流程动图">' : "");
    };
    P9.every(function () { if (auto && document.getElementById("flow-box")) { step = (step + 1) % STEPS.length; redraw(); } }, 4500);
    document.querySelectorAll("[data-ex]").forEach(function (b) { b.onclick = function () { exIdx = parseInt(b.getAttribute("data-ex"), 10); P9.render(); }; });
    var rs = document.getElementById("rub-sel");
    if (rs) rs.onchange = function () { rubricKey = this.value; P9.render(); };
  };
  P9.views.homework = view;
})();
