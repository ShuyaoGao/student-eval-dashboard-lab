/* 多角色报告：学生 / 老师 / 家长 / 学校领导 / 教育局。每个报告函数只拿到 P9.scope(role) 返回的数据。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt, h = P9.h;
  var EXCLUDE = {
    student: ["其他同学的任何信息", "排名", "心理健康评估信息", "老师的内部备注"],
    teacher: ["其他班级学生的个人信息", "按分数或风险的排名", "家庭情况明细（只有“建议关注 / 普通”）"],
    parent: ["其他学生的任何信息", "班级排名", "心理健康评估信息", "AI 原始评分和老师的内部备注"],
    leader: ["可识别的个人（姓名、学号）", "人数少于 " + D.meta.small_cell_min + " 的格子", "个人心理健康信息"],
    bureau: ["任何个人信息", "班级明细", "心理健康信息（包括汇总）"],
  };

  function paper(title, meta, body, foot) {
    return '<div class="paper"><span class="wm">演示数据 · 合成</span><h1>' + esc(title) + '</h1><div class="meta">' + esc(meta) + "</div>" + body +
      '<div class="foot">' + esc(foot) + " · 生成自 " + esc(D.meta.school) + " 的合成数据 · " + esc(D.build.built_at) + "</div></div>";
  }
  function radarOf(r, withMean) {
    var axes = [{ label: "学业成绩" }, { label: "作业质量" }, { label: "写作·内容" }, { label: "写作·表达" }, { label: "知识掌握" }, { label: "学习行为" }];
    return Ch.radar(axes, [{ label: "本人", color: "#1c8fd6", values: [r.academic, r.homework, r.content, r.language, r.mastery, r.behavior], fill: 0.18 }], { w: 380, h: 300 });
  }
  function kcLists(bkt, kcs) {
    var good = [], work = [];
    kcs.forEach(function (k, i) { if (bkt[i] >= 0.8) good.push(k.name); else if (bkt[i] < 0.6) work.push(k.name); });
    return { good: good, work: work };
  }
  function catLevel(c) {
    var lv = c.eap > 1 ? "较高" : c.eap > 0.3 ? "中等偏上" : c.eap > -0.3 ? "中等" : c.eap > -1 ? "中等偏下" : "基础阶段";
    return lv + "（θ = " + fmt(c.eap, 2) + "，95% 区间 " + fmt(c.eap - 1.96 * c.psd, 2) + " 到 " + fmt(c.eap + 1.96 * c.psd, 2) + "）";
  }
  function hwTable(hw) {
    var rows = hw.filter(function (r) { return r.total != null; }).map(function (r) {
      return "<tr><td>" + esc(r.date.slice(5)) + "</td><td>" + esc(r.title) + "</td><td>" + fmt(r.total, 1) + " / " + fmt(r.max, 0) + "</td><td>" + esc(r.band) + "</td><td>" + (r.status === "reviewed" ? "老师已复核" : "待老师复核") + "</td></tr>";
    }).join("");
    return "<table><colgroup><col style=\"width:10%\"><col style=\"width:40%\"><col><col><col></colgroup><tr><th>日期</th><th>作业</th><th>得分</th><th>档次</th><th>状态</th></tr>" + (rows || '<tr><td colspan="5">暂无</td></tr>') + "</table>";
  }

  var REPORT = {
    student: function (s) {
      var me = s.me, L = kcLists(me.kt_end.bkt, s.kcs);
      var next = me.guidance.filter(function (g) { return g.category === "知识" || g.category === "行为" || g.category === "作业"; }).slice(0, 3)
        .map(function (g) { return "<li><b>" + esc(g.title) + "</b>：" + esc(g.action) + "</li>"; }).join("");
      return paper("我的学习报告 · " + me.name, me.class_name + " · " + D.meta.term,
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div><h2>我的综合画像</h2>' + radarOf(me.radar) + "</div><div>" +
        "<h2>知识点</h2><p><b>掌握得好：</b>" + esc(L.good.join("、") || "继续积累中") + "</p><p><b>还要加油：</b>" + esc(L.work.join("、") || "暂时没有明显薄弱点") + "</p>" +
        "<h2>自适应小测</h2><p>数学能力估计" + esc(catLevel(me.cat_final)) + "。区间越窄说明估计越确定。</p>" +
        "<h2>老师的话</h2><p>" + esc(me.comment) + "</p></div></div>" +
        "<h2>我的作业</h2>" + hwTable(me.homework) + "<h2>下一步可以这样做</h2><ul>" + (next || "<li>保持现在的学习节奏。</li>") + "</ul>",
        "本报告只包含你自己的信息，没有排名，也不包含任何心理健康评估");
    },
    parent: function (s) {
      var c = s.child, L = kcLists(c.kt_end.bkt, s.kcs);
      var home = c.guidance.filter(function (g) { return g.category !== "合规"; }).slice(0, 3).map(function (g) { return "<li><b>" + esc(g.title) + "</b>：" + esc(g.action) + "</li>"; }).join("");
      var grow = Ch.line(P9.weekLabels(), [{ label: "学业成绩", color: "#1c8fd6", values: c.growth.academic }, { label: "知识掌握", color: "#7b5cd6", values: c.growth.mastery }], { h: 170, yMin: 0, yMax: 100, w: 520 });
      return paper("家长报告 · " + c.name, c.class_name + " · " + D.meta.term + " · 只包含您孩子本人的信息",
        "<h2>本学期概况</h2>" + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div>' + radarOf(c.radar) + "</div><div>" +
        "<p><b>掌握得好的知识点：</b>" + esc(L.good.join("、") || "—") + "</p><p><b>需要巩固的知识点：</b>" + esc(L.work.join("、") || "暂无明显薄弱点") + "</p>" +
        "<p><b>自适应小测：</b>" + esc(catLevel(c.cat_final)) + "</p><p><b>作业按时提交率：</b>" + (c.behavior.on_time[c.behavior.on_time.length - 1] == null ? "—" : h.pct(c.behavior.on_time[c.behavior.on_time.length - 1], 0)) + "</p></div></div>" +
        "<h2>成长曲线（与孩子自己的过去比，不与别人比）</h2>" + h.legend([{ label: "学业成绩", color: "#1c8fd6" }, { label: "知识掌握", color: "#7b5cd6" }]) + grow +
        "<h2>作业（家长端只显示老师复核后的结果）</h2>" + hwTable(c.homework.filter(function (r) { return r.status === "reviewed"; })) +
        "<h2>在家可以怎么帮助</h2><ul>" + (home || "<li>保持规律作息。</li>") + "</ul>" +
        "<h2>老师的话</h2><p>" + esc(c.comment) + "</p>" +
        "<h2>您的权利</h2><p>授权状态：" + (s.consent ? "已签署基本处理同意" : "未签署") + "。您可以随时查看和导出孩子的数据、删除作业、撤回同意；撤回后孩子仍可正常使用基本功能。对系统自动生成的评价，您可以要求老师说明理由。</p>",
        "家长报告不含班级排名和其他学生的信息，不含心理健康评估信息");
    },
    teacher: function (s) {
      var cm = s.class_mean;
      var rows = s.students.map(function (x) {
        var r = x.radar;
        return "<tr><td>" + esc(x.sid) + "</td><td>" + esc(x.name) + "</td><td>" + fmt(r.academic, 0) + "</td><td>" + (r.homework == null ? "未授权" : fmt(r.homework, 0)) + "</td><td>" + fmt(r.mastery, 0) +
          "</td><td>" + fmt(r.behavior, 0) + "</td><td>" + (x.psych_flag === "建议关注" ? "● 建议关注" : "") + "</td><td>" + esc(x.top_guidance.join("") || "—") + "</td></tr>";
      }).join("");
      var weak = s.kcs.map(function (k, i) {
        var n = s.students.filter(function (x) { return x.kt_end[i] < 0.6; }).length;
        return { label: k.name, value: cm.mastery_by_kc[i], color: "#1c8fd6", text: fmt(cm.mastery_by_kc[i], 1) + "%　（" + n + " 人 <0.6）" };
      });
      return paper("班级学情报告 · " + s.class_name, D.meta.term + " · 班主任 · " + s.students.length + " 名学生（按学号排列）",
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div><h2>班级概况</h2><p>学业 ' + fmt(cm.academic, 1) + "%，作业质量 " + fmt(cm.homework, 1) + "%，知识掌握 " + fmt(cm.mastery, 1) + "%，学习行为 " + fmt(cm.behavior, 1) +
        "，每周练习 " + fmt(cm.practice_per_week, 1) + " 题/人。</p></div><div><h2>知识点掌握（班级平均）</h2>" + Ch.hbars(weak, { max: 100, left: 96, right: 120, w: 360, rowH: 22 }) + "</div></div>" +
        "<h2>学生一览</h2><table><colgroup><col style=\"width:10%\"><col style=\"width:10%\"><col style=\"width:8%\"><col style=\"width:8%\"><col style=\"width:8%\"><col style=\"width:8%\"><col style=\"width:13%\"><col></colgroup>" +
        "<tr><th>学号</th><th>姓名</th><th>学业</th><th>作业</th><th>掌握</th><th>行为</th><th>关怀提示</th><th>首要建议</th></tr>" + rows + "</table>" +
        "<p>“关怀提示”只对班主任可见，依据是群体层面的风险因素，不是诊断；只用于主动关心和提供普遍性支持，不对学生和家长出示，不进入任何排名。</p>",
        "教师报告只含本班学生；不提供按分数或风险排序");
    },
    leader: function (s) {
      var S = s.school;
      var g = s.grades.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + x.n + "</td><td>" + fmt(x.academic, 1) + "</td><td>" + fmt(x.homework, 1) + "</td><td>" + fmt(x.mastery, 1) + "</td><td>" + fmt(x.behavior, 1) + "</td></tr>"; }).join("");
      var c = s.classes.map(function (x) {
        return x.suppressed ? "<tr><td>" + esc(x.name) + '</td><td colspan="5">人数不足，不显示</td></tr>' :
          "<tr><td>" + esc(x.name) + "</td><td>" + x.n + "</td><td>" + fmt(x.academic, 1) + "</td><td>" + fmt(x.homework, 1) + "</td><td>" + fmt(x.mastery, 1) + "</td><td>" + fmt(x.behavior, 1) + "</td></tr>";
      }).join("");
      var p = s.psych.by_grade.map(function (x) {
        return x.suppressed ? "" : "<tr><td>" + esc(x.label) + "</td><td>" + x.n + "</td><td>" + h.pct(x.depression.expected_rate) + "（" + h.pct(x.depression.ci[0], 0) + "–" + h.pct(x.depression.ci[1], 0) + "）</td><td>" +
          x.depression.expected_count[0] + "–" + x.depression.expected_count[1] + " 人</td><td>" + h.pct(x.factors.sleep_short, 0) + "</td></tr>";
      }).join("");
      var kc = Ch.heat(s.kcs.map(function (_, k) { return s.grades.map(function (x) { return x.mastery_by_kc[k] / 100; }); }), s.kcs.map(function (k) { return k.name; }),
        s.grades.map(function (x) { return x.name; }), { cw: 80, ch: 22, left: 110, cellText: s.kcs.map(function (_, k) { return s.grades.map(function (x) { return fmt(x.mastery_by_kc[k], 0) + "%"; }); }) });
      return paper("学校学情报告 · " + S.name, D.meta.term + " · 学校领导 · 只含汇总统计",
        "<h2>全校概况</h2><p>在校 " + S.n + " 人、" + S.n_classes + " 个班。周测平均 " + fmt(S.academic, 1) + "%，作业质量 " + fmt(S.homework, 1) + "%，知识掌握 " + fmt(S.mastery, 1) + "%，学习行为 " + fmt(S.behavior, 1) + "。</p>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div><h2>年级对比</h2><table><tr><th>年级</th><th>人数</th><th>学业</th><th>作业</th><th>掌握</th><th>行为</th></tr>' + g + "</table></div>" +
        "<div><h2>知识点掌握（年级平均）</h2>" + kc + "</div></div>" +
        "<h2>班级对比</h2><table><tr><th>班级</th><th>人数</th><th>学业</th><th>作业</th><th>掌握</th><th>行为</th></tr>" + c + "</table>" +
        "<h2>心理健康：年级层面的资源规划参考</h2><table><tr><th>年级</th><th>人数</th><th>预期抑郁筛查阳性率</th><th>预期人数区间</th><th>睡眠不足</th></tr>" + p + "</table>" +
        "<p>按文献效应量换算的预期值（p3），用于估计心理老师与咨询时间的需求、决定普遍性课程和作息干预先在哪里铺开；不是检测结果，不对应任何个人。</p>",
        "学校报告不含可识别的个人；人数少于 " + D.meta.small_cell_min + " 的格子不显示");
    },
    bureau: function (s) {
      var R = s.region.schools;
      var rows = R.map(function (x) { return "<tr><td>" + esc(x.name) + (x.is_demo_school ? "（本演示学校）" : "") + "</td><td>" + x.n + "</td><td>" + fmt(x.academic, 1) + "</td><td>" + fmt(x.homework, 1) + "</td><td>" + fmt(x.mastery, 1) + "</td><td>" + fmt(x.behavior, 1) + "</td></tr>"; }).join("");
      var avg = function (k) { var t = 0, n = 0; R.forEach(function (x) { t += x[k] * x.n; n += x.n; }); return t / n; };
      var gb = Ch.gbars(R.map(function (x) { return x.name.replace("（虚构）", ""); }), [
        { label: "学业", color: "#1c8fd6", values: R.map(function (x) { return x.academic; }) },
        { label: "知识掌握", color: "#7b5cd6", values: R.map(function (x) { return x.mastery; }) }], { yMin: 0, yMax: 100, h: 200, w: 640 });
      var total = R.reduce(function (t, x) { return t + x.n; }, 0);
      return paper("区域学情汇总 · " + s.region.name, D.meta.term + " · 教育局 · 只含学校层面汇总",
        "<h2>区域概况</h2><p>" + R.length + " 所学校、" + total.toLocaleString("zh-CN") + " 名初中生（加权平均）：学业 " + fmt(avg("academic"), 1) + "%，作业质量 " + fmt(avg("homework"), 1) + "%，知识掌握 " + fmt(avg("mastery"), 1) + "%，学习行为 " + fmt(avg("behavior"), 1) + "。</p>" +
        "<h2>学校对比</h2>" + gb + "<table><colgroup><col style=\"width:34%\"><col><col><col><col><col></colgroup><tr><th>学校</th><th>学生数</th><th>学业</th><th>作业</th><th>掌握</th><th>行为</th></tr>" + rows + "</table>" +
        "<p>说明：除本演示学校外，其他学校只生成了学校层面的汇总数字（合成）。本视图不含任何个人信息、班级明细和心理健康信息。</p>",
        "教育局报告只含学校层面汇总");
    },
  };
  P9.REPORT = REPORT;

  function view(args) {
    var role = args[0] || "teacher";
    if (!REPORT[role]) role = "teacher";
    var R = D.roles.filter(function (r) { return r.id === role; })[0];
    var tabs = '<div class="subtabs" id="role-tabs" style="margin:0">' + D.roles.map(function (r) {
      return '<button data-role="' + r.id + '" class="' + (r.id === role ? "on" : "") + '" title="' + esc(r.who) + '">' + esc(r.name) + "</button>";
    }).join("") + "</div>";
    var head = '<div class="page-head"><h1>多角色报告 · <em>' + esc(R.name) + "视图</em></h1>" + tabs + '<span class="sub">当前身份：' + esc(R.who) + "</span>" + h.syn() + "</div>";
    var report = REPORT[role](P9.scope(role));
    var vis = D.visibility, ci = D.roles.map(function (r) { return r.id; }).indexOf(role);
    var vrows = vis.rows.map(function (r) {
      return "<tr><td>" + esc(r.item) + "</td>" + r.cells.map(function (c, j) {
        return '<td style="text-align:center' + (j === ci ? ";background:rgba(63,224,255,0.1)" : "") + '"><span class="vis ' + c + '">' + esc({ own: "本人", "class": "本班个人", agg: "汇总", none: "—", full: "完整" }[c]) + "</span></td>";
      }).join("") + "</tr>";
    }).join("");
    var right = h.panel("这个视图能看到什么", '<table class="t"><colgroup><col style="width:34%"><col><col><col><col><col></colgroup><tr><th>信息</th>' +
      vis.columns.map(function (c, j) { return '<th style="text-align:center' + (j === ci ? ";color:#3fe0ff" : "") + '">' + esc(c) + "</th>"; }).join("") + "</tr>" + vrows + "</table>" +
      '<p class="note">' + Object.keys(vis.legend).map(function (k) { return '<span class="vis ' + k + '">' + esc({ own: "本人", "class": "本班个人", agg: "汇总", none: "—" }[k]) + "</span> " + esc(vis.legend[k]); }).join("　") + "</p>" +
      '<ul class="note" style="padding-left:18px">' + vis.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>");
    right += h.panel(esc(R.name) + "视图刻意不包含", '<ul style="margin:0;padding-left:18px">' + EXCLUDE[role].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      '<p class="note">报告函数只能拿到按角色裁剪过的数据（app_core.js 里的 P9.scope），不是“先全部取出再隐藏”。</p>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary" id="export-btn" title="以一页报告的样式打开，可打印或另存为 PDF">导出一页报告</button></div>');
    return head + '<div class="cols"><div><div class="col-tag">报告预览</div>' + report + "</div><div>" + right + "</div></div>";
  }
  view.after = function (args) {
    var role = args[0] || "teacher";
    document.querySelectorAll("#role-tabs [data-role]").forEach(function (b) { b.onclick = function () { P9.go("reports/" + b.getAttribute("data-role")); }; });
    document.getElementById("export-btn").onclick = function () { P9.openReport(REPORT[REPORT[role] ? role : "teacher"](P9.scope(REPORT[role] ? role : "teacher"))); };
  };
  P9.views.reports = view;
})();
