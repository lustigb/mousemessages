// Player for Mouse Messages: draws the arena (trail, written parts, spouts, mouse), the x(t) strip and the speed
// readout on one canvas (so a recording captures everything), and plays with the cinematic speed profile.
(function () {
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = cv.width, H = 720;                 // full layout (with the time strip)
  const H_NOSTRIP = 384;                        // title + arena + credit only
  const stripOn = () => $('strip').checked;
  const frameH = () => (stripOn() ? H : H_NOSTRIP);
  const SESS = window.FOMO_SESSIONS;
  const rankColors = ['#990d0d', '#d94d1a', '#f29933', '#facc73', '#bfbfbf'];
  const CINE = { leadSec: 4, holdSec: 3, rampSec: 1 };   // on-screen seconds
  const writeSecs = { all: 4, letters: 4, worn: 15 };               // auto: on-screen seconds from first to last stroke, per mode

  // arena geometry (metres -> pixels); tracking orientation as in fomo_watch (y up)
  const AX = { left: 60, top: 82, w: 1180 };
  AX.sc = AX.w / 2.25; AX.h = 0.48 * AX.sc;
  const px = (x) => AX.left + x * AX.sc, py = (y) => AX.top + (0.48 - y) * AX.sc;
  const ST = { left: 60, top: 420, w: 1180, h: 190 };   // x(t) strip

  // the "?" help bubbles: hover (or click / tap) to read
  const HELP = {
    mouse: 'Whose real tracking to use, all from each mouse\'s first day in the arena. <b>Short:</b> 15 minutes from early on, when the mouse explores everywhere but rarely drinks. <b>Longer:</b> 30 minutes from later, picked for roaming widely <i>and</i> visiting the spouts often, with 10 minutes of real paths already drawn when the movie starts.',
    mode: 'How the message gets into the mouse\'s path. Each option has its own <b>?</b> with more detail.',
    mAll: '<b>All at once.</b> The mouse breaks off from foraging, writes the whole message in one go, then carries on. The quickest and clearest: you watch it being written, like a mouse with a pen.',
    mLetters: '<b>Letters over time.</b> Each letter is a short detour at a moment when the mouse happens to run past where that letter goes, spread over about 8 minutes, in random order. The message builds up bit by bit among the real paths; best played fast.',
    mWorn: '<b>Worn paths.</b> The message wears into the floor like a path across a lawn: over the whole 3-hour session, runs that were heading the right way are nudged onto pieces of the letters, again and again along almost the same line. Every path is drawn very thin and faint, so the real paths stay a haze and the letters slowly emerge as ghostly highways. Tip: a <b>lower roundness</b> (about 1.5-2 cm) keeps the repeated passes on the same line, so the letters come out clearer; it is set to 2 cm when you pick this mode. More <b>wear</b> = bolder letters.',
    style: '<b>Like a mouse:</b> a simulated mouse runs along the letters with momentum: it slows into tight turns, cuts corners, overshoots and pauses, using this mouse\'s own measured speeds and turning.<br><b>Laser pen:</b> smooth, even strokes; the jumps between strokes are not drawn.',
    round: 'How far ahead (cm) the simulated mouse aims while it runs along a letter. Small = crisper letters; large = rounder, more natural-looking ones.',
    look: '<b>Bold:</b> the written parts are thicker and darker than the trail.<br><b>Blended:</b> only a little darker than the normal trail, so the message is harder to spot.',
    cine: 'One playback speed for the real foraging around the message, another while it is written, with smooth one-second blends between them.',
    around: 'Playback speed before and after the message. 10× = ten seconds of real behaviour per second of movie.',
    during: 'Playback speed while the message is being written. <b>Auto</b> picks whatever speed makes the writing take the number of seconds set below.',
    secs: 'With auto: how many seconds of the movie the writing takes, from the first stroke to the last. Type any number from 1 to 20.',
    flat: 'The same playback speed for the whole movie (it plays to the end of the clip).',
    live: 'Shows the finished message right away and updates it as you type or change a setting. Untick to show the first frame instead.',
    pwrite: 'Plays only the part where the message is written, at the writing speed. Changing a setting stops it and redraws the same moment with the new settings; click again to replay.',
    gif: 'Makes a small animated GIF (640 pixels wide) of the whole movie, exactly as it plays with the current settings, to download or share. It is drawn frame by frame, so it takes a few seconds; you can keep the tab open while it works.',
    strip: 'Shows the timeline under the arena (where the mouse is along the arena over the whole clip, with the spout visits). Untick for just the arena: the GIF is then smaller and the letters fill more of it.',
    wear: 'Worn paths: how many times each piece of every letter is run. More passes = darker letters, but more of the real paths are rerouted (and, past about 10, some made-up out-and-back runs are added).',
    reroll: 'Same message and settings, new random choices: where the letters go, the little scribbles and pauses, and the wiggle.',
  };
  document.querySelectorAll('.help').forEach((h) => {
    h.innerHTML = `?<span class="tip">${HELP[h.dataset.help] || ''}</span>`;
    if (h.closest('.speedcol')) h.classList.add('right');
    h.addEventListener('click', (e) => {   // inside a label: don't tick the option, just open/close the bubble
      e.preventDefault(); e.stopPropagation();
      const was = h.classList.contains('open');
      document.querySelectorAll('.help.open').forEach((o) => o.classList.remove('open'));
      if (!was) h.classList.add('open');
    });
  });
  document.addEventListener('click', () => document.querySelectorAll('.help.open').forEach((o) => o.classList.remove('open')));

  let T = null, prof = null, k = 0, playing = false, lastTs = null, seed = 1, recorder = null;
  let playEnd = 0, resumable = false;
  let lastView = 'idle';   // 'writing' after Preview writing: setting changes then replay the writing   // where the current playback stops; true when a movie is paused mid-way

  const SPEEDS = [1, 2, 4, 10, 30, 60, 120, 240];
  for (const v of SPEEDS) {
    for (const id of ['speed', 'wspeed', 'fspeed']) {
      const o = document.createElement('option');
      o.value = v; o.textContent = `${v}×`;
      $(id).appendChild(o);
    }
  }
  $('speed').value = '10';
  $('fspeed').value = '10';
  // mouse menu: grouped by mouse (short before longer), mice in natural order (6PG10 before 6PO7)
  const byMouse = [...SESS].sort((p, q) => p.label.localeCompare(q.label, undefined, { numeric: true }) || p.windowStartRow - q.windowStartRow
    || (p.menu || '').localeCompare(q.menu || ''));
  for (const s of byMouse) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.menu || s.label;
    $('sess').appendChild(o);
  }

  $('sess').value = '6PG10_d1_m54';   // default: 6PG10 day 1 (longer)
  const val = (name) => document.querySelector(`input[name=${name}]:checked`).value;
  function cfg() {
    return { message: $('msg').value, mode: val('mode'), style: val('style'), lookahead: +$('round').value / 100, seed,
      wear: +$('wear').value, spread: 0.002 };
  }
  function look() {
    return val('look') === 'bold' ? { color: '#6b6b6b', width: 3.5 } : { color: '#b8b8b8', width: 2.0 };
  }
  const cinematic = () => val('speedmode') === 'cine';

  function build() {
    const sess = SESS.find((s) => s.id === $('sess').value);
    const t0 = performance.now();
    T = window.FomoWriter.buildTrack(sess, cfg());
    if (!T) { $('status').textContent = 'Type something to write.'; return false; }
    T.worn = val('mode') === 'worn';
    makeProfile();
    showTiming();
    // x(t) strip background, drawn once
    T.strip = document.createElement('canvas');
    T.strip.width = W; T.strip.height = H;
    drawStripBackground(T.strip.getContext('2d'));
    const writeSec = (T.b - T.a) / T.rate;
    $('status').textContent = `${T.label}: message written over ${writeSec < 90 ? writeSec.toFixed(0) + ' s' : (writeSec / 60).toFixed(1) + ' min'} of the session` +
      (cinematic() ? `; ${$('speed').value}× around it, ${prof.mid.toFixed(0)}× while writing (writing takes ${prof.writeSec.toFixed(1)} s)` : `; ${$('fspeed').value}× throughout`) + ` (built in ${(performance.now() - t0).toFixed(0)} ms)`;
    return true;
  }

  function makeProfile() {
    if (cinematic()) {
      // 'around the text' speed for the lead-in and hold, 'while writing' speed in between, S-shaped ramps;
      // auto = solved so first -> last stroke takes exactly the chosen on-screen seconds (per mode: writeSecs)
      const base = +$('speed').value;
      const mk = (mid) => window.FomoWriter.cinematicProfile(T, base, mid, CINE.leadSec, CINE.holdSec, CINE.rampSec);
      let mid;
      if ($('wspeed').value !== 'auto') mid = +$('wspeed').value;
      else {   // solve for the writing speed that makes first -> last stroke take exactly the chosen seconds
        const want = writeSecs[val('mode')];
        let lo = Math.log(0.05), hi = Math.log(5000);
        for (let it = 0; it < 30; it++) {
          const m = (lo + hi) / 2;
          if (screenSec(mk(Math.exp(m)).knots, T.a, T.b) > want) lo = m; else hi = m;
        }
        mid = Math.exp((lo + hi) / 2);
      }
      prof = mk(mid);
      prof.writeSec = screenSec(prof.knots, T.a, T.b);
      prof.mid = mid;
    } else {
      prof = { start: Math.max(0, T.a - Math.round(60 * T.rate)), end: T.n - 1, knots: null, mid: +$('fspeed').value };
    }
  }
  function screenSec(knots, a, b) {   // on-screen seconds to play samples a..b (exact: speed is log-linear between knots)
    const sp = (k) => window.FomoWriter.speedAt(knots, k);
    const pts = [a, ...knots.map((q) => q[0]).filter((r) => r > a && r < b), b];
    let t = 0;
    for (let i = 1; i < pts.length; i++) {
      const k0 = pts[i - 1], k1 = pts[i], v0 = sp(k0), v1 = sp(k1);
      t += Math.abs(v1 - v0) < 1e-9 * v0 ? (k1 - k0) / v0 : (k1 - k0) * (1 / v0 - 1 / v1) / Math.log(v1 / v0);
    }
    return t / T.rate;
  }
  function showTiming() {   // movie length, writing time and preview length, in seconds of movie
    let total, write, prev;
    if (prof.knots) {
      total = screenSec(prof.knots, prof.start, prof.end);
      write = screenSec(prof.knots, T.a, T.b);
      prev = screenSec(prof.knots, prof.rampIn, prof.rampOut);
    } else {
      const v = +$('fspeed').value * T.rate, pad = 2 * T.rate;
      total = (prof.end - prof.start) / v; write = (T.b - T.a) / v;
      prev = (Math.min(T.n - 1, T.b + pad) - Math.max(0, T.a - pad)) / v;
    }
    const f = (t) => (t < 60 ? `${t.toFixed(1)} s` : `${Math.floor(t / 60)} min ${Math.round(t % 60)} s`);
    $('timing').innerHTML = `Movie: <b>${f(total)}</b> &nbsp;·&nbsp; writing: <b>${f(write)}</b> &nbsp;·&nbsp; Preview writing: ${f(prev)}`;
  }
  const speedNow = () => (prof.knots ? window.FomoWriter.speedAt(prof.knots, k) : +$('fspeed').value);

  // ---- drawing ----
  function strokeRun(c, from, to, keep) {
    // one path through samples from..to, broken wherever keep(i) is false
    c.beginPath();
    let pen = false;
    for (let i = from; i <= to; i++) {
      if (!keep(i)) { pen = false; continue; }
      if (pen) c.lineTo(px(T.x[i]), py(T.y[i])); else { c.moveTo(px(T.x[i]), py(T.y[i])); pen = true; }
    }
    c.stroke();
  }

  function drawStripBackground(c) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const tEnd = T.n / T.rate;
    const sx = (t) => ST.left + t / tEnd * ST.w, sy = (x) => ST.top + ST.h - x / 2.25 * ST.h;
    c.strokeStyle = '#ccc'; c.lineWidth = 1; c.strokeRect(ST.left, ST.top, ST.w, ST.h);
    c.strokeStyle = '#999'; c.lineWidth = 0.7; c.beginPath();
    const step = Math.max(1, Math.round(T.rate / 4));
    for (let i = 0; i < T.n; i += step) { const X = sx(i / T.rate), Y = sy(T.x[i]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }
    c.stroke();
    T.visitRow.forEach((r, j) => {
      c.fillStyle = rankColors[T.spoutRank[T.visitPort[j]] - 1];
      c.beginPath(); c.arc(sx(r / T.rate), sy(T.x[r]), 3, 0, 2 * Math.PI); c.fill();
    });
    c.fillStyle = '#777'; c.font = '13px -apple-system, sans-serif'; c.textAlign = 'center';
    const mStep = tEnd > 1200 ? 2 : 1;   // minute labels; every 2 min on long clips
    for (let m = 0; m <= tEnd / 60; m += mStep) c.fillText(fmtClock(T.clipStartSec + m * 60), sx(m * 60), ST.top + ST.h + 18);
    c.fillText('time in session (min:s) — click to jump', ST.left + ST.w / 2, ST.top + ST.h + 40);
    c.save(); c.translate(ST.left - 30, ST.top + ST.h / 2); c.rotate(-Math.PI / 2); c.fillText('x (m)', 0, 0); c.restore();
  }

  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function draw() { render(ctx, k); }
  // density layer for worn paths: drawn incrementally on its own canvas in short separate strokes, so overlapping passes
  // add up (a single long stroke would not darken where it crosses itself)
  const WORN = { alpha: 0.12, width: 0.6, run: 6 };
  function wornLayer(from, ki) {
    if (!T.acc || T.accK > ki || T.accFrom !== from) {
      T.acc = T.acc || document.createElement('canvas');
      T.acc.width = W; T.acc.height = Math.ceil(py(-0.02));
      T.accK = from; T.accFrom = from;
    }
    const c = T.acc.getContext('2d');
    c.strokeStyle = `rgba(40, 40, 40, ${WORN.alpha})`; c.lineWidth = WORN.width; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = Math.max(T.accK, from) + 1; i <= ki; i += WORN.run) {
      c.beginPath();
      c.moveTo(px(T.x[i - 1]), py(T.y[i - 1]));
      for (let j = i; j <= Math.min(ki, i + WORN.run - 1); j++) {
        if (T.ink[j] && T.ink[j - 1]) c.lineTo(px(T.x[j]), py(T.y[j])); else c.moveTo(px(T.x[j]), py(T.y[j]));
      }
      c.stroke();
    }
    T.accK = Math.max(T.accK, ki);
  }

  function render(ctx, k) {   // one frame at sample k onto any 1280x720 context (the page canvas or the GIF maker's)
    if (!T) return;
    const ki = Math.min(T.n - 1, Math.floor(k));
    const fh = frameH();
    if (stripOn()) {
      ctx.drawImage(T.strip, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, ST.top - 30);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, fh);
    }
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1; ctx.strokeRect(px(0), py(0.48), AX.w, AX.h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // trail: everything from 10 min before the start of playback (the clip is short, so in practice all of it)
    const trail0 = Math.max(0, prof.start - Math.round(600 * T.rate));
    if (T.worn) {
      wornLayer(trail0, ki);   // worn paths: every pass drawn faintly, so only well-trodden paths turn dark
      ctx.drawImage(T.acc, 0, 0);
    } else {
      ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1;
      strokeRun(ctx, trail0, ki, (i) => T.ink[i] && (i === trail0 || T.ink[i - 1]));
      const lk = look();
      ctx.strokeStyle = lk.color; ctx.lineWidth = lk.width;
      strokeRun(ctx, Math.max(trail0, T.a), ki, (i) => T.hl[i]);
    }
    ctx.strokeStyle = '#262626'; ctx.lineWidth = 2.5;
    strokeRun(ctx, Math.max(trail0, ki - Math.round(3 * T.rate)), ki, (i) => T.ink[i]);
    // spouts, visit ring, mouse
    T.spoutXY.forEach(([sx, sy], p) => {
      ctx.fillStyle = rankColors[T.spoutRank[p] - 1]; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px(sx), py(sy), 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
    let nVis = T.visitsBefore, nRew = T.rewardsBefore, recent = -1;   // session running totals
    T.visitRow.forEach((r, j) => {
      if (r <= ki) { nVis++; if (T.visitRew[j]) nRew++; if (r > ki - 2 * T.rate) recent = j; }
    });
    if (recent >= 0) {
      const [sx, sy] = T.spoutXY[T.visitPort[recent]];
      ctx.strokeStyle = '#33b34d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px(sx), py(sy), 22, 0, 2 * Math.PI);
      if (T.visitRew[recent]) { ctx.fillStyle = 'rgba(51,179,77,0.35)'; ctx.fill(); }
      ctx.stroke();
    }
    ctx.fillStyle = '#e61a1a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(px(T.x[ki]), py(T.y[ki]), 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    // title, speed readout, credit
    ctx.fillStyle = '#222'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${T.label}     t = ${fmtClock(T.clipStartSec + ki / T.rate)}     visits ${nVis}, rewards ${nRew}`, W / 2, 50);
    ctx.fillStyle = '#9a9a9a'; ctx.font = 'bold 34px -apple-system, sans-serif'; ctx.textAlign = 'right';
    const spd = prof.knots ? window.FomoWriter.speedAt(prof.knots, k) : +$('fspeed').value;
    ctx.fillText(`▶▶ ${spd.toFixed(0)}×`, W - 24, 46);
    ctx.fillStyle = '#a0a0a0'; ctx.font = '13px -apple-system, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Message inserted (not real behaviour). Real mouse tracking: Dudman & Grima 2026, Janelia, doi:10.25378/janelia.31807939, CC BY 4.0 (modified).', ST.left, fh - 14);
    if (!stripOn()) return;
    // now line on the strip
    const xs = ST.left + ki / T.n * ST.w;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xs, ST.top); ctx.lineTo(xs, ST.top + ST.h); ctx.stroke();
  }

  // ---- playback ----
  function tick(ts) {
    if (!playing) { lastTs = null; return; }
    const dt = lastTs === null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    k += speedNow() * dt * T.rate;
    if (k >= playEnd) {
      k = playEnd; setPlaying(false); resumable = false; draw();
      if (recorder) setTimeout(() => recorder.stop(), 600);
      return;
    }
    draw();
    requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    playing = on;
    $('play').textContent = on ? '❚❚ Pause' : '▶ Play';
    if (on) { lastTs = null; requestAnimationFrame(tick); }
  }
  function start() { k = prof.start; playEnd = prof.end; resumable = false; draw(); setPlaying(true); }

  // what the canvas shows when nothing is playing: the finished message (live preview) or the first frame
  function showIdle() {
    setPlaying(false); resumable = false;
    k = $('live').checked ? prof.end : prof.start;
    draw();
  }
  function writingSpan() {   // [first, last] sample of the Preview writing stretch
    if (prof.knots) return [prof.rampIn, prof.rampOut];
    const pad = Math.round(2 * T.rate);
    return [Math.max(0, T.a - pad), Math.min(T.n - 1, T.b + pad)];
  }
  function rebuild() {
    // after Preview writing: stop, and show the same point of the writing with the new settings
    let frac = null;
    if (lastView === 'writing' && T) { const [w0, w1] = writingSpan(); frac = Math.min(1, Math.max(0, (k - w0) / (w1 - w0))); }
    if (!build()) return;
    if (frac === null) { showIdle(); return; }
    setPlaying(false); resumable = false;
    const [w0, w1] = writingSpan();
    k = w0 + frac * (w1 - w0);
    draw();
  }
  let typingTimer = null;
  $('msg').oninput = () => { clearTimeout(typingTimer); typingTimer = setTimeout(rebuild, 150); };
  for (const id of ['sess', 'round']) $(id).onchange = rebuild;
  document.querySelectorAll('input[name=mode], input[name=style]').forEach((r) => r.addEventListener('change', rebuild));
  $('live').onchange = () => { lastView = 'idle'; if (T) showIdle(); };
  $('reroll').onclick = () => { seed++; rebuild(); };
  $('play').onclick = () => {   // pause / resume a movie, otherwise play the whole movie from the start
    if (!T) return;
    if (playing) { setPlaying(false); resumable = playEnd === prof.end; return; }
    if (resumable) { setPlaying(true); return; }
    lastView = 'movie';
    start();
  };
  function playWriting() {   // just the stretch where the message is written (with the ramps either side)
    if (!T) return;
    lastView = 'writing';
    [k, playEnd] = writingSpan();
    resumable = false; draw(); setPlaying(true);
  }
  $('pwrite').onclick = playWriting;
  const reprofile = () => {   // speed changes take effect without rebuilding; keep the place in the clip
    $('wspeed').disabled = !cinematic();
    $('wsecs').disabled = !cinematic() || $('wspeed').value !== 'auto';
    if (!T) return;
    makeProfile();
    showTiming();
    if (lastView === 'writing') { setPlaying(false); resumable = false; draw(); return; }   // stop in place
    if (playing) playEnd = Math.min(playEnd, prof.end);
    else if (!resumable) { showIdle(); }
    k = Math.min(Math.max(k, prof.start), prof.end);
    draw();
    const w = (T.b - T.a) / T.rate;
    $('status').textContent = `${T.label}: message written over ${w < 90 ? w.toFixed(0) + ' s' : (w / 60).toFixed(1) + ' min'} of the session` +
      (cinematic() ? `; ${$('speed').value}× around it, ${prof.mid.toFixed(0)}× while writing (writing takes ${prof.writeSec.toFixed(1)} s)` : `; ${$('fspeed').value}× throughout`);
  };
  document.querySelectorAll('input[name=speedmode]').forEach((r) => (r.onchange = () => {
    $('cineBox').hidden = !cinematic(); $('flatBox').hidden = cinematic(); reprofile();
  }));
  $('fspeed').onchange = reprofile;
  $('speed').onchange = reprofile;
  $('wspeed').onchange = () => { $('wsecs').disabled = !cinematic() || $('wspeed').value !== 'auto'; reprofile(); };
  $('wsecs').oninput = () => {   // applies while typing when the number is in range
    const v = parseFloat($('wsecs').value);
    if (v >= 1 && v <= 20) { writeSecs[val('mode')] = v; reprofile(); }
  };
  $('wsecs').onchange = () => {   // on Enter / leaving the box: clamp to 1-20 and show what is used
    const v = parseFloat($('wsecs').value);
    const c = Math.min(20, Math.max(1, isFinite(v) ? v : writeSecs[val('mode')]));
    $('wsecs').value = c;
    if (c !== writeSecs[val('mode')]) { writeSecs[val('mode')] = c; reprofile(); }
  };
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { $('wsecs').value = writeSecs[val('mode')]; }));
  document.querySelectorAll('input[name=look]').forEach((r) => (r.onchange = draw));   // restyle, no rebuild
  const showRound = () => { $('roundVal').textContent = `(${$('round').value} cm)`; $('round').title = 'how far ahead the mouse steers: larger = rounder letters'; $('round').disabled = val('style') === 'laser'; };
  document.querySelectorAll('input[name=style]').forEach((r) => (r.onchange = showRound));
  $('round').oninput = showRound;
  showRound();
  let roundBeforeWorn = null;
  // worn paths needs lots of real running: switch to the whole-session clip when entering it
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
    const cur = SESS.find((q) => q.id === $('sess').value), long = SESS.find((q) => q.long);
    if (val('mode') === 'worn' && !cur.long && long) { $('sess').value = long.id; rebuild(); }
    // worn paths reads best with crisper steering (repeated passes stay on one line); restore the old value on leaving
    if (val('mode') === 'worn' && roundBeforeWorn === null) {
      roundBeforeWorn = $('round').value;
      if (+$('round').value > 2) { $('round').value = 2; showRound(); rebuild(); }
    } else if (val('mode') !== 'worn' && roundBeforeWorn !== null) {
      $('round').value = roundBeforeWorn; roundBeforeWorn = null; showRound(); rebuild();
    }
  }, true));
  const showWear = () => { $('wearBox').hidden = val('mode') !== 'worn'; $('wearVal').textContent = `(${$('wear').value} passes)`; };
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', showWear));
  $('wear').oninput = showWear; $('wear').onchange = () => { showWear(); rebuild(); };
  showWear();

  cv.onclick = (e) => {   // click the strip to jump
    if (!T) return;
    const r = cv.getBoundingClientRect(), X = (e.clientX - r.left) * W / r.width, Y = (e.clientY - r.top) * cv.height / r.height;
    if (!stripOn()) return;
    if (Y < ST.top || Y > ST.top + ST.h || X < ST.left || X > ST.left + ST.w) return;
    k = Math.round((X - ST.left) / ST.w * T.n);
    if (!playing) { resumable = true; playEnd = prof.end; }
    draw();
  };

  // ---- record the canvas (MP4 where the browser can, otherwise WebM) ----
  $('rec').onclick = () => {
    if (!T && !build()) return;
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) { $('status').textContent = 'This browser cannot record the canvas.'; return; }
    const chunks = [];
    recorder = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mouse_message.' + (type.startsWith('video/mp4') ? 'mp4' : 'webm');
      a.click();
      $('rec').disabled = false; recorder = null;
      $('status').textContent = `Saved ${a.download} (${(blob.size / 1e6).toFixed(1)} MB).`;
    };
    $('rec').disabled = true;
    $('status').textContent = 'Recording… keep this tab in front until it finishes.';
    k = prof.start; playEnd = prof.end; draw();
    recorder.start();
    setTimeout(() => setPlaying(true), 400);
  };

  // ---- animated GIF: render every frame off-screen (not in real time), quantise, encode with gifenc ----
  const GIF = { w: 640, frameMs: 80, holdMs: 1500, colors: 64 };   // 12.5 frames/s; height follows the layout
  let gifUrl = null;
  async function makeGif(span) {   // span = [start, end] frame positions (default: the whole movie)
    if (!T) return;
    const [g0, g1] = span || [prof.start, prof.end];
    setPlaying(false);
    const btn = $('gifBtn');
    btn.disabled = true;
    // frame positions: the same speed profile the player uses, stepped at the GIF's frame rate
    const ks = [];
    for (let kk = g0; kk < g1; ) {
      ks.push(kk);
      const v = prof.knots ? window.FomoWriter.speedAt(prof.knots, kk) : +$('fspeed').value;
      kk += v * T.rate * GIF.frameMs / 1000;
    }
    ks.push(g1);
    const fh = frameH(), gh = Math.round(GIF.w * fh / W);
    const big = document.createElement('canvas'); big.width = W; big.height = fh;
    const bctx = big.getContext('2d');
    const small = document.createElement('canvas'); small.width = GIF.w; small.height = gh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    const frame = (kk) => {
      render(bctx, kk);
      sctx.drawImage(big, 0, 0, GIF.w, gh);
      return sctx.getImageData(0, 0, GIF.w, gh).data;
    };
    // one palette for the whole GIF (no flicker), from the finished frame plus the colours that come and go
    const { GIFEncoder, quantize, applyPalette } = window.gifenc;
    const palette = quantize(frame(g1), GIF.colors);
    for (const c of [[230, 26, 26], [51, 179, 77], [38, 38, 38], [255, 255, 255]]) if (palette.length < 256) palette.push(c);
    const gif = GIFEncoder();
    for (let i = 0; i < ks.length; i++) {
      const idx = applyPalette(frame(ks[i]), palette);
      gif.writeFrame(idx, GIF.w, gh, { palette: i === 0 ? palette : undefined, delay: i === ks.length - 1 ? GIF.holdMs : GIF.frameMs });
      if (i % 4 === 0) {
        btn.textContent = `Making GIF… ${Math.round(100 * i / ks.length)}%`;
        await new Promise((r) => setTimeout(r, 0));   // let the page repaint
      }
    }
    gif.finish();
    const blob = new Blob([gif.bytes()], { type: 'image/gif' });
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    gifUrl = URL.createObjectURL(blob);
    $('gifImg').src = gifUrl;
    $('gifDl').href = gifUrl;
    $('gifInfo').textContent = `${GIF.w}×${gh}, ${ks.length} frames, ${(ks.length * GIF.frameMs / 1000 + GIF.holdMs / 1000).toFixed(1)} s, ${(blob.size / 1e6).toFixed(1)} MB`;
    const file = new File([blob], 'mouse_message.gif', { type: 'image/gif' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    $('gifShare').hidden = !canShare;
    $('gifShare').onclick = () => navigator.share({ files: [file], title: 'Mouse message' }).catch(() => {});
    $('gifPanel').hidden = false;
    btn.disabled = false; btn.textContent = 'Make GIF';
    draw();
  }
  $('gifBtn').onclick = () => makeGif();
  $('strip').onchange = () => { cv.height = frameH(); draw(); };
  $('gifClose').onclick = () => { $('gifPanel').hidden = true; };

  // ---- phone layout: settings sections start closed and show their current values on the header ----
  const phone = window.matchMedia('(max-width: 800px)');
  function sectionsForLayout() { document.querySelectorAll('details.sec').forEach((d) => (d.open = !phone.matches)); }
  phone.addEventListener('change', sectionsForLayout);
  sectionsForLayout();
  function summaries() {
    const opt = (sel) => sel.options[sel.selectedIndex]?.textContent || '';
    $('sumMouse').textContent = `${opt($('sess'))} · ${{ all: 'all at once', letters: 'letters over time', worn: 'worn paths' }[val('mode')]}`;
    $('sumWriting').textContent = val('style') === 'laser' ? 'laser pen' : `like a mouse, ${$('round').value} cm`;
    $('sumLetters').textContent = val('look') === 'bold' ? 'bold' : 'blended';
    $('sumSpeed').textContent = cinematic()
      ? `cinematic, ${$('speed').value}× / ${$('wspeed').value === 'auto' ? `auto ${writeSecs[val('mode')]} s` : $('wspeed').value + '×'}`
      : `flat ${$('fspeed').value}×`;
  }
  document.addEventListener('change', summaries);
  document.addEventListener('input', summaries);
  summaries();

  // test hooks: #nolive starts with live preview off; #letters / #laser / #s=<session id> preset options
  const hash = location.hash.slice(1).split('&');
  if (hash.includes('letters')) document.querySelector('input[name=mode][value=letters]').checked = true;
  if (hash.includes('worn')) { document.querySelector('input[name=mode][value=worn]').checked = true; $('sess').value = SESS.find((q) => q.long).id; roundBeforeWorn = $('round').value; $('round').value = 2; showRound(); showWear(); }
  const hal = hash.find((h) => h.startsWith('alpha='));
  if (hal) WORN.alpha = +hal.slice(6);
  const hlw = hash.find((h) => h.startsWith('lw='));
  if (hlw) WORN.width = +hlw.slice(3);
  const hwr = hash.find((h) => h.startsWith('wear='));
  if (hwr) $('wear').value = hwr.slice(5);
  if (hash.includes('laser')) document.querySelector('input[name=style][value=laser]').checked = true;
  const hs = hash.find((h) => h.startsWith('s='));
  if (hs) $('sess').value = hs.slice(2);
  if (hash.includes('nolive')) $('live').checked = false;
  const hm = hash.find((h) => h.startsWith('msg='));
  if (hm) $('msg').value = decodeURIComponent(hm.slice(4)).replace(/\|/g, '\n');
  const hr = hash.find((h) => h.startsWith('round='));
  if (hr) $('round').value = hr.slice(6);
  const hsd = hash.find((h) => h.startsWith('seed='));
  if (hsd) seed = +hsd.slice(5);
  const hw = hash.find((h) => h.startsWith('gifw='));
  if (hw) GIF.w = +hw.slice(5);
  const hgm = hash.find((h) => h.startsWith('gifms='));   // GIF frame interval in ms (fewer frames = smaller file)
  if (hgm) GIF.frameMs = +hgm.slice(6);
  if (hash.includes('nostrip')) { $('strip').checked = false; cv.height = frameH(); }
  const ht = hash.find((h) => h.startsWith('tip='));
  if (ht) document.querySelector(`.help[data-help=${ht.slice(4)}]`).classList.add('open');
  rebuild();
  const hat = hash.find((h) => h.startsWith('at='));   // show the frame a fraction of the way through the movie
  if (hat) { k = prof.start + +hat.slice(3) * (prof.end - prof.start); draw(); }
  if (hash.includes('thumb')) {   // 800x600 card image: the finished frame at 3x, cropped 4:3 around the middle of the arena
    const sc = 3, big = document.createElement('canvas');
    big.width = W * sc; big.height = frameH() * sc;
    const bc = big.getContext('2d'); bc.scale(sc, sc); render(bc, prof.end);
    const htw = hash.find((q) => q.startsWith('thumbw='));   // crop width in metres (default: full arena height, 4:3)
    const wm = htw ? +htw.slice(7) : 0.667;
    const y0 = py(0.49) * sc, h = 0.5 * AX.sc * sc, w = wm * AX.sc * sc, xc = px(1.125) * sc;   // the arena band only
    const out = document.createElement('canvas'); out.width = 800; out.height = 600;
    const oc = out.getContext('2d'); oc.fillStyle = '#fff'; oc.fillRect(0, 0, 800, 600);
    const dh = Math.min(600, h * 800 / w);   // keep the aspect; white above and below when the word is wide
    oc.drawImage(big, xc - w / 2, y0, w, h, 0, (600 - dh) / 2, 800, dh);
    const pre = document.createElement('pre'); pre.id = 'thumbdump'; pre.textContent = out.toDataURL('image/png'); document.body.appendChild(pre);
  }
  if (hash.includes('gif')) { const t0 = performance.now(); makeGif(hash.includes('gifwrite') ? writingSpan() : undefined).then(async () => { if (hash.includes('gifdump')) { const b = await (await fetch(gifUrl)).blob(); const r = new FileReader(); r.onload = () => { const pre = document.createElement('pre'); pre.id = 'gifdump'; pre.textContent = r.result; document.body.appendChild(pre); }; r.readAsDataURL(b); } $('gifInfo').textContent += ` (made in ${((performance.now() - t0) / 1000).toFixed(1)} s)`; }); }
})();
