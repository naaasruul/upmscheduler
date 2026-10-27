// Lukis jadual ke <canvas> pada saiz pixel tepat. computeLayout() tulen (boleh diuji tanpa canvas).

export const SIZES = {
  iphone: [1179, 2556], // iPhone 15/16 Pro, @3x
  ipad: [2048, 2732], //   iPad Pro 12.9", @2x
};

export function canvasSize(device, orientation) {
  const [w, h] = SIZES[device];
  return orientation === "landscape" ? [h, w] : [w, h];
}

// Zon selamat dalam pecahan saiz: ruang atas dikosongkan untuk jam lockscreen,
// bawah untuk butang lampu suluh/kamera. iPhone landscape tiada lockscreen.
const SAFE = {
  "iphone-portrait": { top: 0.3, bottom: 0.1, side: 0.055, title: 0.075 },
  "iphone-landscape": { top: 0.06, bottom: 0.07, side: 0.05, title: 0.13 },
  "ipad-portrait": { top: 0.25, bottom: 0.06, side: 0.07, title: 0.065 },
  "ipad-landscape": { top: 0.22, bottom: 0.06, side: 0.1, title: 0.085 },
};

export function deviceClass(w, h) {
  const portrait = h >= w;
  const ratio = Math.max(w, h) / Math.min(w, h);
  return `${ratio > 1.6 ? "iphone" : "ipad"}-${portrait ? "portrait" : "landscape"}`;
}

export function computeLayout(model, w, h) {
  const safe = SAFE[deviceClass(w, h)];
  const items = model.items;

  const days = [1, 2, 3, 4, 5];
  for (const d of [6, 7]) if (items.some((i) => i.day === d)) days.push(d);

  let startH = items.length ? Math.floor(Math.min(...items.map((i) => i.start)) / 60) : 8;
  let endH = items.length ? Math.ceil(Math.max(...items.map((i) => i.end)) / 60) : 17;
  if (endH - startH < 6) endH = Math.min(24, startH + 6);

  const u = Math.min(w, h) / 100;
  const titleTop = h * safe.top;
  const titleH = h * safe.title;
  const footerH = 4.5 * u;
  const grid = {
    x: w * safe.side,
    y: titleTop + titleH,
    w: w * (1 - 2 * safe.side),
    h: h * (1 - safe.bottom) - footerH - (titleTop + titleH),
  };
  const hourW = grid.w * (w > h ? 0.07 : 0.1);
  const headH = Math.max(5 * u, grid.h * 0.045);
  const colW = (grid.w - hourW) / days.length;
  const rowH = (grid.h - headH) / (endH - startH);
  const gap = 0.7 * u;

  const blocks = [];
  for (const [di, d] of days.entries()) {
    const dayItems = items.filter((i) => i.day === d).sort((a, b) => a.start - b.start || b.end - a.end);
    // Kumpulan blok bertindih dibahagi lorong supaya pertindihan nampak, bukan tertutup.
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const lanes = [];
      for (const it of cluster) {
        let lane = lanes.findIndex((end) => end <= it.start);
        if (lane < 0) lane = lanes.push(0) - 1;
        lanes[lane] = it.end;
        it._lane = lane;
      }
      for (const it of cluster) {
        const lw = (colW - gap) / lanes.length;
        blocks.push({
          item: it,
          x: grid.x + hourW + di * colW + gap / 2 + it._lane * lw,
          y: grid.y + headH + ((it.start / 60 - startH) * rowH) + gap / 2,
          w: lw - (lanes.length > 1 ? gap / 2 : 0),
          h: ((it.end - it.start) / 60) * rowH - gap,
          clash: lanes.length > 1,
        });
        delete it._lane;
      }
      cluster = [];
    };
    for (const it of dayItems) {
      if (it.start >= clusterEnd && cluster.length) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    }
    if (cluster.length) flush();
  }

  return { w, h, u, safe, days, startH, endH, grid, hourW, headH, colW, rowH, titleTop, titleH, footerH, blocks };
}

// ---------------------------------------------------------------- tema

const DAY_LONG = ["", "isnin", "selasa", "rabu", "khamis", "jumaat", "sabtu", "ahad"];
const DAY_SHORT = ["", "ISN", "SEL", "RAB", "KHA", "JUM", "SAB", "AHD"];

