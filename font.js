// Single-line stroke font and message layout (port of foragingagents/analysis/fomo_message_layout.m).
// Glyphs live in a box 1 high; layout() places them in arena metres (text area x 0.15-2.10, y 0.06-0.44).
(function () {
  function arc(cx, cy, rx, ry, a0, a1) {
    const n = Math.max(8, Math.round(Math.abs(a1 - a0) / 8));
    const P = [];
    for (let i = 0; i < n; i++) {
      const t = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180;
      P.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return P;
  }
  const dot = (x) => arc(x, 0.04, 0.035, 0.04, 0, 360);
  const cat = (...parts) => [].concat(...parts);

  function glyph(c) {
    switch (c) {
      case ' ': return [0.45, []];
      case 'A': return [0.8, [[[0, 0], [0.4, 1], [0.8, 0]], [[0.18, 0.45], [0.62, 0.45]]]];
      case 'B': return [0.65, [cat([[0, 0], [0, 1], [0.38, 1]], arc(0.38, 0.76, 0.22, 0.24, 90, -90), [[0, 0.52], [0.42, 0.52]], arc(0.42, 0.26, 0.24, 0.26, 90, -90), [[0, 0]])]];
      case 'C': return [0.75, [arc(0.45, 0.5, 0.42, 0.5, 45, 315)]];
      case 'D': return [0.7, [cat([[0, 0], [0, 1], [0.25, 1]], arc(0.25, 0.5, 0.45, 0.5, 90, -90), [[0, 0]])]];
      case 'E': return [0.65, [[[0.65, 1], [0, 1], [0, 0], [0.65, 0]], [[0, 0.5], [0.5, 0.5]]]];
      case 'F': return [0.6, [[[0.6, 1], [0, 1], [0, 0]], [[0, 0.5], [0.45, 0.5]]]];
      case 'G': return [0.8, [cat(arc(0.45, 0.5, 0.42, 0.5, 45, 345), [[0.87, 0.45], [0.55, 0.45]])]];
      case 'H': return [0.7, [[[0, 0], [0, 1]], [[0.7, 1], [0.7, 0]], [[0, 0.5], [0.7, 0.5]]]];
      case 'I': return [0.3, [[[0.15, 1], [0.15, 0]]]];
      case 'J': return [0.6, [cat([[0.55, 1], [0.55, 0.28]], arc(0.3, 0.28, 0.25, 0.28, 0, -180))]];
      case 'K': return [0.65, [[[0, 0], [0, 1]], [[0.62, 1], [0, 0.42], [0.65, 0]]]];
      case 'L': return [0.6, [[[0, 1], [0, 0], [0.6, 0]]]];
      case 'M': return [0.9, [[[0, 0], [0, 1], [0.45, 0.4], [0.9, 1], [0.9, 0]]]];
      case 'N': return [0.75, [[[0, 0], [0, 1], [0.75, 0], [0.75, 1]]]];
      case 'O': return [0.8, [arc(0.4, 0.5, 0.4, 0.5, 90, 450)]];
      case 'P': return [0.65, [cat([[0, 0], [0, 1], [0.42, 1]], arc(0.42, 0.75, 0.23, 0.25, 90, -90), [[0, 0.5]])]];
      case 'Q': return [0.8, [arc(0.4, 0.5, 0.4, 0.5, 90, 450), [[0.5, 0.25], [0.85, -0.05]]]];
      case 'R': return [0.65, [cat([[0, 0], [0, 1], [0.42, 1]], arc(0.42, 0.75, 0.23, 0.25, 90, -90), [[0, 0.5]]), [[0.3, 0.5], [0.65, 0]]]];
      case 'S': return [0.65, [cat(arc(0.33, 0.75, 0.3, 0.25, 20, 270), arc(0.33, 0.25, 0.3, 0.25, 90, -160))]];
      case 'T': return [0.7, [[[0, 1], [0.7, 1]], [[0.35, 1], [0.35, 0]]]];
      case 'U': return [0.7, [cat([[0, 1]], arc(0.35, 0.32, 0.35, 0.32, 180, 360), [[0.7, 1]])]];
      case 'V': return [0.75, [[[0, 1], [0.375, 0], [0.75, 1]]]];
      case 'W': return [1.1, [[[0, 1], [0.25, 0], [0.55, 0.65], [0.85, 0], [1.1, 1]]]];
      case 'X': return [0.7, [[[0, 1], [0.7, 0]], [[0.7, 1], [0, 0]]]];
      case 'Y': return [0.8, [[[0, 1], [0.4, 0.5], [0.8, 1]], [[0.4, 0.5], [0.4, 0]]]];
      case 'Z': return [0.7, [[[0, 1], [0.7, 1], [0, 0], [0.7, 0]]]];
      case '0': return [0.6, [arc(0.3, 0.5, 0.3, 0.5, 90, 450)]];
      case '1': return [0.4, [[[0.05, 0.8], [0.3, 1], [0.3, 0]]]];
      case '2': return [0.6, [cat(arc(0.3, 0.7, 0.28, 0.3, 160, -20), [[0, 0], [0.62, 0]])]];
      case '3': return [0.6, [cat(arc(0.28, 0.76, 0.28, 0.24, 150, -90), arc(0.28, 0.26, 0.3, 0.26, 90, -150))]];
      case '4': return [0.65, [[[0.5, 0], [0.5, 1], [0, 0.35], [0.68, 0.35]]]];
      case '5': return [0.6, [cat([[0.58, 1], [0.06, 1], [0.02, 0.56]], arc(0.3, 0.32, 0.3, 0.3, 125, -150))]];
      case '6': return [0.6, [cat(arc(0.32, 0.6, 0.3, 0.4, 70, 180), arc(0.3, 0.3, 0.3, 0.3, 180, 540))]];
      case '7': return [0.6, [[[0, 1], [0.62, 1], [0.2, 0]]]];
      case '8': return [0.6, [cat(arc(0.3, 0.77, 0.24, 0.23, -90, 270), arc(0.3, 0.27, 0.3, 0.27, 90, 450))]];
      case '9': return [0.6, [cat(arc(0.3, 0.7, 0.3, 0.3, 0, 360), arc(0.3, 0.4, 0.3, 0.6, 0, -110))]];
      case '.': return [0.12, [dot(0.05)]];
      case ',': return [0.15, [[[0.08, 0.08], [0.0, -0.15]]]];
      case '!': return [0.2, [[[0.08, 1], [0.08, 0.3]], dot(0.08)]];
      case '?': return [0.6, [cat(arc(0.3, 0.72, 0.28, 0.28, 160, -60), [[0.3, 0.42], [0.3, 0.28]]), dot(0.3)]];
      case '-': return [0.45, [[[0.02, 0.5], [0.43, 0.5]]]];
      case "'": return [0.15, [[[0.08, 1], [0.06, 0.75]]]];
      case '*': {   // heart
        const P = [];
        for (let i = 0; i < 60; i++) {
          const t = 2 * Math.PI * i / 59;
          const hx = 16 * Math.sin(t) ** 3;
          const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          P.push([0.45 + 0.45 * hx / 16, 0.55 + 0.45 * hy / 16]);
        }
        return [0.9, [P]];
      }
      default: return [0.45, []];   // unknown characters become a space
    }
  }

  function lineStrokes(txt) {
    const gap = 0.28, segs = [];
    let cx = 0;
    [...txt].forEach((ch, ci) => {
      const [w, L] = glyph(ch);
      for (const s of L) segs.push({ pts: s.map(([x, y]) => [x + cx, y]), letter: ci + 1 });
      cx += w + gap;
    });
    return [segs, Math.max(cx - gap, 0.1)];
  }

  // message: text; '|' or a newline starts a new line (up to 3 used). Returns {strokes:[{pts, letter}], h}
  function layout(message) {
    const lines = message.split(/[|\n]/).map((s) => s.trim().toUpperCase()).filter((s) => s.length).slice(0, 3);
    const nL = lines.length;
    if (!nL) return { strokes: [], h: 0 };
    const per = lines.map(lineStrokes);
    const h = Math.min(0.17, 0.38 / (nL + 0.35 * (nL - 1)), 1.95 / Math.max(...per.map((p) => p[1])));
    const blockH = nL * h + (nL - 1) * 0.35 * h;
    const yTop = 0.25 + blockH / 2;
    const strokes = [];
    per.forEach(([segs, width], l) => {
      const x0 = 1.125 - width * h / 2;
      const base = yTop - (l + 1) * h - l * 0.35 * h;
      for (const s of segs) {
        strokes.push({ pts: s.pts.map(([x, y]) => [x0 + h * x, base + h * y]), letter: s.letter + 1000 * (l + 1) });
      }
    });
    return { strokes, h };
  }

  window.FomoFont = { layout };
})();
