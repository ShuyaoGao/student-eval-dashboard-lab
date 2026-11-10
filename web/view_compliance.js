/* 合规边界：可信 AI 的设计亮点。数据目录、禁止用途、默认设置、p3 的关键发现、可见范围、逐字核实的条款。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;

  function view(args) {
    var focus = args[0] || "";
    var head = '<div class="page-head"><h1>合规边界 · <em>可信 AI 是设计出来的</em></h1><span class="sub">每条规定都附逐字核实的原文出处；本平台的默认设置就是这些规定的落地</span></div>';
    var defs = h.panel("本平台的默认设置", '<table class="t"><colgroup><col style="width:22%"><col style="width:18%"><col></colgroup>' + D.defaults.map(function (d) {
      var on = d.state.indexOf("开启") >= 0;
      return "<tr><td><b>" + esc(d.name) + '</b></td><td><span class="switch ' + (on ? "on" : "off-red") + '"><i></i>' + esc(d.state) + '</span></td><td class="note">' + esc(d.detail) + "</td></tr>";
    }).join("") + "</table>");
    var cat = h.panel("哪些数据可以用 · 需要谁同意", '<table class="t"><colgroup><col style="width:22%"><col style="width:18%"><col style="width:25%"><col style="width:17%"><col></colgroup>' +
      "<tr><th>数据</th><th>用途</th><th>前提</th><th>默认</th><th>依据</th></tr>" + D.catalog.map(function (c) {
        return "<tr><td>" + esc(c.data) + '</td><td class="note">' + esc(c.use) + '</td><td class="note">' + esc(c.basis) + '</td><td class="note">' + esc(c["default"]) + "</td><td>" + c.clauses.map(h.clauseChip).join("") + "</td></tr>";
      }).join("") + "</table>");
    var pro = h.panel("禁止的用途", '<table class="t"><colgroup><col style="width:36%"><col><col style="width:28%"></colgroup><tr><th>不做什么</th><th>为什么</th><th>依据</th></tr>' + D.prohibited.map(function (p) {
      return "<tr><td><b>" + esc(p.what) + '</b></td><td class="note">' + esc(p.why) + "</td><td>" + p.clauses.map(h.clauseChip).join("") + "</td></tr>";
    }).join("") + "</table>" +
      '<p class="note">关于《人脸识别技术应用安全管理办法》的适用范围：它把人脸识别技术定义为“以人脸信息作为识别个体身份的”技术；不做身份识别的纯表情分析是否适用，存在解释空间（这是本项目的解读，不是原文结论）。但面部信息仍属于个人信息保护法第二十八条的生物识别敏感个人信息。</p>');
    var left = defs + cat + pro;

    var sm = D.p3.sim_models.depression, ra = D.p3.real_auc;
    var p3 = h.panel("为什么心理健康只做群体层面：p3 的实测结论", '<div class="grid3">' +
      '<div class="kpi"><div class="v num">' + fmt(sm.auc.value, 2) + '</div><div class="l">个体 AUC 上限（文献效应量全部成立时，合成）</div></div>' +
      '<div class="kpi"><div class="v num">' + fmt(ra.real_dep_cesdc29.value, 2) + '</div><div class="l">真实开放数据上的 AUC</div></div>' +
      '<div class="kpi"><div class="v num">' + h.pct(D.p3.real_screening.suicidal_ideation.share_in_selected.value, 0) + '</div><div class="l">真实数据“高风险名单”中留守儿童占比</div></div></div>' +
      P9.aucLadder() + '<p class="note">所以本平台：个人只给班主任“建议关注 / 普通”两档，用于主动关心和普遍性支持；学校领导只看年级层面的预期值，用于分配心理老师和课程；教育局看不到心理健康信息。个体识别必须依靠经过效度检验的量表、专业人员复核和学生自愿求助通道。</p>', { tags: h.p3() });
    var vis = D.visibility;
    var vt = h.panel("信息可见范围（报告分级）", '<table class="t"><colgroup><col style="width:36%"><col><col><col><col><col></colgroup><tr><th>信息</th>' + vis.columns.map(function (c) { return '<th style="text-align:center">' + esc(c) + "</th>"; }).join("") + "</tr>" +
      vis.rows.map(function (r) { return "<tr><td>" + esc(r.item) + "</td>" + r.cells.map(function (c) { return '<td style="text-align:center"><span class="vis ' + c + '">' + esc({ own: "本人", "class": "本班个人", agg: "汇总", none: "—" }[c]) + "</span></td>"; }).join("") + "</tr>"; }).join("") +
      '</table><p><a href="#/reports/teacher">→ 到“多角色报告”切换五个视图看效果</a></p>');
    var groups = { prohibited: "禁止与红线", science: "科学可靠性", definition: "定义", high_risk: "高风险分类", dates: "适用日期", sensitive: "敏感信息", consent: "同意", automated: "自动化决策与评估" };
    var cl = D.legal.clauses.map(function (c) {
      var s = D.legal.sources[c.source];
      return '<div class="clause" id="cl-' + c.id + '"' + (c.id === focus ? ' style="border-color:#3fe0ff;box-shadow:0 0 0 1px #3fe0ff"' : "") + '><div class="ct">' + (c.verified ? h.tag("ok", "已逐字核实") : h.tag("warn", "[未核实]")) +
        '<span class="tag lit">' + esc(groups[c.group] || c.group) + "</span>" + esc(P9.shortLaw(c.source) + " · " + c.article) + "</div>" +
        '<div style="font-size:13px;margin-top:3px">' + esc(c.summary) + '</div><div class="cq">原文：“' + esc(c.quote) + "”</div>" +
        '<div class="src"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a></div></div>";
    }).join("");
    var clauses = h.panel("条款出处（" + D.legal.clauses.length + " 条）", '<p class="note">核实方法：tools/verify_legal.py 下载官方文本（网信办、中国政府网、教育部、欧盟出版局 OJ 正式文本），检查每条摘录是否原样出现、条号是否在摘录之前出现（' + esc(D.legal.checked_at) +
      "）。注意：欧盟 2026/1744 已把附件 III 高风险义务的适用日期推迟到 2027-12-02，第 5 条的禁止性规定不受影响，自 2025-02-02 起已经适用。本页不构成法律意见。</p>" + cl);
    return head + '<div class="cols"><div>' + left + "</div><div>" + p3 + vt + clauses + "</div></div>";
  }
  view.after = function (args) {
    if (args[0]) { var el = document.getElementById("cl-" + args[0]); if (el) el.scrollIntoView({ block: "center" }); }
  };
  P9.views.compliance = view;
})();