export const THEMES = {
  comel: {
    label: "Comel",
    bg: "#fbf1e1",
    ink: "#3a1f14",
    line: "rgba(58, 31, 20, 0.13)",
    block: () => "#4a2f24",
    blockText: "#d6e4ff",
    blockSub: "rgba(214, 228, 255, 0.72)",
    script: true,
    dots: "#3a1f14",
  },
  gelap: {
    label: "Gelap",
    bg: "#0d1015",
    ink: "#e8ecf2",
    line: "rgba(232, 236, 242, 0.08)",
    block: (i) => ["#364fc7", "#0b7285", "#2b8a3e", "#c2410c", "#a61e4d", "#5f3dc4", "#1864ab", "#862e9c"][i % 8],
    blockText: "#ffffff",
    blockSub: "rgba(255, 255, 255, 0.78)",
    script: false,
  },
};

const SANS = "Inter, system-ui, sans-serif";
const SCRIPT = "Sacramento, cursive";

function font(ctx, weight, px, family) {
  ctx.font = `${weight} ${Math.round(px)}px ${family}`;
}

// Kecilkan saiz font sampai muat; kalau masih tak muat, potong dengan '…'.
function fitText(ctx, str, maxW, px, minPx, weight, family) {
  let size = px;
  font(ctx, weight, size, family);
  while (size > minPx && ctx.measureText(str).width > maxW) {
    size -= 1;
    font(ctx, weight, size, family);
  }
  let s = str;
  while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -1);
  return { text: s === str ? s : s.slice(0, -1) + "…", size };
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDots(ctx, L, color) {
  const rand = mulberry32(7);
  const r = 3.3 * L.u;
  const keepOut = { x: L.grid.x - r, y: L.titleTop - r, w: L.grid.w + 2 * r, h: L.h * (1 - L.safe.bottom) - L.titleTop + 2 * r };
  const placed = [];
  ctx.fillStyle = color;
  for (let tries = 0; tries < 400 && placed.length < 16; tries++) {
    const x = rand() * L.w, y = rand() * L.h;
    const inside = x > keepOut.x - r && x < keepOut.x + keepOut.w + r && y > keepOut.y - r && y < keepOut.y + keepOut.h + r;
    if (inside || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 7 * r)) continue;
    placed.push([x, y]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render(ctx, model, opts) {
  const { w, h } = { w: ctx.canvas.width, h: ctx.canvas.height };
  const theme = THEMES[opts.theme] || THEMES.comel;
  const L = computeLayout(model, w, h);
  const { u, grid } = L;

  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  if (theme.dots) drawDots(ctx, L, theme.dots);

  // Tajuk
  ctx.fillStyle = theme.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = opts.title || "jadual kelas";
  if (theme.script) {
    const t = fitText(ctx, title, grid.w, L.titleH * 0.85, 10, 400, SCRIPT);
    font(ctx, 400, t.size, SCRIPT);
    ctx.fillText(t.text, w / 2, L.titleTop + L.titleH * 0.42);
  } else {
    const t = fitText(ctx, title.toUpperCase(), grid.w, L.titleH * 0.36, 10, 800, SANS);
    font(ctx, 800, t.size, SANS);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(t.size * 0.12)}px`;
    ctx.fillText(t.text, w / 2, L.titleTop + L.titleH * 0.42);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  // Hari
  const gx = grid.x + L.hourW;
  for (const [i, d] of L.days.entries()) {
    const cx = gx + (i + 0.5) * L.colW;
    if (theme.script) {
      const t = fitText(ctx, DAY_LONG[d], L.colW * 0.92, L.headH * 0.8, 8, 400, SCRIPT);
      font(ctx, 400, t.size, SCRIPT);
      ctx.fillText(t.text, cx, grid.y + L.headH * 0.45);
    } else {
      font(ctx, 700, Math.min(L.headH * 0.42, L.colW * 0.2), SANS);
      ctx.globalAlpha = 0.6;
      ctx.fillText(DAY_SHORT[d], cx, grid.y + L.headH * 0.45);
      ctx.globalAlpha = 1;
    }
  }

  // Garis jam + label
  const lineW = Math.max(1, 0.18 * u);
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1.5, 0.28 * u);
  ctx.beginPath();
  ctx.moveTo(grid.x, grid.y + L.headH);
  ctx.lineTo(grid.x + grid.w, grid.y + L.headH);
  ctx.moveTo(gx, grid.y + L.headH);
  ctx.lineTo(gx, grid.y + grid.h);
  ctx.stroke();
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = lineW;
  const labelMaxW = L.hourW - 1.4 * u;
  for (let hr = L.startH; hr <= L.endH; hr++) {
    const y = grid.y + L.headH + (hr - L.startH) * L.rowH;
    if (hr > L.startH) {
      ctx.beginPath();
      ctx.moveTo(grid.x, y);
      ctx.lineTo(grid.x + grid.w, y);
      ctx.stroke();
    }
    if (hr === L.endH) continue;
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.globalAlpha = theme.script ? 0.85 : 0.5;
    // Saiz label ditetapkan dari "22.00" (paling lebar) supaya semua label sama besar.
    if (theme.script) {
      const t = fitText(ctx, "22.00", labelMaxW, Math.min(L.rowH * 0.34, 4.2 * u), 6, 400, SCRIPT);
      font(ctx, 400, t.size, SCRIPT);
      ctx.fillText(`${hr}.00`, grid.x + 0.3 * u, y + 0.5 * u);
    } else {
      const t = fitText(ctx, "22", labelMaxW, Math.min(L.rowH * 0.26, 2.6 * u), 6, 600, SANS);
      font(ctx, 600, t.size, SANS);
      ctx.fillText(String(hr).padStart(2, "0"), grid.x + 0.3 * u, y + 0.7 * u);
    }
    ctx.globalAlpha = 1;
  }

  // Blok kelas
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const b of L.blocks) {
    const sub = model.subjects[b.item.subject];
    const r = Math.min(1.6 * u, b.w * 0.12);
    ctx.fillStyle = theme.block(sub.color);
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, r);
    ctx.fill();
    if (b.clash) {
      ctx.strokeStyle = "#f59f00";
      ctx.lineWidth = 0.5 * u;
      ctx.stroke();
    }
    const pad = Math.min(1.2 * u, b.w * 0.08);
    const innerW = b.w - 2 * pad;
    // Baris kecil: tempat, kemudian "AMALI" kalau amali. Kecilkan teks dulu sebelum buang
    // maklumat; tempat cuma digugurkan kalau blok terlalu pendek untuk dibaca langsung.
    const extra = [b.item.venue, b.item.kind === "amali" ? "AMALI" : ""].filter(Boolean);
    const avail = b.h - 2 * Math.min(0.6 * u, b.h * 0.08);
    let mainPx = Math.min(L.rowH * 0.36, b.w * 0.24, 6 * u);
    let subPx = Math.max(mainPx * 0.52, 1.4 * u);
    let lines = extra;
    const need = () => mainPx * 1.1 + lines.length * subPx * 1.2;
    if (need() > avail && lines.length > 1) lines = [extra.join(" · ")];
    if (need() > avail) {
      const k = avail / need();
      mainPx *= k;
      subPx *= k;
    }
    if (subPx < 0.9 * u) lines = [];
    const main = fitText(ctx, sub.short, innerW, mainPx, 6, 800, SANS);
    const blockH = main.size * 1.1 + lines.length * subPx * 1.2;
    let y = b.y + (b.h - blockH) / 2 + main.size * 0.6;
    ctx.fillStyle = theme.blockText;
    font(ctx, 800, main.size, SANS);
    ctx.fillText(main.text, b.x + b.w / 2, y);
    y += main.size * 0.55 + subPx * 0.6;
    ctx.fillStyle = theme.blockSub;
    for (const line of lines) {
      const s = fitText(ctx, line, innerW, subPx, 5, line === "AMALI" ? 700 : 500, SANS);
      font(ctx, line === "AMALI" ? 700 : 500, s.size, SANS);
      ctx.fillText(s.text, b.x + b.w / 2, y);
      y += subPx * 1.2;
    }
  }

  // Kaki
  if (opts.footer) {
    ctx.fillStyle = theme.ink;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = grid.y + grid.h + L.footerH * 0.6;
    font(ctx, 600, Math.min(L.footerH * 0.42, 2 * u), SANS);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(0.25 * u)}px`;
    ctx.fillText(opts.footer.toUpperCase(), w / 2, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return L;
}
