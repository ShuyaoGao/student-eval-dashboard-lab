/* 轻量 SVG 图表：全部返回 SVG 字符串，不依赖任何第三方库（file:// 下可用）。 */
(function () {
  "use strict";
  var NS = 'xmlns="http://www.w3.org/2000/svg"';
  var PAL = ["#3fe0ff", "#a58bff", "#ff6fae", "#ffc857", "#4be3a5", "#6aa8ff", "#ff8c5a"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmt(v, d) {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toFixed(d == null ? 0 : d);
  }
  function svg(w, h, body, cls) {
    // 最多放大到 1.5 倍，避免窄图在宽面板里被放得过大
    return '<svg ' + NS + ' class="chart ' + (cls || "") + '" viewBox="0 0 ' + w + " " + h +
      '" style="max-width:' + Math.round(w * 1.5) + 'px" preserveAspectRatio="xMidYMid meet" role="img">' + body + "</svg>";
  }
  function scale(d0, d1, r0, r1) {
    return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); };
  }
  function ticks(lo, hi, n) {
    var step = (hi - lo) / n, out = [];
    for (var i = 0; i <= n; i++) out.push(lo + step * i);
    return out;
  }

  /* 雷达图：axes=[{label}], series=[{label,color,values,dash}] 值域 0–max */
  function radar(axes, series, opt) {
    opt = opt || {};
    var W = opt.w || 420, H = opt.h || 360, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 58, max = opt.max || 100;
    var n = axes.length, b = "";
    function pt(i, v) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * Math.max(0, Math.min(1, (v || 0) / max));
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var ps = axes.map(function (_, i) { return pt(i, f * max).join(","); }).join(" ");
      b += '<polygon points="' + ps + '" class="rd-grid"/>';
    });
    axes.forEach(function (ax, i) {
      var p = pt(i, max), l = pt(i, max * 1.2);
      b += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" class="rd-axis"/>';
      var anchor = Math.abs(l[0] - cx) < 8 ? "middle" : (l[0] > cx ? "start" : "end");
      b += '<text x="' + l[0] + '" y="' + (l[1] + 4) + '" text-anchor="' + anchor + '" class="rd-label">' + esc(ax.label) + "</text>";
    });
    series.forEach(function (s, si) {
      var col = s.color || PAL[si];
      var ps = s.values.map(function (v, i) { return pt(i, v == null ? 0 : v).join(","); }).join(" ");
      b += '<polygon points="' + ps + '" fill="' + col + '" fill-opacity="' + (s.fill == null ? 0.18 : s.fill) + '" stroke="' + col +
        '" stroke-width="2" ' + (s.dash ? 'stroke-dasharray="5 4"' : "") + ' class="rd-poly"/>';
      s.values.forEach(function (v, i) {
        if (v == null) return;
        var p = pt(i, v);
        b += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="' + col + '"><title>' + esc(axes[i].label + "：" + fmt(v, 1)) + "</title></circle>";
      });
    });
    return svg(W, H, b, "radar");
  }

  /* 折线图：x=[label], series=[{label,color,values,band:[[lo,hi]...],dash,width}] */
  function line(x, series, opt) {
    opt = opt || {};
    var W = opt.w || 560, H = opt.h || 240, L = opt.left || 44, Rr = opt.right || 14, T = opt.top || 16, B = opt.bottom || 30;
    var all = [];
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (v != null) all.push(v); });
      (s.band || []).forEach(function (bd) { if (bd) { all.push(bd[0]); all.push(bd[1]); } });
    });
    var lo = opt.yMin != null ? opt.yMin : Math.min.apply(null, all), hi = opt.yMax != null ? opt.yMax : Math.max.apply(null, all);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var nT = opt.yTicks || 4;
    if (opt.yMin == null && opt.yMax == null && hi - lo > 2) {
      // 自动范围取整：刻度落在整数上
      var stp = Math.ceil((hi - lo) / nT);
      lo = Math.floor(lo / stp) * stp;
      hi = lo + stp * nT;
      while (hi < Math.max.apply(null, all)) { hi += stp; nT++; }
    }
    var sx = scale(0, Math.max(1, x.length - 1), L, W - Rr), sy = scale(lo, hi, H - B, T), b = "";
    var tks = ticks(lo, hi, nT), dec = 0;
    // 自动选择刻度的小数位，保证每个刻度都显示准确（例如 0.25 不会显示成 0.3）
    while (dec < 3 && tks.some(function (t) { return Math.abs(t * Math.pow(10, dec) - Math.round(t * Math.pow(10, dec))) > 1e-6; })) dec++;
    dec = Math.max(dec, opt.yDec || 0);
    tks.forEach(function (t) {
      b += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(t) + '" y2="' + sy(t) + '" class="grid"/>';
      b += '<text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end" class="tick">' + fmt(t, dec) + (opt.ySuffix || "") + "</text>";
    });
    var every = Math.max(1, Math.ceil(x.length / (opt.maxXLabels || 8)));
    x.forEach(function (lab, i) {
      if (i % every && i !== x.length - 1) return;
      b += '<text x="' + sx(i) + '" y="' + (H - B + 18) + '" text-anchor="middle" class="tick">' + esc(lab) + "</text>";
    });
    (opt.marks || []).forEach(function (m) {
      b += '<line x1="' + sx(m.i) + '" x2="' + sx(m.i) + '" y1="' + T + '" y2="' + (H - B) + '" class="mark"/>' +
        '<text x="' + (sx(m.i) + 4) + '" y="' + (T + 10) + '" class="mark-t">' + esc(m.label) + "</text>";
    });
    series.forEach(function (s, si) {
      var col = s.color || PAL[si % PAL.length];
      if (s.band) {
        var up = [], dn = [];
        s.band.forEach(function (bd, i) { if (bd) { up.push(sx(i) + "," + sy(bd[1])); dn.unshift(sx(i) + "," + sy(bd[0])); } });
        b += '<polygon points="' + up.concat(dn).join(" ") + '" fill="' + col + '" fill-opacity="0.16" stroke="none"/>';
      }
      var d = "", started = false;
      s.values.forEach(function (v, i) {
        if (v == null) { started = false; return; }
        d += (started ? "L" : "M") + sx(i).toFixed(1) + "," + sy(v).toFixed(1);
        started = true;
      });
      b += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (s.width || 2.2) + '" ' +
        (s.dash ? 'stroke-dasharray="' + s.dash + '"' : "") + ' class="ln"/>';
      if (s.dots !== false) s.values.forEach(function (v, i) {
        if (v == null) return;
        b += '<circle cx="' + sx(i) + '" cy="' + sy(v) + '" r="' + (s.r || 2.6) + '" fill="' + col + '"><title>' + esc((s.label || "") + " " + x[i] + "：" + fmt(v, opt.tipDec == null ? 1 : opt.tipDec)) + "</title></circle>";
      });
    });
    return svg(W, H, b, "line");
  }

  /* 横向条形：rows=[{label,value,color,note}] */
  function hbars(rows, opt) {
    opt = opt || {};
    var W = opt.w || 520, rowH = opt.rowH || 26, L = opt.left || 150, Rr = opt.right || 56, T = 6;
    var H = T * 2 + rows.length * rowH, max = opt.max || Math.max.apply(null, rows.map(function (r) { return r.value || 0; }));
    var sx = scale(0, max, L, W - Rr), b = "";
    rows.forEach(function (r, i) {
      var y = T + i * rowH, col = r.color || PAL[0];
      b += '<text x="' + (L - 8) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" class="lab">' + esc(r.label) + "</text>";
      b += '<rect x="' + L + '" y="' + (y + 5) + '" width="' + (W - Rr - L) + '" height="' + (rowH - 10) + '" class="track"/>';
      b += '<rect x="' + L + '" y="' + (y + 5) + '" width="' + Math.max(0, sx(r.value || 0) - L) + '" height="' + (rowH - 10) +
        '" fill="' + col + '" class="bar" rx="2"><title>' + esc(r.label + "：" + (r.text || fmt(r.value, opt.dec))) + "</title></rect>";
      b += '<text x="' + (W - Rr + 6) + '" y="' + (y + rowH / 2 + 4) + '" class="val">' + esc(r.text != null ? r.text : fmt(r.value, opt.dec) + (opt.suffix || "")) + "</text>";
    });
    return svg(W, H, b, "hbars");
  }

  /* 分组柱状：groups=[label], series=[{label,color,values}] */
  function gbars(groups, series, opt) {
    opt = opt || {};
    var W = opt.w || 560, H = opt.h || 240, L = 40, Rr = 10, T = 16, B = 30;
    var lo = opt.yMin != null ? opt.yMin : 0, hi = opt.yMax || 100;
    var sy = scale(lo, hi, H - B, T), gw = (W - L - Rr) / groups.length, bw = Math.min(26, gw * 0.8 / series.length), b = "";
    ticks(lo, hi, 4).forEach(function (t) {
      b += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(t) + '" y2="' + sy(t) + '" class="grid"/>' +
        '<text x="' + (L - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end" class="tick">' + fmt(t) + "</text>";
    });
    groups.forEach(function (g, gi) {
      var x0 = L + gi * gw + (gw - bw * series.length) / 2;
      series.forEach(function (s, si) {
        var v = s.values[gi];
        if (v == null) return;
        var col = s.color || PAL[si];
        b += '<rect x="' + (x0 + si * bw) + '" y="' + sy(v) + '" width="' + (bw - 2) + '" height="' + Math.max(0, sy(lo) - sy(v)) +
          '" fill="' + col + '" class="bar" rx="2"><title>' + esc(g + " · " + s.label + "：" + fmt(v, 1)) + "</title></rect>";
        if (opt.values) b += '<text x="' + (x0 + si * bw + bw / 2 - 1) + '" y="' + (sy(v) - 4) + '" text-anchor="middle" class="val-s">' + fmt(v, opt.dec || 0) + "</text>";
      });
      b += '<text x="' + (L + gi * gw + gw / 2) + '" y="' + (H - B + 18) + '" text-anchor="middle" class="tick">' + esc(g) + "</text>";
    });
    return svg(W, H, b, "gbars");
  }

  /* 热力格：rows×cols，值 0–1 或自定义范围 */
  function heat(mat, rowLabels, colLabels, opt) {
    opt = opt || {};
    var cw = opt.cw || 46, ch = opt.ch || 26, L = opt.left || 110, T = opt.top || 28;
    var W = L + cw * colLabels.length + 6, H = T + ch * rowLabels.length + 6, lo = opt.min == null ? 0 : opt.min, hi = opt.max == null ? 1 : opt.max, b = "";
    colLabels.forEach(function (c, j) {
      b += '<text x="' + (L + j * cw + cw / 2) + '" y="' + (T - 9) + '" text-anchor="middle" class="tick">' + esc(c) + "</text>";
    });
    rowLabels.forEach(function (r, i) {
      b += '<text x="' + (L - 8) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end" class="lab">' + esc(r) + "</text>";
      colLabels.forEach(function (_, j) {
        var v = mat[i][j], f = v == null ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        var col = v == null ? "rgba(255,255,255,0.04)" : (opt.color ? opt.color(f, v) : heatColor(f));
        b += '<rect x="' + (L + j * cw + 1) + '" y="' + (T + i * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="3" fill="' + col + '"><title>' +
          esc(r + " · " + colLabels[j] + "：" + (v == null ? "—" : (opt.cellText ? opt.cellText[i][j] : fmt(v, opt.dec == null ? 2 : opt.dec)))) + "</title></rect>";
        if (opt.text !== false && v != null) b += '<text x="' + (L + j * cw + cw / 2) + '" y="' + (T + i * ch + ch / 2 + 4) +
          '" text-anchor="middle" class="cell-t' + (f > 0.62 ? " dark" : "") + '">' + esc(opt.cellText ? opt.cellText[i][j] : (opt.fmtCell ? opt.fmtCell(v) : fmt(v, opt.dec == null ? 2 : opt.dec))) + "</text>";
      });
    });
    return svg(W, H, b, "heat");
  }
  function heatColor(f) {
    // 深蓝 → 青 → 亮青白
    var r = Math.round(18 + f * (120 - 18)), g = Math.round(40 + f * (235 - 40)), bl = Math.round(90 + f * (255 - 90));
    return "rgba(" + r + "," + g + "," + bl + "," + (0.25 + 0.75 * f).toFixed(2) + ")";
  }

  /* 森林图：rows=[{label,or,lo,hi,k,note}]，对数轴 */
  function forest(rows, opt) {
    opt = opt || {};
    var W = opt.w || 580, rowH = 24, L = opt.left || 150, Rr = 120, T = 26, B = 30, H = T + rows.length * rowH + B;
    var lo = Math.log(opt.min || 0.5), hi = Math.log(opt.max || 4.5), sx = scale(lo, hi, L, W - Rr), b = "";
    [0.5, 0.75, 1, 1.5, 2, 3, 4].forEach(function (t) {
      if (Math.log(t) < lo || Math.log(t) > hi) return;
      b += '<line x1="' + sx(Math.log(t)) + '" x2="' + sx(Math.log(t)) + '" y1="' + T + '" y2="' + (H - B) + '" class="' + (t === 1 ? "ref" : "grid") + '"/>' +
        '<text x="' + sx(Math.log(t)) + '" y="' + (H - B + 16) + '" text-anchor="middle" class="tick">' + t + "</text>";
    });
    b += '<text x="' + ((L + W - Rr) / 2) + '" y="' + (H - 2) + '" text-anchor="middle" class="axis-t">比值比 OR（对数轴，1 = 无关联）</text>';
    b += '<text x="' + (W - Rr + 8) + '" y="' + (T - 10) + '" class="axis-t">OR（95%CI）· k</text>';
    rows.forEach(function (r, i) {
      var y = T + i * rowH + rowH / 2, cross = r.lo <= 1 && r.hi >= 1, col = cross ? "#7f98bf" : (r.color || "#3fe0ff");
      b += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="lab">' + esc(r.label) + "</text>";
      b += '<line x1="' + sx(Math.log(Math.max(r.lo, opt.min || 0.5))) + '" x2="' + sx(Math.log(Math.min(r.hi, opt.max || 4.5))) + '" y1="' + y + '" y2="' + y + '" stroke="' + col + '" stroke-width="2"/>';
      var s = 5 + Math.min(4, (r.k || 1));
      b += '<rect x="' + (sx(Math.log(r.or)) - s / 2) + '" y="' + (y - s / 2) + '" width="' + s + '" height="' + s + '" fill="' + col + '"><title>' +
        esc(r.label + "：OR " + fmt(r.or, 2) + "（" + fmt(r.lo, 2) + "–" + fmt(r.hi, 2) + "），k=" + r.k + (r.note ? "；" + r.note : "")) + "</title></rect>";
      b += '<text x="' + (W - Rr + 8) + '" y="' + (y + 4) + '" class="val-s">' + fmt(r.or, 2) + "（" + fmt(r.lo, 2) + "–" + fmt(r.hi, 2) + "）· " + r.k + "</text>";
    });
    return svg(W, H, b, "forest");
  }

  /* 环形进度 */
  function ring(v, max, label, opt) {
    opt = opt || {};
    var S = opt.size || 120, r = S / 2 - 10, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / max)), col = opt.color || PAL[0];
    var b = '<circle cx="' + S / 2 + '" cy="' + S / 2 + '" r="' + r + '" class="ring-track"/>' +
      '<circle cx="' + S / 2 + '" cy="' + S / 2 + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' +
      (c * f).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 ' + S / 2 + " " + S / 2 + ')" class="ring-arc"/>' +
      '<text x="' + S / 2 + '" y="' + (S / 2 + 2) + '" text-anchor="middle" class="ring-v">' + esc(opt.text || fmt(v, opt.dec || 0)) + "</text>" +
      '<text x="' + S / 2 + '" y="' + (S / 2 + 20) + '" text-anchor="middle" class="ring-l">' + esc(label || "") + "</text>";
    return svg(S, S, b, "ring");
  }

  /* 华夫格：100 格，parts=[{n,color,label}] */
  function waffle(parts, opt) {
    opt = opt || {};
    var cell = 18, gap = 3, cols = 10, W = cols * (cell + gap), H = 10 * (cell + gap), b = "", k = 0;
    parts.forEach(function (p) {
      for (var i = 0; i < p.n && k < 100; i++, k++) {
        var x = (k % cols) * (cell + gap), y = Math.floor(k / cols) * (cell + gap);
        b += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="3" fill="' + p.color + '"><title>' + esc(p.label) + "</title></rect>";
      }
    });
    return svg(W, H, b, "waffle");
  }

  function spark(values, opt) {
    opt = opt || {};
    var W = opt.w || 120, H = opt.h || 30, lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var sx = scale(0, values.length - 1, 2, W - 2), sy = scale(lo, hi === lo ? lo + 1 : hi, H - 3, 3);
    var d = values.map(function (v, i) { return (i ? "L" : "M") + sx(i).toFixed(1) + "," + sy(v).toFixed(1); }).join("");
    return svg(W, H, '<path d="' + d + '" fill="none" stroke="' + (opt.color || PAL[0]) + '" stroke-width="1.8"/>', "spark");
  }

  window.Charts = { radar: radar, line: line, hbars: hbars, gbars: gbars, heat: heat, heatColor: heatColor, forest: forest,
    ring: ring, waffle: waffle, spark: spark, esc: esc, fmt: fmt, PAL: PAL };
})();
