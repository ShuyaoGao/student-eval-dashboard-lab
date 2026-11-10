/* 数据大屏：固定 1920×1080 设计稿，等比缩放。知识图谱主视觉、ECharts 动态图表、学生轮播（打码）、隐私保护面板、合成实时动态。
   打码在 Python 端完成（p9/screen.py），轮播只拿到打码后的字段，DOM 里不会出现姓名与学号原文。 */
(function () {
  "use strict";
  var P9 = window.P9, D = P9.D, Ch = window.Charts, esc = Ch.esc, fmt = Ch.fmt;
  var SC = D.screen;
  var KCOL = ["#3fe0ff", "#a58bff", "#ff6fae", "#ffc857", "#4be3a5", "#6aa8ff"];
  var GCOL = { 7: "#3fe0ff", 8: "#a58bff", 9: "#ff6fae" };
  var TXT = "#9fc4ee";
  var S = window.P9_SCREEN = { entered: false, idx: 0, switches: 0, paused: false, audit: [], scale: 1 };
  var charts = [];

  function anim() { return !P9.isStatic(); }
  function ec(el) {
    if (!window.echarts) return null;
    var c = window.echarts.init(el, null, { renderer: "canvas" });
    charts.push(c);
    return c;
  }
  function panel(id, pos, title, tag, right, body, bodyStyle) {
    return '<section class="sp" id="sp-' + id + '" style="left:' + pos[0] + "px;top:" + pos[1] + "px;width:" + pos[2] + "px;height:" + pos[3] + "px;--d:" + pos[4] + 's">' +
      '<i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>' +
      '<div class="sp-h">' + esc(title) + (tag ? "<em>" + esc(tag) + "</em>" : "") + (right ? '<span class="r">' + right + "</span>" : "") + "</div>" +
      '<div class="sp-b"' + (bodyStyle ? ' style="' + bodyStyle + '"' : "") + ">" + body + "</div></section>";
  }
  var POS = {
    kpi: [24, 100, 460, 212, 0.1], grade: [24, 322, 460, 250, 0.3], heat: [24, 582, 460, 230, 0.5], model: [24, 822, 460, 234, 0.7],
    kg: [500, 100, 920, 600, 0.2], trend: [500, 710, 452, 346, 0.6], tick: [968, 710, 452, 346, 0.8],
    car: [1436, 100, 460, 520, 0.4], priv: [1436, 630, 460, 426, 0.9],
  };

  function icon(col) {
    return '<svg class="ic" viewBox="0 0 42 42"><circle cx="21" cy="21" r="18" fill="none" stroke="' + col + '" stroke-width="2" stroke-dasharray="20 8" opacity="0.9"/>' +
      '<circle cx="21" cy="21" r="11" fill="none" stroke="' + col + '" stroke-width="1" opacity="0.6"/><circle cx="21" cy="21" r="4" fill="' + col + '"/></svg>';
  }
  function kpiTile(v, unit, label, col, dec) {
    return '<div class="ktile">' + icon(col) + '<div class="v" data-count="' + v + '" data-dec="' + (dec || 0) + '">' + (dec ? fmt(v, dec) : Number(v).toLocaleString("zh-CN")) +
      "<small>" + unit + '</small></div><div class="l">' + esc(label) + "</div></div>";
  }
  function heatColor(v) {
    var f = Math.max(0, Math.min(1, (v - 0.70) / 0.18));
    var r = Math.round(30 + f * 150), g = Math.round(110 + f * 140), b = Math.round(190 + f * 65);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function weekNow() {
    var t0 = new Date(D.meta.term_start || "2026-09-01T00:00:00"), d = Math.floor((Date.now() - t0.getTime()) / 864e5);
    return Math.max(1, Math.floor(d / 7) + 1);
  }

  function view() {
    var K = SC.kpi, G = D.school.grades, kcs = D.meta.kcs, M = D.models, pv = SC.privacy;
    var head = '<div class="scr-head">' +
      '<svg class="deco" width="1920" height="88" viewBox="0 0 1920 88"><defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#3fe0ff" stop-opacity="0"/><stop offset=".5" stop-color="#3fe0ff"/><stop offset="1" stop-color="#3fe0ff" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0 74 H600 L636 86 H1284 L1320 74 H1920" fill="none" stroke="url(#hg)" stroke-width="2"/>' +
      '<path class="hflow" d="M0 74 H600 L636 86 H1284 L1320 74 H1920" fill="none" stroke="#bff4ff" stroke-width="2" stroke-dasharray="4 26" style="animation:dash 1.4s linear infinite;filter:drop-shadow(0 0 6px #3fe0ff)"/>' +
      '<path d="M600 0 L640 60 H1280 L1320 0" fill="rgba(63,160,255,0.08)" stroke="rgba(63,224,255,0.5)"/></svg>' +
      '<nav class="scr-nav">' + P9.TABS.filter(function (t) { return t.id !== "screen"; }).map(function (t) {
        return '<a href="#/' + t.id + '" title="' + esc(t.desc) + '">' + esc(t.name) + "</a>";
      }).join("") + "</nav>" +
      '<div class="scr-title"><b>学生成长全景 · 数据大屏</b><small>' + esc(D.meta.school) + " · 合成数据，仅作概念演示 · 数据截至第 6 周</small></div>" +
      '<div class="scr-right"><div class="scr-clock"><div class="t" id="scr-time">--:--:--</div><div class="d" id="scr-date"></div></div>' +
      '<span class="scr-badge" title="页面上所有学生、学校、成绩都是程序生成的虚构数据">演示数据 · 合成</span>' +
      '<button class="scr-btn" data-tour-btn title="在大屏和各页面之间自动轮播（P）">巡演</button>' +
      '<button class="scr-btn" data-static-btn title="关闭动画，给配置较低的电脑用（S）">静态模式</button>' +
      '<button class="scr-btn" id="scr-help" title="操作说明（H）">?</button>' +
      '<button class="scr-btn exit" id="scr-exit" title="停止全部动画与计时器并结束">退出</button></div></div>';

    var kpi = panel("kpi", POS.kpi, "全校概览", "合成数据", "", '<div class="kgrid">' +
      kpiTile(K.students, "人", "在校学生", "#3fe0ff") + kpiTile(K.responses, "次", "本学期练习作答", "#a58bff") +
      kpiTile(K.ai_graded, "份", "AI 初评作业（p4）", "#ffc857") + kpiTile(K.mastery, "%", "平均知识掌握度（BKT）", "#4be3a5", 1) + "</div>");
    var grade = panel("grade", POS.grade, "年级画像对比", "", "0–100", '<div id="ec-grade" style="width:432px;height:190px"></div>');
    var cells = '<div></div>' + G.map(function (g) { return '<div class="hh">' + esc(g.name) + "</div>"; }).join("");
    kcs.forEach(function (k, i) {
      cells += '<div class="hl">' + esc(k.name) + "</div>";
      G.forEach(function (g, j) {
        var v = g.mastery_by_kc[i] / 100;
        cells += '<div class="hc" style="background:' + heatColor(v) + ";--cd:" + (0.7 + (i * 3 + j) * 0.07).toFixed(2) + 's" title="' + esc(g.name + " · " + k.name + "：" + fmt(100 * v, 1) + "%") + '">' + fmt(100 * v, 1) + "</div>";
      });
    });
    var heat = panel("heat", POS.heat, "知识点掌握热力", "BKT", "年级平均 %", '<div class="hgrid">' + cells + "</div>");
    var red = 1 - M.cat.maxinfo.rmse_by_step[9] / M.cat.random.rmse_by_step[9];
    var model = panel("model", POS.model, "模型实测", "合成数据", "", '<div class="mgrid">' +
      '<div><div class="mc" id="ec-m1"></div><div class="ml">知识追踪 AUC<br>BKT · 留出学生</div></div>' +
      '<div><div class="mc" id="ec-m2"></div><div class="ml">认知诊断<br>属性判定准确率</div></div>' +
      '<div><div class="mc" id="ec-m3"></div><div class="ml">自适应测验 10 题<br>误差比随机抽题降低</div></div></div>');
    S.red = red;

    var kg = panel("kg", POS.kg, "知识图谱 · 掌握度网络", "合成数据", "6 个知识点 · 60 道练习题 · " + K.students + " 名学生",
      '<div id="kg-wrap"><div class="kg-rings"><div class="r1"></div><div class="r2"></div><div class="r3"></div></div>' +
      '<canvas id="kg-cv" width="920" height="560"></canvas><div class="kg-tip" id="kg-tip"></div>' +
      '<div class="kg-legend">大节点 = 知识点，<b>越亮掌握度越高</b>（全校 BKT 平均）；小节点 = 练习题，亮度 = 全校正确率；粗连线 = 先修关系（按课程顺序设定）；连线上的光点 = 作答数据流（示意）</div></div>',
      "padding:0");
    var trend = panel("trend", POS.trend, "学业趋势", "", "周测平均得分率 %", '<div id="ec-trend" style="width:424px;height:286px"></div>');
    var tick = panel("tick", POS.tick, "实时动态", "合成事件模拟", '<span id="tick-n"></span>', '<div class="ticker" id="ticker"></div>', "padding:0");
    var car = panel("car", POS.car, "学生成长轮播", "", '<span class="ptag">隐私保护中</span>', '<div class="car" id="car"></div>', "padding:0");
    var priv = panel("priv", POS.priv, "隐私保护 · 脱敏引擎", "", "运行中", '<div class="pv-row"><div><div class="pv-ring" id="ec-priv"></div>' +
      '<div class="note" style="text-align:center;margin-top:-4px">已启用的保护措施</div></div><div class="pv-rules">' +
      pv.mask_rules.map(function (r) { return '<div title="' + esc(r.scope) + '"><i class="on"></i>' + esc(r.rule) + '<span class="ex">' + esc(r.example) + "</span></div>"; }).join("") +
      '<div class="note" style="border:0;height:auto;line-height:1.4;padding-top:4px">未启用：' + esc(pv.protections.filter(function (p) { return !p.on; }).map(function (p) { return p.name; }).join("、")) + "（上线前必须补做）</div></div></div>" +
      '<div class="pv-sec">数据最小化 · 采集 / <span style="color:#ff9aa6">不采集</span></div><div class="pv-chips">' +
      pv.collected.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + pv.not_collected.map(function (c) { return '<span class="no">' + esc(c) + "</span>"; }).join("") + "</div>" +
      '<div class="pv-sec">访问审计（合成记录）</div><div class="pv-audit" id="pv-audit"></div>');

    return '<div id="scr-wrap"><div id="scr-stage"><canvas id="scr-bg" width="1920" height="1080"></canvas>' + head + kpi + grade + heat + model + kg + trend + tick + car + priv +
      '<div class="scr-vignette"></div><div class="scr-scan"></div>' + authBox() + "</div></div>";
  }

  /* ------------------------------------------------------------------ 缩放 */
  function fit() {
    var st = document.getElementById("scr-stage");
    if (!st) return;
    var w = window.innerWidth, h = window.innerHeight, s = Math.min(w / 1920, h / 1080);
    st.style.transform = "scale(" + s + ")";
    st.style.left = Math.round((w - 1920 * s) / 2) + "px";
    st.style.top = Math.round((h - 1080 * s) / 2) + "px";
    S.scale = s;
  }

  /* ------------------------------------------------------------------ 背景粒子 */
  function bg() {
    var cv = document.getElementById("scr-bg"), ctx = cv.getContext("2d"), W = 1920, H = 1080, rnd = mulberry(7), ps = [];
    for (var i = 0; i < 70; i++) ps.push([rnd() * W, rnd() * H, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35]);
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(84,176,255,0.05)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      for (var a = 0; a < ps.length; a++) {
        var p = ps[a];
        for (var b = a + 1; b < ps.length; b++) {
          var q = ps[b], dx = p[0] - q[0], dy = p[1] - q[1], d2 = dx * dx + dy * dy;
          if (d2 < 22000) { ctx.strokeStyle = "rgba(63,224,255," + (0.16 * (1 - d2 / 22000)).toFixed(3) + ")"; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        }
        ctx.fillStyle = "rgba(160,230,255,0.55)"; ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
      }
    }
    if (!anim()) { draw(); return; }
    P9.anim("scr-bg", function () {
      for (var i = 0; i < ps.length; i++) { var p = ps[i]; p[0] = (p[0] + p[2] + W) % W; p[1] = (p[1] + p[3] + H) % H; }
      draw();
    });
  }
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------------ 知识图谱（力导向布局 + 脉冲） */
  function sprite(col, r) {
    var c = document.createElement("canvas"); c.width = c.height = r * 2;
    var x = c.getContext("2d"), g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, col); g.addColorStop(0.25, col); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
    return c;
  }
  function knowledgeGraph() {
    var cv = document.getElementById("kg-cv"), ctx = cv.getContext("2d"), W = 920, H = 560, cx = 460, cy = 252;
    var kcs = D.meta.kcs, rnd = mulberry(11), nodes = SC.graph.nodes.map(function (n) { return Object.assign({}, n); }), byId = {};
    // 布局：6 个知识点放在椭圆上（固定），每个知识点的练习题均匀环绕在周围；数据量小，不需要迭代求解
    var kcIds = kcs.map(function (x) { return x.id; }), cnt = {};
    nodes.forEach(function (n) {
      byId[n.id] = n;
      if (n.kind === "kc") { var k = kcIds.indexOf(n.id), a = -Math.PI / 2 + k * Math.PI / 3; n.x = cx + 300 * Math.cos(a); n.y = cy + 172 * Math.sin(a); n.ci = k; }
    });
    nodes.forEach(function (n) {
      if (n.kind !== "item") return;
      var h = byId[n.kc], j = (cnt[n.kc] = (cnt[n.kc] || 0) + 1) - 1, a = j * 2 * Math.PI / 10 + h.ci * 0.4, R = 66 + 14 * ((j * 7) % 3) / 2 + rnd() * 6;
      n.ci = h.ci; n.x = h.x + R * Math.cos(a); n.y = h.y + R * 0.82 * Math.sin(a);
    });
    var links = SC.graph.links.map(function (l) { return { s: byId[l.s], t: byId[l.t], kind: l.kind }; });
    nodes.forEach(function (n) { n.bx = n.x; n.by = n.y; n.ph = rnd() * 6.28; });
    var spr = KCOL.map(function (c) { return sprite(c, 64); }), sprS = KCOL.map(function (c) { return sprite(c, 14); });
    var pulses = [], t0 = null, last = 0;
    function draw(t) {
      if (t0 == null) t0 = t;
      var e = (t - t0) / 1000, intro = anim() ? Math.min(1, e / 1.6) : 1;
      ctx.clearRect(0, 0, W, H);
      nodes.forEach(function (n) { n.x = n.bx + (anim() ? Math.sin(e * 0.7 + n.ph) * 3 : 0); n.y = n.by + (anim() ? Math.cos(e * 0.6 + n.ph) * 3 : 0); });
      ctx.globalCompositeOperation = "lighter";
      links.forEach(function (l, i) {
        var p = Math.min(1, Math.max(0, intro * 1.6 - (l.kind === "prereq" ? 0 : 0.3)));
        if (p <= 0) return;
        ctx.strokeStyle = l.kind === "prereq" ? "rgba(120,220,255,0.55)" : "rgba(" + (l.t.ci === 2 ? "255,111,174" : "84,176,255") + ",0.16)";
        ctx.lineWidth = l.kind === "prereq" ? 2.2 : 1;
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.s.x + (l.t.x - l.s.x) * p, l.s.y + (l.t.y - l.s.y) * p); ctx.stroke();
      });
      // 脉冲
      if (anim() && intro >= 1 && t - last > 90) {
        last = t;
        var l = links[Math.floor(Math.random() * links.length)];
        pulses.push({ l: l, u: 0, v: l.kind === "prereq" ? 0.012 : 0.02 });
        if (Math.random() < 0.5) { var lp = links[Math.floor(Math.random() * 6)]; pulses.push({ l: lp, u: 0, v: 0.01 }); }
      }
      pulses = pulses.filter(function (p) { return (p.u += p.v) < 1; });
      pulses.forEach(function (p) {
        for (var k = 0; k < 4; k++) {
          var u = Math.max(0, p.u - k * 0.03), x = p.l.s.x + (p.l.t.x - p.l.s.x) * u, y = p.l.s.y + (p.l.t.y - p.l.s.y) * u;
          ctx.globalAlpha = (1 - k / 4) * (p.l.kind === "prereq" ? 1 : 0.7);
          ctx.drawImage(sprS[p.l.s.ci], x - 7, y - 7);
        }
      });
      ctx.globalAlpha = 1;
      // 题目节点
      nodes.forEach(function (n) {
        if (n.kind !== "item") return;
        var r = n.rate == null ? 0.5 : n.rate;
        ctx.globalAlpha = intro * (0.25 + 0.75 * Math.pow(r, 2));
        ctx.drawImage(sprS[n.ci], n.x - 7, n.y - 7);
        ctx.fillStyle = KCOL[n.ci]; ctx.beginPath(); ctx.arc(n.x, n.y, 2 + 2.5 * r, 0, 6.29); ctx.fill();
      });
      // 知识点节点
      nodes.forEach(function (n) {
        if (n.kind !== "kc") return;
        var m = n.mastery, R = 30 + 10 * Math.max(0, (m - 0.7) / 0.2), glow = 0.35 + 0.65 * Math.max(0, (m - 0.7) / 0.2), br = anim() ? 0.85 + 0.15 * Math.sin(e * 2 + n.ph) : 1;
        ctx.globalAlpha = intro * glow * br;
        ctx.drawImage(spr[n.ci], n.x - 64, n.y - 64);
        ctx.globalAlpha = intro;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(4,16,40,0.85)"; ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, 6.29); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(n.x, n.y, R + 4, 0, 6.29); ctx.stroke();
        ctx.strokeStyle = KCOL[n.ci]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(n.x, n.y, R + 4, -Math.PI / 2, -Math.PI / 2 + 6.283 * m * intro); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 17px Consolas, monospace"; ctx.textAlign = "center";
        ctx.fillText(fmt(100 * m * intro, 1) + "%", n.x, n.y + 6);
        ctx.font = "15px Microsoft YaHei"; var tw = ctx.measureText(n.name).width;
        ctx.fillStyle = "rgba(4,16,40,0.8)"; ctx.fillRect(n.x - tw / 2 - 6, n.y + R + 9, tw + 12, 22);
        ctx.fillStyle = "#dbe9ff"; ctx.fillText(n.name, n.x, n.y + R + 25);
        ctx.globalCompositeOperation = "lighter";
      });
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.textAlign = "start";
    }
    if (!anim()) draw(0); else P9.anim("kg", draw);
    var tip = document.getElementById("kg-tip");
    cv.addEventListener("mousemove", function (ev) {
      var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width, y = (ev.clientY - r.top) * H / r.height, best = null, bd = 400;
      nodes.forEach(function (n) { var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y), lim = n.kind === "kc" ? 1600 : 100; if (d < lim && d < bd + (n.kind === "kc" ? 2000 : 0)) { bd = d; best = n; } });
      if (!best) { tip.style.display = "none"; return; }
      tip.style.display = "block"; tip.style.left = (best.x + 16) + "px"; tip.style.top = (best.y - 10) + "px";
      tip.innerHTML = best.kind === "kc" ? esc(best.name) + "：全校平均掌握 " + fmt(100 * best.mastery, 1) + "%，" + best.below + " 人低于 0.6" :
        esc(best.name) + "（" + esc(byId[best.kc].name) + "）：正确率 " + fmt(100 * best.rate, 1) + "%，作答 " + best.n + " 次";
    });
    cv.addEventListener("mouseleave", function () { tip.style.display = "none"; });
  }

  /* ------------------------------------------------------------------ ECharts */
  function base() {
    return { animation: anim(), animationDuration: 1400, animationEasing: "cubicOut", textStyle: { color: TXT, fontFamily: "Microsoft YaHei UI, Microsoft YaHei, sans-serif" } };
  }
  function lg(c1, c2) { return new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c1 }, { offset: 1, color: c2 }]); }
  function gradeChart() {
    var c = ec(document.getElementById("ec-grade")); if (!c) return;
    var G = D.school.grades;
    c.setOption(Object.assign(base(), {
      grid: { left: 34, right: 8, top: 26, bottom: 24 },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: TXT, fontSize: 13 } },
      xAxis: { type: "category", data: ["学业成绩", "作业质量", "知识掌握", "学习行为"], axisLine: { lineStyle: { color: "#2a4a78" } }, axisLabel: { color: TXT, fontSize: 13 } },
      yAxis: { type: "value", max: 100, splitNumber: 4, splitLine: { lineStyle: { color: "rgba(84,176,255,0.12)", type: "dashed" } }, axisLabel: { color: "#6f8db6" } },
      series: G.map(function (g, gi) {
        return { name: g.name, type: "bar", barWidth: 16, data: [g.academic, g.homework, g.mastery, g.behavior],
          itemStyle: { color: lg(GCOL[g.grade], "rgba(10,30,70,0.3)"), shadowBlur: 10, shadowColor: GCOL[g.grade] },
          label: { show: true, position: "top", color: "#dbe9ff", fontSize: 11, formatter: function (p) { return Math.round(p.value); } },
          animationDelay: function (i) { return 500 + i * 160 + gi * 120; } };
      }),
    }));
  }
  function gauge(el, val, max, text, col, delay) {
    var c = ec(el); if (!c) return;
    c.setOption(Object.assign(base(), { series: [{
      type: "gauge", startAngle: 220, endAngle: -40, min: 0, max: max, radius: "92%", center: ["50%", "55%"],
      progress: { show: true, width: 10, roundCap: true, itemStyle: { color: col, shadowBlur: 12, shadowColor: col } },
      axisLine: { lineStyle: { width: 10, color: [[1, "rgba(84,176,255,0.14)"]] } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false },
      anchor: { show: false }, title: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, "4%"], fontSize: 26, fontFamily: "Consolas, monospace", color: "#fff", formatter: text },
      data: [{ value: val }], animationDuration: 1800, animationDelay: delay,
    }] }));
  }
  function trendChart() {
    var c = ec(document.getElementById("ec-trend")); if (!c) return;
    var G = D.school.grades;
    c.setOption(Object.assign(base(), {
      animationDuration: 2200,
      grid: { left: 36, right: 12, top: 30, bottom: 26 },
      legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 6, textStyle: { color: TXT, fontSize: 13 } },
      tooltip: { trigger: "axis", backgroundColor: "rgba(4,14,34,0.92)", borderColor: "#3fe0ff", textStyle: { color: "#dbe9ff" } },
      xAxis: { type: "category", boundaryGap: false, data: P9.weekLabels(), axisLine: { lineStyle: { color: "#2a4a78" } }, axisLabel: { color: TXT, fontSize: 12 } },
      yAxis: { type: "value", min: 50, max: 65, interval: 5, splitLine: { lineStyle: { color: "rgba(84,176,255,0.12)", type: "dashed" } }, axisLabel: { color: "#6f8db6" } },
      series: G.map(function (g) {
        return { name: g.name, type: "line", smooth: true, symbol: "circle", symbolSize: 6, data: g.academic_trend,
          lineStyle: { width: 3, color: GCOL[g.grade], shadowBlur: 12, shadowColor: GCOL[g.grade] }, itemStyle: { color: GCOL[g.grade] },
          areaStyle: { color: lg(hexA(GCOL[g.grade], 0.28), "rgba(0,0,0,0)") } };
      }),
    }));
  }
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function privRing() {
    var c = ec(document.getElementById("ec-priv")); if (!c) return;
    var pv = SC.privacy;
    c.setOption(Object.assign(base(), {
      title: { text: pv.enabled + "/" + pv.total, left: "center", top: "38%", textStyle: { color: "#fff", fontSize: 30, fontFamily: "Consolas, monospace" },
        subtext: "项", subtextStyle: { color: TXT, fontSize: 13 }, itemGap: 2 },
      series: [{ type: "pie", radius: ["72%", "88%"], silent: true, label: { show: false }, startAngle: 90, animationDuration: 1800, animationDelay: 1200,
        data: pv.protections.map(function (p) { return { value: 1, name: p.name, itemStyle: { color: p.on ? "#4be3a5" : "rgba(255,107,107,0.55)", borderColor: "#06132d", borderWidth: 3 } }; }) },
      { type: "pie", radius: ["60%", "62%"], silent: true, label: { show: false }, data: [{ value: 1, itemStyle: { color: "rgba(63,224,255,0.4)" } }] }],
    }));
  }

  /* ------------------------------------------------------------------ 实时动态 */
  function ticker() {
    var box = document.getElementById("ticker"), ev = SC.events, i = 0, TC = { "练习": "#3fe0ff", "AI 评阅": "#ffc857", "教师复核": "#4be3a5", "模型": "#a58bff", "测验": "#6aa8ff", "隐私": "#4be3a5", "合规": "#ff9aa6" };
    function row(e) { return '<div class="ev"><span class="tm">' + esc(e.time) + '</span><span class="ty" style="color:' + (TC[e.type] || TXT) + '">' + esc(e.type) + '</span><span class="tx" title="' + esc(e.text) + '">' + esc(e.text) + "</span></div>"; }
    /* 时间顺序：最新的在最上面。合成事件的时间戳整体平移到“现在”（保留相互间隔），
       之后新滚入的事件用当前时间，所以从上到下始终是由新到旧。 */
    function mins(t) { var p = String(t).split(":"); return (+p[0]) * 60 + (+p[1]); }
    function hhmm(m) { m = ((m % 1440) + 1440) % 1440; var p = function (x) { return (x < 10 ? "0" : "") + x; }; return p(Math.floor(m / 60)) + ":" + p(m % 60); }
    var sorted = ev.slice().sort(function (a, b) { return mins(a.time) - mins(b.time); });
    var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), lastM = mins(sorted[sorted.length - 1].time);
    box.innerHTML = sorted.slice(-7).reverse().map(function (e) {
      return row({ type: e.type, text: e.text, time: hhmm(nowM - (lastM - mins(e.time))) });
    }).join("");
    document.getElementById("tick-n").textContent = ev.length + " 条";
    P9.every(function () {
      if (P9.hidden() || P9.isStatic()) return;
      var e = sorted[i % sorted.length]; i++;
      var d = document.createElement("div"); d.innerHTML = row({ type: e.type, text: e.text, time: nowStr().slice(0, 5) });
      box.insertBefore(d.firstChild, box.firstChild);
      while (box.children.length > 8) box.removeChild(box.lastChild);
    }, 2600);
  }

  /* ------------------------------------------------------------------ 访问审计 */
  function auditRender() {
    var box = document.getElementById("pv-audit");
    if (!box) return;
    box.innerHTML = S.audit.slice(0, 3).map(function (a) { return '<div class="' + (a.isNew ? "new" : "") + '"><span class="tm">' + esc(a.time) + "</span>" + esc(a.text) + "</div>"; }).join("");
  }
  function audit() {
    if (!S.audit.length) S.audit = SC.audit.slice().reverse().map(function (a) { return { time: a.time, text: a.text }; });
    auditRender();
    var k = 0;
    P9.every(function () {
      if (P9.hidden() || P9.isStatic()) return;
      var base = SC.audit[k % SC.audit.length]; k++;
      S.audit.unshift({ time: nowStr(true), text: base.text });
      S.audit = S.audit.slice(0, 30);
      auditRender();
    }, 3800);
  }
  function nowStr(withDate) {
    var d = new Date(), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return (withDate ? p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " : "") + p(d.getHours()) + ":" + p(d.getMinutes()) + (withDate ? "" : ":" + p(d.getSeconds()));
  }

  /* ------------------------------------------------------------------ 学生轮播（只用打码后的字段） */
  function avatar(c) {
    var r = mulberry(c.seed + 1), col = KCOL[c.seed % KCOL.length], col2 = KCOL[(c.seed + 3) % KCOL.length], sides = 5 + (c.seed % 3), b = "";
    for (var k = 0; k < 3; k++) {
      var R = 42 - k * 9, rot = r() * 6.28, pts = [];
      for (var i = 0; i < sides; i++) { var a = rot + i * 6.283 / sides; pts.push((46 + R * Math.cos(a)).toFixed(1) + "," + (46 + R * Math.sin(a)).toFixed(1)); }
      b += '<polygon points="' + pts.join(" ") + '" fill="none" stroke="' + (k % 2 ? col2 : col) + '" stroke-width="' + (2 - k * 0.4) + '" opacity="' + (0.9 - k * 0.2) + '"' +
        (anim() ? ' style="transform-origin:46px 46px;animation:spin ' + (14 + k * 6) + "s linear infinite" + (k % 2 ? " reverse" : "") + '"' : "") + "/>";
    }
    return '<svg class="car-av" viewBox="0 0 92 92"><defs><radialGradient id="avg"><stop offset="0" stop-color="' + col + '" stop-opacity="0.45"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="46" cy="46" r="44" fill="url(#avg)"/>' + b + '<text x="46" y="56" text-anchor="middle" font-size="30" font-weight="700" fill="#fff" style="filter:drop-shadow(0 0 6px ' + col + ')">' + esc(c.surname) + "</text></svg>";
  }
  var carCharts = {};
  function carHTML(c) {
    var n = SC.carousel.length;
    return '<div class="car-top">' + avatar(c) + '<div class="car-id"><div><span class="masked nm" data-masked="name">' + esc(c.mask_name) + "</span></div>" +
      '<div><span class="masked sd" data-masked="sid">学号 ' + esc(c.mask_sid) + '</span> <span class="blurline" style="width:70px"></span></div>' +
      '<div class="car-meta"><b>' + esc(c.class_name) + "</b>　知识掌握 <b>" + fmt(c.mastery_avg, 1) + "%</b>" + (c.consent_ok ? "" : '　<span style="color:#ff9aa6">监护人未同意 · AI 评阅关闭</span>') + "</div></div></div>" +
      '<div class="car-mid"><div><div class="car-lab">知识掌握雷达（BKT）</div><div class="car-ch" id="car-radar"></div></div><div>' +
      '<div class="car-lab">近期作业得分率 %</div><div class="car-small" id="car-hw"></div><div class="car-lab">成长趋势（周测得分率 %）</div><div class="car-small" id="car-gr"></div></div></div>' +
      '<div class="car-g"><span class="k">引导建议</span>' + (c.guidance ? esc(c.guidance.title) + ' <span class="conf c-' + c.guidance.confidence + '">可信度 ' + c.guidance.confidence + "</span>" : "暂无") + "</div>" +
      '<div class="car-foot"><span>' + (c.idx + 1) + " / " + n + '</span><div class="car-prog"><i class="' + (anim() ? "run" : "") + '"></i></div><span id="car-state">' + (S.paused ? "已暂停" : "5 秒切换") + "</span>" +
      '<button class="scr-btn" id="car-auth" title="演示：确认身份后写入访问审计">授权查看</button></div>';
  }
  function carCharts_(c) {
    Object.keys(carCharts).forEach(function (k) { if (carCharts[k]) { carCharts[k].dispose(); charts.splice(charts.indexOf(carCharts[k]), 1); } });
    carCharts = {};
    var kcs = D.meta.kcs, col = KCOL[c.seed % KCOL.length];
    var r = ec(document.getElementById("car-radar"));
    if (r) {
      r.setOption(Object.assign(base(), {
        radar: { radius: "54%", center: ["50%", "54%"], indicator: ["数与式", "方程", "函数", "图形性质", "图形变换", "统计概率"].map(function (k) { return { name: k, max: 1 }; }),
          axisName: { color: TXT, fontSize: 11 }, splitLine: { lineStyle: { color: "rgba(84,176,255,0.2)" } }, splitArea: { show: false }, axisLine: { lineStyle: { color: "rgba(84,176,255,0.2)" } } },
        series: [{ type: "radar", symbolSize: 4, data: [{ value: c.kc_mastery, areaStyle: { color: hexA(col, 0.3) }, lineStyle: { color: col, width: 2 }, itemStyle: { color: col } }] }],
      }));
      carCharts.r = r;
    }
    function small(id, data, x, colr, yMin) {
      var ch = ec(document.getElementById(id)); if (!ch) return null;
      ch.setOption(Object.assign(base(), {
        grid: { left: 30, right: 6, top: 8, bottom: 18 },
        xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { color: "#6f8db6", fontSize: 10 }, axisLine: { lineStyle: { color: "#2a4a78" } } },
        yAxis: { type: "value", min: yMin, max: 100, splitNumber: 2, axisLabel: { color: "#6f8db6", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(84,176,255,0.1)" } } },
        series: [{ type: "line", smooth: true, data: data, symbolSize: 4, lineStyle: { color: colr, width: 2, shadowBlur: 8, shadowColor: colr }, itemStyle: { color: colr },
          areaStyle: { color: lg(hexA(colr, 0.3), "rgba(0,0,0,0)") } }],
      }));
      return ch;
    }
    carCharts.h = c.homework.length ? small("car-hw", c.homework, c.homework_dates, "#ffc857", 0) : null;
    if (!c.homework.length) document.getElementById("car-hw").innerHTML = '<div class="note" style="padding-top:30px">无数据（监护人未同意）</div>';
    carCharts.g = small("car-gr", c.growth, ["期末", "1", "2", "3", "4", "5", "6"], col, 0);
  }
  function showCard(i, first) {
    var box = document.getElementById("car");
    if (!box) return;
    S.idx = i;
    var c = SC.carousel[i];
    function put() {
      box.innerHTML = carHTML(c);
      box.className = "car" + (anim() ? " car-in" : "");
      carCharts_(c);
      document.getElementById("car-auth").onclick = function () { openAuth(c); };
      S.elapsed = 0;
    }
    if (first || !anim()) { put(); return; }
    box.className = "car car-out";
    P9.later(put, 340);
  }
  function carousel() {
    var box = document.getElementById("car"), wrap = document.getElementById("sp-car");
    S.elapsed = 0; S.paused = false;
    showCard(S.idx % SC.carousel.length, true);
    wrap.addEventListener("mouseenter", function () { S.paused = true; wrap.classList.add("car-paused"); var s = document.getElementById("car-state"); if (s) s.textContent = "已暂停"; });
    wrap.addEventListener("mouseleave", function () { S.paused = false; wrap.classList.remove("car-paused"); var s = document.getElementById("car-state"); if (s) s.textContent = "5 秒切换"; });
    P9.every(function () {
      if (S.paused || P9.hidden() || document.querySelector(".auth-mask.show")) return;
      S.elapsed += 100;
      if (S.elapsed >= 5000) { S.elapsed = -400; S.switches++; showCard((S.idx + 1) % SC.carousel.length); }
    }, 100);
  }

  /* ------------------------------------------------------------------ 授权查看（演示用的身份确认 + 审计留痕） */
  function authBox() {
    return '<div class="auth-mask" id="auth-mask"><div class="auth-box"><h3>授权查看 · 身份确认（演示）</h3>' +
      '<p class="note" style="font-size:14px">查看个人学业档案需要确认身份。本演示不做真实认证，只演示“谁能看、看了留痕”。大屏上的卡片始终保持打码。</p>' +
      '<div id="auth-target" style="margin:8px 0 10px"></div>' +
      '<label><input type="radio" name="auth-role" value="teacher" checked> 王老师 · 初二(3)班 班主任（教师账号 + 动态口令）</label>' +
      '<label><input type="radio" name="auth-role" value="leader"> 校长办公室（学校领导账号）</label>' +
      '<label><input type="radio" name="auth-role" value="parent"> 学生家长（家长账号）</label>' +
      '<div class="scanbar" id="auth-scan"><i></i></div><div class="auth-res" id="auth-res"></div>' +
      '<div class="row2"><button class="scr-btn" id="auth-ok">确认身份</button><button class="scr-btn" id="auth-cancel">关闭</button></div></div></div>';
  }
  var authCur = null;
  function openAuth(c) {
    authCur = c;
    document.getElementById("auth-target").innerHTML = '申请查看：<span class="masked sd">' + esc(c.mask_name) + " · " + esc(c.mask_sid) + "</span> 的学业档案";
    var res = document.getElementById("auth-res"); res.className = "auth-res"; res.innerHTML = "";
    document.getElementById("auth-mask").classList.add("show");
  }
  function doAuth() {
    var role = (document.querySelector("input[name=auth-role]:checked") || {}).value, c = authCur;
    var scan = document.getElementById("auth-scan"), res = document.getElementById("auth-res");
    scan.style.display = "block"; res.className = "auth-res";
    P9.later(function () {
      scan.style.display = "none";
      var t = nowStr(true);
      if (role === "teacher") {
        S.audit.unshift({ time: t, text: "王老师（班主任） 查看了 " + c.mask_name + " 的学业档案 · 已记录", isNew: true });
        res.className = "auth-res ok";
        res.innerHTML = "身份已确认，访问已写入审计日志。大屏卡片保持打码；全名档案只在教师视图中显示。" +
          '<div style="margin-top:8px"><button class="scr-btn" id="auth-open">在教师视图中打开 →</button></div>';
        document.getElementById("auth-open").onclick = function () { var st = D.focal.students[c.idx]; P9.go("student/" + st.sid); };
      } else {
        var who = role === "leader" ? "校长办公室" : "学生家长";
        S.audit.unshift({ time: t, text: who + " 申请查看 " + c.mask_name + " 的学业档案 · 已拒绝 · 已记录", isNew: true });
        res.className = "auth-res no";
        res.textContent = role === "leader" ? "学校领导只能查看汇总统计，不能查看个人档案。本次申请已拒绝并记录。" : "家长请在家长端查看自己孩子的报告；大屏上不提供个人档案。本次申请已拒绝并记录。";
      }
      auditRender();
    }, anim() ? 1000 : 50);
  }

  /* ------------------------------------------------------------------ 时钟 */
  function clock() {
    var days = "日一二三四五六";
    function tick() {
      var d = new Date(), el = document.getElementById("scr-time");
      if (!el) return;
      el.textContent = nowStr(false);
      document.getElementById("scr-date").textContent = d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate() +
        " 周" + days[d.getDay()] + " · 学期第 " + weekNow() + " 周";
    }
    tick();
    P9.every(tick, 1000);
  }

  view.after = function () {
    S.entered = false;
    fit();
    window.addEventListener("resize", fit);
    P9.onLeave(function () {
      window.removeEventListener("resize", fit);
      charts.forEach(function (c) { try { c.dispose(); } catch (e) { /* 已释放 */ } });
      charts = []; carCharts = {};
    });
    document.querySelectorAll("[data-static-btn]").forEach(function (b) { b.classList.toggle("on", P9.isStatic()); b.onclick = function () { P9.toggleStatic(); }; });
    document.querySelectorAll("[data-tour-btn]").forEach(function (b) { b.classList.toggle("on", P9.isTouring()); b.onclick = P9.toggleTour; });
    document.getElementById("scr-help").onclick = P9.openHelp;
    document.getElementById("scr-exit").onclick = function () { document.getElementById("exit-btn").click(); };
    document.getElementById("auth-ok").onclick = doAuth;
    document.getElementById("auth-cancel").onclick = function () { document.getElementById("auth-mask").classList.remove("show"); };
    clock();
    bg();
    knowledgeGraph();
    // 图表依次入场（与面板入场延迟对齐）
    var st = anim();
    P9.later(gradeChart, st ? 300 : 0);
    P9.later(function () {
      var M = D.models;
      gauge(document.getElementById("ec-m1"), M.kt.auc.bkt.value, 1, function (v) { return v.toFixed(3); }, "#3fe0ff", 0);
      gauge(document.getElementById("ec-m2"), 100 * M.cdm.attribute_accuracy_mean, 100, function (v) { return v.toFixed(1) + "%"; }, "#a58bff", 200);
      gauge(document.getElementById("ec-m3"), 100 * S.red, 100, function (v) { return v.toFixed(1) + "%"; }, "#4be3a5", 400);
    }, st ? 700 : 0);
    P9.later(trendChart, st ? 600 : 0);
    P9.later(privRing, st ? 900 : 0);
    ticker();
    audit();
    carousel();
    P9.later(function () { S.entered = true; }, st ? 4200 : 0);
    S.show = function (i) { showCard(i, true); };  // 测试用：直接切到第 i 张卡片
  };
  P9.views.screen = view;
})();
