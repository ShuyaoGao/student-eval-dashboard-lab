/* 驾驶舱：给学校领导看的全校画像（只有汇总）。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;
  var GCOL = { 7: "#3fe0ff", 8: "#a58bff", 9: "#ff6fae" };

  function view() {
    var S = D.school.summary, G = D.school.grades, CL = D.school.classes, PS = D.school.psych, kcs = D.meta.kcs;
    var head = '<div class="page-head"><h1>学校驾驶舱 · <em>' + esc(S.name) + "</em></h1>" +
      '<span class="sub">' + esc(D.meta.term) + " · 只显示汇总统计，不显示可识别的个人</span>" + h.syn() + "</div>";

    var kpis = '<div class="kpis">' +
      h.kpi(S.n, "在校学生", { raw: S.n, unit: "人" }) +
      h.kpi(S.n_classes, "班级", { raw: S.n_classes, unit: "个" }) +
      h.kpi(D.meta.n_kt_responses, "本学期练习作答", { raw: D.meta.n_kt_responses, unit: "次", title: "知识追踪模型使用的作答记录（合成）" }) +
      h.kpi(fmt(S.academic, 1), "周测平均得分率", { raw: S.academic, dec: 1, unit: "%" }) +
      h.kpi(fmt(S.homework, 1), "作业质量（量规得分率）", { raw: S.homework, dec: 1, unit: "%" }) +
      h.kpi(fmt(S.mastery, 1), "知识掌握度（BKT）", { raw: S.mastery, dec: 1, unit: "%" }) +
      "</div>";

    var dims = ["学业成绩", "作业质量", "知识掌握", "学习行为"];
    var gb = Ch.gbars(dims, G.map(function (g) {
      return { label: g.name, color: GCOL[g.grade], values: [g.academic, g.homework, g.mastery, g.behavior] };
    }), { yMin: 0, yMax: 100, values: true, w: 560, h: 230 });
    var gradePanel = h.panel("年级画像对比", h.legend(G.map(function (g) { return { label: g.name + "（" + g.n + " 人）", color: GCOL[g.grade] }; })) + gb +
      '<p class="note">学业 = 第 6 周三科周测平均得分率；作业 = p4 量规得分率；知识掌握 = 知识追踪（BKT）后验掌握概率的平均；学习行为 = 按时提交、练习量、订正率的综合指数（0–100）。</p>');

    // 班级对比热力格：每列各自归一化着色，格子里显示原值
    var cols = ["学业", "作业", "掌握", "行为", "参与度*"];
    var raw = CL.map(function (c) { return [c.academic, c.homework, c.mastery, c.behavior, c.engagement_concept[c.engagement_concept.length - 1]]; });
    var mins = cols.map(function (_, j) { return Math.min.apply(null, raw.map(function (r) { return r[j]; })); });
    var maxs = cols.map(function (_, j) { return Math.max.apply(null, raw.map(function (r) { return r[j]; })); });
    var norm = raw.map(function (r) { return r.map(function (v, j) { return (v - mins[j]) / (maxs[j] - mins[j] || 1); }); });
    var txt = raw.map(function (r) { return r.map(function (v) { return fmt(v, 1); }); });
    var heat = Ch.heat(norm, CL.map(function (c) { return c.name + " · " + c.n + "人"; }), cols, { cw: 74, ch: 24, left: 120, cellText: txt });
    var classPanel = h.panel("班级对比（" + CL.length + " 个班）", heat +
      '<p class="note">颜色按每一列在 12 个班中的相对高低着色（越亮越高），格子里是原始数值。*参与度为<b>概念演示</b>的合成指数，不来自任何摄像头或传感器。班级人数都 ≥ ' + D.meta.small_cell_min + "，否则不显示。</p>");

    var trend = Ch.line(P9.weekLabels(), G.map(function (g) { return { label: g.name, color: GCOL[g.grade], values: g.academic_trend }; }),
      { h: 200, ySuffix: "%", yDec: 0 });
    var trendPanel = h.panel("学业趋势（周测平均得分率）", h.legend(G.map(function (g) { return { label: g.name, color: GCOL[g.grade] }; })) + trend);

    // 右栏
    var km = Ch.heat(kcs.map(function (_, k) { return G.map(function (g) { return g.mastery_by_kc[k] / 100; }); }),
      kcs.map(function (k) { return k.name; }), G.map(function (g) { return g.name; }), { cw: 90, ch: 26, left: 120, dec: 2, min: 0.6, max: 0.95, cellText: kcs.map(function (_, k) { return G.map(function (g) { return fmt(g.mastery_by_kc[k], 1) + "%"; }); }) });
    var kmPanel = h.panel("知识点掌握度 · 年级平均", km +
      '<p class="note">每个学生每个知识点的掌握概率由 BKT 知识追踪从作答序列推断，再按年级平均。数学 6 个知识点，与认知诊断共用。</p>', { tags: h.syn() });

    var rows = PS.by_grade.map(function (g) {
      if (g.suppressed) return "<tr><td>" + esc(g.label) + '</td><td colspan="4" class="note">人数不足，不显示</td></tr>';
      return "<tr><td>" + esc(g.label) + '</td><td class="n">' + g.n + '</td><td class="n">' + h.pct(g.depression.expected_rate) + " <span class=note>(" + h.pct(g.depression.ci[0], 0) + "–" + h.pct(g.depression.ci[1], 0) + ")</span></td>" +
        '<td class="n">' + h.pct(g.anxiety.expected_rate) + " <span class=note>(" + h.pct(g.anxiety.ci[0], 0) + "–" + h.pct(g.anxiety.ci[1], 0) + ")</span></td>" +
        '<td class="n">' + h.pct(g.factors.sleep_short, 0) + "</td></tr>";
    }).join("");
    var psPanel = h.panel("心理健康 · 群体风险分布（年级层面）",
      '<table class="t"><colgroup><col style="width:14%"><col style="width:12%"><col><col><col style="width:18%"></colgroup>' +
      '<tr><th>年级</th><th class="n">人数</th><th class="n">预期抑郁筛查阳性率</th><th class="n">预期焦虑筛查阳性率</th><th class="n">睡眠 &lt;8h</th></tr>' + rows + "</table>" +
      '<p class="note">用 p3 的风险计算器（文献 meta 分析效应量，1000 次抽样）把本校（合成）学生的家庭与作息情况换算成<b>预期</b>筛查阳性率，括号内为 95% 区间。' +
      "这是资源规划用的估计，<b>不是检测结果</b>，也不对应任何个人。个人层面只给班主任“建议关注 / 普通”两档。</p>" +
      '<p><a href="#/psych">→ 查看证据与方法局限（群体心理）</a></p>', { tags: h.p3() + h.syn() });

    var engLines = D.school.grades.map(function (g) {
      var cs = CL.filter(function (c) { return c.grade === g.grade; });
      var avg = cs[0].engagement_concept.map(function (_, w) { return cs.reduce(function (s, c) { return s + c.engagement_concept[w]; }, 0) / cs.length; });
      return { label: g.name, color: GCOL[g.grade], values: avg };
    });
    var engPanel = h.panel("课堂参与度（概念演示）",
      h.legend(engLines) + Ch.line(["第1周", "第2周", "第3周", "第4周", "第5周", "第6周"], engLines, { h: 170, yDec: 0 }) +
      '<p class="note">合成的班级层面指数，用来演示“多模态学习分析”可以给出什么样的视图。本平台<b>不采集</b>课堂视频、人脸、语音，也不到个人层面。' +
      '<a href="#/methods/mm_engagement">方法墙里的说明 →</a></p>', { tags: h.concept() });

    var prov = h.panel("这些数字是怎么来的",
      '<ul class="note" style="margin:0;padding-left:18px">' +
      "<li><b>全部学生数据是合成的</b>：p9/synth.py 按固定随机种子 " + esc(D.meta.seed) + " 生成一所虚构学校。</li>" +
      "<li>知识掌握、认知诊断、自适应测验的模型是在这些合成数据上<b>真实训练</b>的，指标见 " + esc(D.build.result_path) + "。</li>" +
      "<li>心理健康部分只用 p3 的文献效应量换算预期值，数字与 p3 的 result.json 一致。</li>" +
      "<li>作业评分结构来自 p4 的量规；初二(3)班前 12 名学生直接使用 p4 演示数据库里的评分结果。</li></ul>");

    return head + '<div class="cols"><div>' + kpis + gradePanel + classPanel + trendPanel + "</div><div>" + kmPanel + psPanel + engPanel + prov + "</div></div>";
  }
  P9.views.cockpit = view;
})();
