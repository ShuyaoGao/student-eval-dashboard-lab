/* 群体心理（复用 p3）：证据森林图、判别力上限、贴标签风险、在本校（合成）上的年级层面应用。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;

  P9.aucLadder = function () {
    var P = D.p3, sm = P.sim_models, ra = P.real_auc;
    var rows = [
      { label: "合成：全部 14 项因素 · 抑郁（理论上限）", v: sm.depression.auc.value, lo: sm.depression.auc_lo.value, hi: sm.depression.auc_hi.value, col: "#a58bff", src: sm.depression.auc },
      { label: "合成：全部 14 项因素 · 焦虑", v: sm.anxiety.auc.value, lo: sm.anxiety.auc_lo.value, hi: sm.anxiety.auc_hi.value, col: "#a58bff", src: sm.anxiety.auc },
      { label: "合成：只用留守 + 寄宿 + 成绩 + 睡眠（+性别 / 年级 / 户口）", v: sm.depression_core3.auc.value, lo: sm.depression_core3.auc_lo.value, hi: sm.depression_core3.auc_hi.value, col: "#6aa8ff", src: sm.depression_core3.auc },
      { label: "合成：与真实数据相同的家庭变量（期望值）", v: ra.sim_same_features_logit.value, lo: ra.sim_same_features_logit.lo, hi: ra.sim_same_features_logit.hi, col: "#6aa8ff", src: ra.sim_same_features_logit },
      { label: "真实开放数据（Fu 2017，N=1,719）：抑郁 CES-DC ≥29", v: ra.real_dep_cesdc29.value, lo: ra.real_dep_cesdc29.lo, hi: ra.real_dep_cesdc29.hi, col: "#ff6fae", src: ra.real_dep_cesdc29 },
      { label: "真实开放数据：近两周自杀意念", v: ra.real_suicidal_ideation.value, lo: ra.real_suicidal_ideation.lo, hi: ra.real_suicidal_ideation.hi, col: "#ff6fae", src: ra.real_suicidal_ideation },
    ];
    return '<div class="ladder">' + rows.map(function (r) {
      var f = (r.v - 0.5) / 0.5;
      return '<div class="lr"><div><div class="note" style="margin-bottom:2px">' + esc(r.label) + '</div><div class="lb" title="' + esc(r.src.source + " → " + r.src.locator) +
        '"><span style="width:' + (100 * Math.max(0.02, f)).toFixed(1) + "%;background:" + r.col + '"></span><em>' + fmt(r.v, 3) + "（" + fmt(r.lo, 3) + "–" + fmt(r.hi, 3) + "）</em></div></div>" +
        '<div class="num" style="text-align:right;font-size:18px;color:' + r.col + '">' + fmt(r.v, 2) + "</div></div>";
    }).join("") + '</div><p class="note">条形从 0.5（等于随机猜）画起，到 1.0（完美区分）。AUC 0.7 左右在医学上只算“中等”区分力。</p>';
  };

  function view() {
    var P = D.p3, E = P.evidence, sm = P.sim_models.depression, PS = D.school.psych;
    var head = '<div class="page-head"><h1>群体心理 · <em>只做群体层面的资源分配</em></h1><span class="sub">复用 p3-student-mh：文献证据汇总、校准仿真与开放数据检验</span>' + h.p3() + "</div>";
    var kpis = '<div class="kpis">' +
      h.kpi(E.rows, "证据表（行）", { raw: E.rows, title: E.source }) +
      h.kpi(E.distinct_sources, "篇文献", { raw: E.distinct_sources }) +
      h.kpi(E.verified_counts.fulltext, "行全文核实", { raw: E.verified_counts.fulltext }) +
      h.kpi(fmt(100 * P.prevalence.prev_dep_junior.min, 1) + "–" + fmt(100 * P.prevalence.prev_dep_junior.max, 1), "初中生抑郁症状检出率", { unit: "%", title: "几项 meta 分析的初中亚组" }) +
      h.kpi(fmt(sm.auc.value, 3), "个体区分力上限（AUC）", { raw: sm.auc.value, dec: 3 }) + "</div>";
    var rows = P.forest.map(function (f) { return { label: f.label, or: f.or, lo: f.lo, hi: f.hi, k: f.k, note: f.caveat }; });
    var forest = h.panel("证据森林图 · 各因素与抑郁症状的关联", Ch.forest(rows, { w: 600, left: 130, min: 0.5, max: 4.5 }) +
      '<p class="note">p3 的随机效应汇总（DerSimonian–Laird），k = 纳入研究数，灰色 = 置信区间跨过 1。几乎全部来自<b>横断面研究</b>：OR 只说明关联，不说明因果（睡眠短可能是抑郁的结果）。悬停方块可看注意事项。</p>' +
      '<p class="src">' + esc(P.forest[0].source) + " → pooled.&lt;id&gt;.or</p>", { tags: h.p3() + h.lit() });
    var ladder = h.panel("就算文献效应量全部成立，也只能“中等”区分个体", P9.aucLadder(), { tags: h.p3() });
    var left = kpis + forest + ladder;

    var ppv = Math.round(100 * sm.screening.ppv.value), rec = sm.screening.recall.value;
    var waffle = Ch.waffle([{ n: ppv, color: "#ff6fae", label: "名单中真正筛查阳性" }, { n: 100 - ppv, color: "rgba(138,163,200,0.35)", label: "名单中并非阳性" }]);
    var screen = h.panel("如果把风险最高的 20% 当“重点关注”名单", '<div class="grid2"><div style="max-width:240px">' + waffle + '</div><div>' +
      '<div class="big-num">' + h.pct(sm.screening.false_positive_share_of_selected.value, 1) + '</div><div class="note">名单里的学生<b>其实不是</b>筛查阳性</div>' +
      '<div class="big-num" style="margin-top:8px">' + h.pct(1 - rec, 1) + '</div><div class="note">真正阳性的学生<b>不在</b>名单里</div></div></div>' +
      '<p class="note">合成数据（N=' + sm.n_test.toLocaleString("zh-CN") + "）、抑郁、全部 14 项特征、逻辑回归。每格 = 名单里的 1%。</p>" +
      '<p class="src">' + esc(sm.screening.recall.source + " → " + sm.screening.recall.locator) + "</p>", { tags: h.p3() + h.syn() });
    var rs = P.real_screening;
    var lab = Ch.hbars([
      { label: "自杀意念名单 · 留守", value: rs.suicidal_ideation.share_in_selected.value, color: "#ff6fae", text: h.pct(rs.suicidal_ideation.share_in_selected.value) },
      { label: "全样本 · 留守", value: rs.suicidal_ideation.share_overall.value, color: "#8aa3c8", text: h.pct(rs.suicidal_ideation.share_overall.value) },
      { label: "抑郁 ≥29 名单 · 留守", value: rs.dep_cesdc29.share_in_selected.value, color: "#ff6fae", text: h.pct(rs.dep_cesdc29.share_in_selected.value) },
      { label: "全样本 · 留守", value: rs.dep_cesdc29.share_overall.value, color: "#8aa3c8", text: h.pct(rs.dep_cesdc29.share_overall.value) },
    ], { max: 1, left: 150, right: 60, w: 520 });
    var label = h.panel("贴标签风险是实测出来的", lab +
      '<p class="note">真实开放数据（Fu 2017，江苏盐城农村初中）只用家庭结构变量建模、取前 20% 时，“高风险名单”几乎就是“留守儿童名单”。据此重点关注，等于给留守身份本身贴上精神疾病标签。</p>' +
      '<p class="src">' + esc(rs.suicidal_ideation.share_in_selected.source) + "</p>", { tags: h.p3() });

    var gr = PS.by_grade.filter(function (g) { return !g.suppressed; });
    var bars = Ch.gbars(gr.map(function (g) { return g.label; }), [
      { label: "预期抑郁筛查阳性率", color: "#a58bff", values: gr.map(function (g) { return 100 * g.depression.expected_rate; }) },
      { label: "预期焦虑筛查阳性率", color: "#ff6fae", values: gr.map(function (g) { return 100 * g.anxiety.expected_rate; }) },
    ], { yMin: 0, yMax: 40, values: true, dec: 1, h: 190 });
    var fac = gr.map(function (g) {
      return "<tr><td>" + esc(g.label) + '</td><td class="n">' + g.n + '</td><td class="n">' + g.depression.expected_count[0] + "–" + g.depression.expected_count[1] + '</td><td class="n">' +
        h.pct(g.factors.left_behind, 0) + '</td><td class="n">' + h.pct(g.factors.boarding, 0) + '</td><td class="n">' + h.pct(g.factors.sleep_short, 0) + '</td><td class="n">' + h.pct(g.factors.bullied, 0) + "</td></tr>";
    }).join("");
    var top = gr.slice().sort(function (a, b) { return b.factors.sleep_short - a.factors.sleep_short; })[0];
    var app = h.panel("在本校（合成）上的用法：年级层面的资源规划", h.legend([{ label: "预期抑郁筛查阳性率", color: "#a58bff" }, { label: "预期焦虑筛查阳性率", color: "#ff6fae" }]) + bars +
      '<table class="t"><colgroup><col style="width:12%"><col style="width:11%"><col style="width:19%"><col><col><col><col></colgroup><tr><th>年级</th><th class="n">人数</th><th class="n">预期阳性人数</th><th class="n">留守</th><th class="n">住校</th><th class="n">睡眠&lt;8h</th><th class="n">受欺凌</th></tr>' + fac + "</table>" +
      '<p class="note"><b>可以这样用：</b>估计各年级可能需要多少心理老师和咨询时间；决定普遍性心理健康课程、作息干预先在哪里铺开（例如睡眠不足比例最高的是' + esc(top.label) + "，" + h.pct(top.factors.sleep_short, 0) + "）。" +
      "<br><b>不能这样用：</b>判断某个学生“会不会得抑郁症”；分班、评优、录取；对学生或家长出示“你的风险是 X 倍”。</p>" +
      '<p class="note">p3 计算器的说明：' + esc(P.calc_disclaimer) + "</p>", { tags: h.p3() + h.syn() });
    return head + '<div class="cols"><div>' + left + "</div><div>" + screen + label + app + "</div></div>";
  }
  P9.views.psych = view;
})();
