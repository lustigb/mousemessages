// Message writers and track building (ports of foragingagents/analysis: fomo_mouse_writer.m, fomo_halloween_data.m,
// fomo_message_cumulative.m 'letter' mode, and the GUI's cinematic speed profile).
(function () {
  // ---- seeded random numbers ----
  function makeRng(seed) {
    let a = seed >>> 0;
    const rand = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randn = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    return { rand, randn };
  }

  const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const unitv = (d) => { const n = Math.max(Math.hypot(d[0], d[1]), 1e-9); return [d[0] / n, d[1] / n]; };
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function resampleBy(P, step) {
    const d = [0];
    for (let i = 1; i < P.length; i++) d.push(d[i - 1] + hyp(P[i], P[i - 1]));
    const L = d[d.length - 1];
    if (L < 1e-9) return [P[0]];
    const out = [];
    let j = 0;
    for (let q = 0; ; q += step) {
      if (q > L) q = L;
      while (j < d.length - 2 && d[j + 1] < q) j++;
      const f = d[j + 1] > d[j] ? (q - d[j]) / (d[j + 1] - d[j]) : 0;
      out.push([P[j][0] + f * (P[j + 1][0] - P[j][0]), P[j][1] + f * (P[j + 1][1] - P[j][1])]);
      if (q >= L) break;
    }
    return out;
  }

  // ---- laser pen: straight pen-up hops (0.45 m/s, not drawn), constant 0.25 m/s writing with a small wobble ----
  function laserWriter(strokes, from, to, rate, rng) {
    const X = [], Y = [], PEN = [], INK = [];
    function moveAlong(P, speed, wobble, pen) {
      const R = resampleBy(P, 0.0005);
      let L = 0;
      for (let i = 1; i < R.length; i++) L += hyp(R[i], R[i - 1]);
      const n = Math.max(2, Math.round(L / speed * rate));
      const pts = resampleBy(P, Math.max(L / (n - 1), 1e-6));
      // smooth sideways wobble
      let wx = 0, wy = 0;
      for (const p of pts) {
        if (wobble > 0) { wx = 0.8 * wx + 0.2 * rng.randn() * wobble * 3; wy = 0.8 * wy + 0.2 * rng.randn() * wobble * 3; }
        X.push(p[0] + wx); Y.push(p[1] + wy); PEN.push(pen); INK.push(pen);
      }
    }
    let cur = from;
    for (const s of strokes) {
      moveAlong([cur, s.pts[0]], 0.45, 0, false);
      moveAlong(s.pts, 0.25, 0.002, true);
      const e = s.pts[s.pts.length - 1];
      for (let i = 0; i < Math.round(0.25 * rate); i++) { X.push(e[0]); Y.push(e[1]); PEN.push(true); INK.push(true); }
      cur = e;
    }
    moveAlong([cur, to], 0.45, 0, false);
    return { X, Y, PEN, INK };
  }

  // ---- steered mouse: pure pursuit with momentum; speed, pauses and jitter from the session's own statistics ----
  function hopCurve(p0, p3, exitDir, entryDir, o, rng) {
    const d = hyp(p0, p3);
    if (d < 1e-6) return [p0];
    const u = [(p3[0] - p0[0]) / d, (p3[1] - p0[1]) / d], nrm = [-u[1], u[0]];
    const ex = exitDir || u, en = entryDir || u;
    const a1 = Math.max(o.trailOff, 0.4 * d), s1 = 0.15 * d * rng.randn();
    const a2 = Math.min(0.03, 0.3 * d), s2 = 0.1 * d * rng.randn();
    const p1 = [p0[0] + ex[0] * a1 + nrm[0] * s1, p0[1] + ex[1] * a1 + nrm[1] * s1];
    const p2 = [p3[0] - en[0] * a2 + nrm[0] * s2, p3[1] - en[1] * a2 + nrm[1] * s2];
    const n = Math.max(4, Math.ceil(2 * d / 0.002));
    let H = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), m = 1 - t;
      H.push([m ** 3 * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t ** 3 * p3[0],
              m ** 3 * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t ** 3 * p3[1]]);
    }
    if (rng.rand() < o.pScribble && d > 0.03) {   // a small loop part-way along
      const i = Math.round((H.length - 1) * (0.3 + 0.4 * rng.rand()));
      const c = H[i], r = 0.008 + 0.012 * rng.rand(), sg = rng.rand() < 0.5 ? -1 : 1;
      const loop = [];
      for (let j = 1; j < 30; j++) {
        const ph = sg * 2 * Math.PI * j / 29;
        loop.push([c[0] + r * (Math.cos(ph) - 1), c[1] + r * Math.sin(ph)]);
      }
      H = H.slice(0, i + 1).concat(loop, H.slice(i + 1));
    }
    return resampleBy(H, 0.002);
  }

  function mouseWriter(strokes, from, to, stats, rate, opts, rng) {
    const o = Object.assign({ lookahead: 0.035, cruise: stats.speedPct[2], turnMax: 900, pStrokePause: 0.25,
      pLetterPause: 0.6, pScribble: 0.5, trailOff: 0.04, jitter: 0.35 * stats.jitterSD }, opts || {});
    const ds = 0.002;
    let P = [], PEN = [];
    const stops = [];
    let cur = from, exitDir = null;
    for (let k = 0; k <= strokes.length; k++) {
      let target, entry = null, S = null;
      if (k < strokes.length) {
        S = strokes[k].pts; target = S[0];
        const q = S[Math.min(2, S.length - 1)];
        entry = unitv([q[0] - S[0][0], q[1] - S[0][1]]);
      } else target = to;
      let H = hopCurve(cur, target, exitDir, entry, o, rng);
      if (P.length) H = H.slice(1);
      for (const h of H) { P.push(h); PEN.push(false); }
      if (k === strokes.length) break;
      const W = resampleBy(S, ds);
      for (let i = 1; i < W.length; i++) { P.push(W[i]); PEN.push(true); }
      const newLetter = k === strokes.length - 1 || strokes[k + 1].letter !== strokes[k].letter;
      stops.push([P.length - 1, newLetter ? o.pLetterPause : o.pStrokePause]);
      const e = S[S.length - 1], b = S[Math.max(0, S.length - 3)];
      cur = e; exitDir = unitv([e[0] - b[0], e[1] - b[1]]);
    }
    const nP = P.length;
    const sub = 10, dt = 1 / rate / sub;
    const ca = stats.curvFit[0], cb = stats.curvFit[1], aMax = stats.accelPct[2], turnMax = o.turnMax * Math.PI / 180;
    const pauses = stats.pauseSec.length ? stats.pauseSec : [0.45];
    let pos = P[0].slice();
    const p4 = P[Math.min(4, nP - 1)];
    let th = Math.atan2(p4[1] - pos[1], p4[0] - pos[0]), v = 0, idx = 0, nextStop = 0, pauseLeft = 0;
    let cruise = o.cruise, cruiseT = 0, step = 0;
    const Lk = Math.max(2, Math.round(o.lookahead / ds));
    const out = [];
    for (;;) {
      let best = Infinity, bi = idx;
      for (let j = idx; j <= Math.min(nP - 1, idx + 40); j++) {
        const dd = (P[j][0] - pos[0]) ** 2 + (P[j][1] - pos[1]) ** 2;
        if (dd < best) { best = dd; bi = j; }
      }
      idx = bi;
      if (idx >= nP - 2 && hyp(pos, P[nP - 1]) < 0.004) break;
      if (nextStop < stops.length && idx >= stops[nextStop][0]) {
        if (rng.rand() < stops[nextStop][1]) pauseLeft = pauses[Math.floor(rng.rand() * pauses.length)];
        nextStop++;
      }
      cruiseT += dt;
      if (cruiseT > 1.5) { cruise = o.cruise * Math.exp(0.35 * rng.randn()); cruiseT = 0; }
      const tgt = P[Math.min(nP - 1, idx + Lk)];
      const e = wrapPi(Math.atan2(tgt[1] - pos[1], tgt[0] - pos[0]) - th);
      const Ld = Math.max(hyp(tgt, pos), ds);
      const kap = 2 * Math.sin(Math.min(Math.abs(e), Math.PI / 2)) / Ld;
      let vT = Math.min(cruise, ca * Math.max(kap, 1e-3) ** (-cb));   // slow down for tight turns (v = a R^b)
      if (pauseLeft > 0) { vT = 0; pauseLeft -= dt; }
      v += Math.max(-aMax * dt, Math.min(aMax * dt, vT - v));
      let om = Math.sign(e) * Math.min(v * kap, turnMax);
      if (v < 0.01) om = Math.sign(e) * Math.min(Math.abs(e) / 0.15, turnMax);   // at rest: turn round
      th += om * dt;
      pos = [pos[0] + v * dt * Math.cos(th), pos[1] + v * dt * Math.sin(th)];
      step++;
      if (step % sub === 0) out.push([pos[0], pos[1], PEN[idx]]);
      if (step > 600 * rate * sub) break;
    }
    if (!out.length) out.push([to[0], to[1], false]);
    // softened tracking jitter, none while paused
    const m = out.length, jx = [], jy = [];
    for (let i = 0; i < m; i++) { jx.push(rng.randn()); jy.push(rng.randn()); }
    const sm = (a) => a.map((_, i) => 0.25 * a[Math.max(0, i - 1)] + 0.5 * a[i] + 0.25 * a[Math.min(m - 1, i + 1)]);
    const sx = sm(jx), sy = sm(jy);
    let sd = 0;
    for (let i = 0; i < m; i++) sd += sx[i] ** 2 + sy[i] ** 2;
    sd = Math.sqrt(sd / (2 * m)) || 1;
    const X = [], Y = [], PN = [], INK = [];
    for (let i = 0; i < m; i++) {
      const moving = i > 0 && hyp(out[i], out[i - 1]) * rate > 0.02;
      X.push(out[i][0] + (moving ? o.jitter * sx[i] / sd : 0));
      Y.push(out[i][1] + (moving ? o.jitter * sy[i] / sd : 0));
      PN.push(out[i][2]); INK.push(true);
    }
    return { X, Y, PEN: PN, INK };
  }

  function writePath(strokes, from, to, sess, cfg, rng) {
    if (cfg.style === 'laser') return laserWriter(strokes, from, to, sess.rate, rng);
    return mouseWriter(strokes, from, to, sess.stats, sess.rate, { lookahead: cfg.lookahead }, rng);
  }

  // ---- build the track: the real clip with the message spliced in ----
  // cfg: {message, mode: 'all' | 'letters' | 'worn', style: 'mouse' | 'laser', lookahead (m), seed; worn: wear, spread (m)}
  function buildTrack(sess, cfg) {
    const rng = makeRng(cfg.seed);
    const rate = sess.rate;
    const x = sess.x.map((v) => v / 1000), y = sess.y.map((v) => v / 1000);
    const n = x.length;
    const { strokes } = window.FomoFont.layout(cfg.message);
    if (!strokes.length) return null;
    // the message goes in the clip's 10-min window, with at least 1 min of real data before it for the lead-in
    const lead = Math.max(sess.windowStartRow || 0, Math.round(60 * rate));
    let inserts = [];   // {at: row after which to splice, until: first real row kept after it (= at: pure insert), w: {X, Y, PEN, INK}}
    let wornInfo = null, wornPen = null;
    if (cfg.mode === 'all') {
      // splice at the end of the busiest 8 s in the first 3 min of the window
      const nR = Math.round(8 * rate);
      let bestRun = -1, iIns = lead;
      for (let i = lead; i < Math.min(n - nR - 1, lead + Math.round(180 * rate)); i++) {
        let run = 0;
        for (let j = i + 1; j < i + nR; j++) run += Math.hypot(x[j] - x[j - 1], y[j] - y[j - 1]);
        if (run > bestRun) { bestRun = run; iIns = i + nR - 1; }
      }
      inserts.push({ at: iIns, until: iIns, w: writePath(strokes, [x[iIns], y[iIns]], [x[iIns + 1], y[iIns + 1]], sess, cfg, rng) });
    } else if (cfg.mode === 'worn') {
      // worn paths: every stroke cut into pieces (8-15 cm), each run cfg.wear times, nearly on the same line (cfg.spread,
      // m), so the passes stack up like a path wearing in while the real paths stay diffuse. A pass preferably REPLACES a
      // real stretch (0.5-15 s) that starts near one end of the piece and ends near the other (the mouse was heading that
      // way anyway, no time added); otherwise it is a short out-and-back detour. Needs a long clip (the whole session).
      // (Tried 2026-11-01 and dropped: pulling real passes toward the letters -- it hollowed the letters out instead.)
      const w0 = lead, w1 = n - 1 - Math.round(30 * rate);
      const wear = cfg.wear || 10, spread = cfg.spread ?? 0.002;
      const speed = new Float32Array(n), nearVisit = new Uint8Array(n), free = new Uint8Array(n);
      for (let i = 2; i < n - 2; i++) speed[i] = Math.hypot(x[i + 2] - x[i - 2], y[i + 2] - y[i - 2]) * rate / 4;
      for (const v of sess.visitRow) for (let i = Math.max(0, v - 3 * rate); i <= Math.min(n - 1, v + 3 * rate); i++) nearVisit[i] = 1;
      for (let i = w0; i <= w1; i++) free[i] = speed[i] > 0.05 && !nearVisit[i] ? 1 : 0;
      const cell = 0.05, grid = new Map(), key = (gx, gy) => gx * 1000 + gy;
      for (let i = w0; i <= w1; i++) {
        if (!free[i]) continue;
        const k = key(Math.floor(x[i] / cell), Math.floor(y[i] / cell));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
      const near = (p) => {
        const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), out = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of grid.get(key(gx + dx, gy + dy)) || []) out.push(i);
        return out;
      };
      const pieces = [];
      for (const st of strokes) {
        const P = resampleBy(st.pts, 0.005);
        let i0 = 0;
        while (i0 < P.length - 1) {
          const len = Math.round((0.08 + 0.07 * rng.rand()) / 0.005);
          const i1 = P.length - 1 - (i0 + len) < 10 ? P.length - 1 : i0 + len;   // no crumb at the end
          pieces.push(P.slice(i0, i1 + 1));
          i0 = i1;
        }
      }
      const jobs = [];
      for (const p of pieces) for (let r = 0; r < wear; r++) jobs.push(p);
      for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(rng.rand() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
      const usedAt = new Uint8Array(n);
      const wornOpts = { lookahead: cfg.lookahead, pScribble: 0, pLetterPause: 0, pStrokePause: 0, trailOff: 0.005, jitter: 0 };
      const reach0 = 0.05, reach1 = 0.08, maxGap = Math.round(15 * rate), minGap = Math.round(0.5 * rate);
      let nReplaced = 0, nDetour = 0;
      for (const piece of jobs) {
        const ox = spread * rng.randn(), oy = spread * rng.randn();
        let pts = piece.map(([px, py]) => [px + ox, py + oy]);
        let best = null, bestD = Infinity, bestRev = false;
        for (const rev of rng.rand() < 0.5 ? [false, true] : [true, false]) {
          const q = rev ? [...pts].reverse() : pts, p0 = q[0], p1 = q[q.length - 1];
          const starts = near(p0).filter((i) => !usedAt[i] && Math.hypot(x[i] - p0[0], y[i] - p0[1]) < reach0);
          for (let tries = 0; tries < Math.min(60, starts.length); tries++) {
            const t1 = starts[Math.floor(rng.rand() * starts.length)];
            for (let t2 = t1 + minGap; t2 <= Math.min(w1, t1 + maxGap); t2++) {
              if (nearVisit[t2] || usedAt[t2]) break;
              const d = Math.hypot(x[t2] - p1[0], y[t2] - p1[1]);
              if (d < reach1 && d < bestD) { bestD = d; best = [t1, t2]; bestRev = rev; }
            }
            if (best && bestD < 0.03) break;
          }
          if (best) break;
        }
        if (best ? bestRev : rng.rand() < 0.5) pts = pts.reverse();
        const one = [{ pts, letter: 0 }];
        const write = (from, to) => (cfg.style === 'laser' ? laserWriter(one, from, to, rate, rng)
          : mouseWriter(one, from, to, sess.stats, rate, wornOpts, rng));
        if (best) {
          const [t1, t2] = best;
          for (let i = Math.max(0, t1 - rate); i <= Math.min(n - 1, t2 + rate); i++) usedAt[i] = 1;
          inserts.push({ at: t1, until: t2, w: write([x[t1], y[t1]], [x[t2], y[t2]]) });
          nReplaced++;
        } else {
          let cand = near(pts[0]).filter((i) => !usedAt[i]);
          if (!cand.length) cand = near(pts[0]);
          const t = cand.length ? cand[Math.floor(rng.rand() * cand.length)] : w0;
          for (let i = Math.max(0, t - rate); i <= Math.min(n - 1, t + rate); i++) usedAt[i] = 1;
          inserts.push({ at: t, until: t, w: write([x[t], y[t]], [x[t], y[t]]) });
          nDetour++;
        }
      }
      wornInfo = { nReplaced, nDetour };
    } else {
      // each letter as a detour at a moment the mouse passes near the letter's first point (8 min window)
      const w0 = lead, w1 = Math.min(n - 1 - Math.round(60 * rate), lead + Math.round(480 * rate));
      const noTouch = new Uint8Array(n).fill(1);
      for (let i = w0; i <= w1; i++) noTouch[i] = 0;
      for (const v of sess.visitRow) for (let i = Math.max(0, v - 3 * rate); i <= Math.min(n - 1, v + 3 * rate); i++) noTouch[i] = 1;
      const speed = new Float32Array(n);
      for (let i = 2; i < n - 2; i++) speed[i] = Math.hypot(x[i + 2] - x[i - 2], y[i + 2] - y[i - 2]) * rate / 4;
      const used = new Uint8Array(n);
      const letters = [];
      for (const s of strokes) {
        if (!letters.length || letters[letters.length - 1].id !== s.letter) letters.push({ id: s.letter, strokes: [] });
        letters[letters.length - 1].strokes.push(s);
      }
      for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(rng.rand() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
      for (const L of letters) {
        const p0 = L.strokes[0].pts[0];
        let cand = [];
        for (let i = w0; i <= w1; i++) {
          if (!noTouch[i] && !used[i] && speed[i] > 0.08 && Math.hypot(x[i] - p0[0], y[i] - p0[1]) < 0.04) cand.push(i);
        }
        let t;
        if (cand.length) t = cand[Math.floor(rng.rand() * cand.length)];
        else {   // no close pass: the free moment closest to the letter
          let best = Infinity;
          t = w0;
          for (let i = w0; i <= w1; i++) {
            if (noTouch[i] || used[i]) continue;
            const d = Math.hypot(x[i] - p0[0], y[i] - p0[1]);
            if (d < best) { best = d; t = i; }
          }
        }
        for (let i = Math.max(0, t - 2 * rate); i <= Math.min(n - 1, t + 2 * rate); i++) used[i] = 1;
        inserts.push({ at: t, until: t, w: writePath(L.strokes, [x[t], y[t]], [x[t], y[t]], sess, cfg, rng) });
      }
    }
    // splice (from the start; inserts sorted by row)
    inserts.sort((a, b) => a.at - b.at);
    const X = [], Y = [], INK = [], HL = [];
    const shift = new Int32Array(n);   // new index of each original row
    let ii = 0, skipUntil = -1;        // real rows at+1 .. until-1 of a replacement are dropped
    for (let i = 0; i < n; i++) {
      shift[i] = X.length;
      if (i >= skipUntil) { X.push(x[i]); Y.push(y[i]); INK.push(1); HL.push(wornPen ? wornPen[i] : 0); }
      while (ii < inserts.length && inserts[ii].at === i) {
        const w = inserts[ii].w;
        for (let j = 0; j < w.X.length; j++) { X.push(w.X[j]); Y.push(w.Y[j]); INK.push(w.INK[j] ? 1 : 0); HL.push(w.PEN[j] ? 1 : 0); }
        skipUntil = Math.max(skipUntil, inserts[ii].until);
        ii++;
      }
    }
    let a = -1, b = -1;
    for (let i = 0; i < HL.length; i++) if (HL[i]) { if (a < 0) a = i; b = i; }
    return {
      x: Float32Array.from(X), y: Float32Array.from(Y), ink: Uint8Array.from(INK), hl: Uint8Array.from(HL),
      visitRow: sess.visitRow.map((r) => shift[r]), visitPort: sess.visitPort, visitRew: sess.visitRew,
      rate, a, b, n: X.length, label: sess.label, clipStartSec: sess.clipStartSec,
      visitsBefore: sess.visitsBefore || 0, rewardsBefore: sess.rewardsBefore || 0, wornInfo,
      spoutXY: sess.spoutXY.map(([px, py]) => [px / 1000, py / 1000]), spoutRank: sess.spoutRank,
    };
  }

  // ---- cinematic speed profile: lead-in at base, S-shaped ramps (rampSec on screen) centred on the first and last
  // written sample, `mid` speed in between, hold at base. Returns {start, end, knots: [[row, speed], ...]} ----
  function cinematicProfile(T, base, mid, leadSec, holdSec, rampSec) {
    const N = 201, v = [], s = [0];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), e = 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
      v.push(Math.exp(Math.log(base) + Math.log(mid / base) * e));
      if (i) s.push(s[i - 1] + (v[i - 1] + v[i]) / 2 * T.rate * rampSec / (N - 1));
    }
    const m = (N - 1) / 2;
    const half = s[N - 1] - s[m];
    if (half > (T.b - T.a) / 2 && half > 0) { const f = (T.b - T.a) / 2 / half; for (let i = 0; i < N; i++) s[i] *= f; }
    const knots = [];
    for (let i = 0; i < N; i++) knots.push([T.a - s[m] + s[i], v[i]]);
    for (let i = 0; i < N; i++) knots.push([T.b + s[m] - s[N - 1 - i], v[N - 1 - i]]);
    const start = Math.max(0, Math.round(knots[0][0] - leadSec * base * T.rate));
    const end = Math.min(T.n - 1, Math.round(knots[knots.length - 1][0] + holdSec * base * T.rate));
    const K = [[start, base]];
    for (const k of knots) if (k[0] > K[K.length - 1][0]) K.push(k);
    if (T.n - 1 > K[K.length - 1][0]) K.push([T.n - 1, base]);
    return { start, end, knots: K, rampIn: knots[0][0], rampOut: knots[knots.length - 1][0] };
  }

  function speedAt(knots, k) {
    if (k <= knots[0][0]) return knots[0][1];
    if (k >= knots[knots.length - 1][0]) return knots[knots.length - 1][1];
    let lo = 0, hi = knots.length - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (knots[md][0] <= k) lo = md; else hi = md; }
    const f = (k - knots[lo][0]) / (knots[hi][0] - knots[lo][0]);
    return Math.exp(Math.log(knots[lo][1]) + f * (Math.log(knots[hi][1]) - Math.log(knots[lo][1])));
  }

  window.FomoWriter = { buildTrack, cinematicProfile, speedAt };
})();
