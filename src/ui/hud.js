// Steady Hands HUD: DOM overlay. createHUD(root, engine)
const FALLBACK_DRILLS = [
  { id: 'incision', title: 'Incision', skill: 'Precision cutting', difficulty: 1,
    brief: 'Cut along the marked line on the tissue pad.',
    objective: 'Follow the line from start to end at a steady depth.',
    controls: ['Mouse: move the scalpel', 'Hold left click: cut', 'Hold SHIFT: steady breath (drains focus)', 'Esc: pause'],
    scoring: 'Deviation from the line (mm), depth control and time. Accuracy is the largest share.' },
  { id: 'suture', title: 'Suture', skill: 'Needle driving', difficulty: 2,
    brief: 'Drive a curved needle through entry and exit points in order.',
    objective: 'Pass the needle through each marked pair, in sequence, without tearing tissue.',
    controls: ['Mouse: position the needle driver', 'Click and hold: drive the needle', 'Hold SHIFT: steady breath', 'Esc: pause'],
    scoring: 'Accuracy at each target, tissue trauma (rough or off-axis passes) and time.' },
  { id: 'lap', title: 'Laparoscopy', skill: 'Fulcrum effect and economy of motion', difficulty: 3,
    brief: 'Move beads between posts through a fixed port, avoiding vessels.',
    objective: 'Transfer 3 pegs between posts without touching the red vessels.',
    controls: ['Mouse: move the grasper (motion is mirrored at the port)', 'Click: grasp / release', 'Hold SHIFT: steady breath', 'Esc: pause'],
    scoring: 'Errors (vessel contacts), time and path length (economy of motion).' },
];
const ORDER = ['incision', 'suture', 'lap'];
const SURGERIES = [
  { id: 'appendectomy', title: 'Appendectomy', skill: 'Full procedure, 5 steps', difficulty: 3, surgery: true,
    brief: 'Remove an inflamed appendix on a training mannequin. Incise, locate, clamp, cut and close, using every skill from the drills.',
    objective: 'Follow the step banner at the top. Keep the patient stable.',
    controls: ['Mouse: move the instrument', 'Hold left click: act (cut, grasp, drive)', 'Hold SHIFT: steady breath', 'Esc: pause'],
    scoring: 'Points per step, bonuses for clean work, penalties for errors that raise the patient\'s heart rate.' },
  { id: 'laceration', title: 'Laceration Repair', skill: 'Wound closure, 4 steps', difficulty: 2, surgery: true,
    brief: 'Repair a forearm cut on a training mannequin. Clean, anesthetize, place three sutures and dress the wound.',
    objective: 'Follow the step banner at the top. Even, well-spaced sutures score best.',
    controls: ['Mouse: move the instrument', 'Hold left click: act', 'Hold SHIFT: steady breath', 'Esc: pause'],
    scoring: 'Points per step, suture spacing and accuracy, patient stability.' },
];
const SURG_ORDER = SURGERIES.map(x => x.id);
const isSurgery = id => SURG_ORDER.includes(id);
const GRADE_LABELS = { accuracy: 'Accuracy', precision: 'Precision', depth: 'Depth control', time: 'Time and motion', economy: 'Economy of motion',
  tissue: 'Tissue handling', safety: 'Safety', errors: 'Error avoidance', efficiency: 'Efficiency', control: 'Instrument control' };

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor((s % 1) * 10); };
const letterFor = avg => avg >= 4.5 ? 'A' : avg >= 3.75 ? 'B' : avg >= 3 ? 'C' : avg >= 2 ? 'D' : 'F';
const pretty = k => GRADE_LABELS[k] || String(k).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());

const CONTENT = new URL('../../content/', import.meta.url);
const prettyM = k => String(k).replace(/_mm$/, ' (mm)').replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
async function loadJSON(url, fb) { try { const r = await fetch(new URL(url, CONTENT)); if (!r.ok) throw 0; return await r.json(); } catch { return fb; } }

// first two sentences of a brief, never cut mid-word
function shortBrief(t) {
  const parts = String(t).match(/[^.!?]+[.!?]+(\s|$)/g);
  return parts ? parts.slice(0, 2).join('').trim() : String(t);
}

export function createHUD(root, engine) {
  const ev = engine.events;
  const ui = el('div', 'sh-ui'); root.appendChild(ui);
  let drills = FALLBACK_DRILLS.slice(), facts = [];
  let current = null, paused = false, running = false, t0 = 0, tElapsed = 0, focus = 1, lastProg = { pct: 0, hint: '' }, live = {};
  let resultShown = false;

  const meta = id => drills.find(d => d.id === id) || SURGERIES.find(d => d.id === id) || { id, title: (engine.levels?.[id]?.title) || id };
  Promise.all([loadJSON('drills.json', null), loadJSON('facts.json', []), loadJSON('osats.json', null)]).then(([d, f, o]) => {
    if (o && Array.isArray(o.items)) o.items.forEach(i => { GRADE_LABELS[i.id] = i.name; });
    if (Array.isArray(d) && d.length) {
      drills = ORDER.map(id => ({ ...FALLBACK_DRILLS.find(x => x.id === id), ...(d.find(x => x.id === id) || {}) }));
      renderTitle(); renderHow();
    }
    facts = Array.isArray(f) ? f : [];
  });

  // ---------- screens ----------
  const title = el('section', 'sh-screen sh-title');
  const how = el('section', 'sh-screen sh-how hidden');
  const hud = el('section', 'sh-hud hidden');
  const results = el('section', 'sh-screen sh-results hidden');
  const pause = el('section', 'sh-screen sh-pause hidden');
  ui.append(title, how, hud, results, pause);

  const stars = n => '<span class="sh-diff" title="Difficulty">' + [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') + '</span>';

  function renderTitle() {
    title.innerHTML = `
      <div class="sh-hero">
        <div class="sh-kicker">A SURGICAL SKILLS TRAINER</div>
        <h1>STEADY HANDS</h1>
        <p class="sh-why">Surgeons rehearse these skills thousands of times before touching a patient.</p>
        <div class="sh-row-lbl">Drills</div>
        <div class="sh-cards">${drills.map((d, i) => `
          <button class="sh-card" data-id="${d.id}">
            <div class="sh-card-top"><span class="sh-num">0${i + 1}</span>${stars(d.difficulty || i + 1)}</div>
            <h2>${esc(d.title)}</h2>
            <div class="sh-skill">${esc(d.skill || '')}</div>
            <p>${esc(shortBrief(d.brief || ''))}</p>
            <span class="sh-go">Start drill</span>
          </button>`).join('')}
        </div>
        <div class="sh-row-lbl">Full surgeries</div>
        <div class="sh-cards two">${SURGERIES.map((d, i) => `
          <button class="sh-card surg" data-id="${d.id}">
            <div class="sh-card-top"><span class="sh-num">S${i + 1}</span>${stars(d.difficulty)}</div>
            <h2>${esc(d.title)}</h2>
            <div class="sh-skill">${esc(d.skill)}</div>
            <p>${esc(d.brief)}</p>
            <span class="sh-go">Start surgery</span>
          </button>`).join('')}
        </div>
        <button class="sh-btn ghost" data-act="how">How to play</button>
      </div>`;
    title.querySelectorAll('.sh-card').forEach(b => b.onclick = () => startDrill(b.dataset.id));
    title.querySelector('[data-act=how]').onclick = () => show(how);
  }
  function renderHow() {
    const c = ['Mouse / trackpad to move the instrument.', 'Hold SHIFT for a steady breath: tremor drops, but your focus meter drains.', 'P or Esc pauses.'];
    how.innerHTML = `
      <div class="sh-panel wide">
        <div class="sh-panel-head"><h2>How to play</h2><button class="sh-btn ghost" data-act="back">Back</button></div>
        <p class="sh-lead">Your hands shake slightly, as everyone's do. Complete each drill accurately; you are graded on an OSATS-style 1 to 5 scale, the same kind of rubric used in real surgical training.</p>
        <div class="sh-grid3">
          <div class="sh-box"><h3>Global controls</h3><ul>${c.map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div class="sh-box"><h3>Focus meter</h3><ul><li>Shown in the HUD while you play.</li><li>SHIFT steadies the instrument and drains focus.</li><li>Release SHIFT to recover. Use it on the delicate parts.</li></ul></div>
          <div class="sh-box"><h3>Grading</h3><ul><li>Each skill item is scored 1 to 5.</li><li>The average sets your letter grade, A to F.</li><li>Every result shows a real-world fact about why the skill matters.</li></ul></div>
        </div>
        <div class="sh-grid3 drills">${drills.map(d => `
          <div class="sh-box drill"><h3>${esc(d.title)} <small>${esc(d.skill || '')}</small></h3>
            <div class="sh-lbl">Objective</div><p>${esc(d.objective || d.brief || '')}</p>
            <div class="sh-lbl">Controls</div><ul>${[].concat(d.controls || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="sh-lbl">Scoring</div><p>${esc(d.scoring || '')}</p></div>`).join('')}
        </div>
      </div>`;
    how.querySelector('[data-act=back]').onclick = () => show(title);
  }
  hud.innerHTML = `
    <div class="sh-top">
      <div class="sh-obj"><div class="sh-drill-name" id="shName"></div><div class="sh-objective" id="shObj"></div></div>
      <div class="sh-stats">
        <div class="sh-stat"><div class="v" id="shTime">0:00.0</div><div class="l">Time</div></div>
        <div class="sh-stat"><div class="v" id="shAcc">--</div><div class="l">Accuracy</div></div>
      </div>
    </div>
    <div class="sh-bottom">
      <div class="sh-hint" id="shHint"></div>
      <div class="sh-meters">
        <div class="sh-focus"><div class="l"><span>Focus</span><kbd>SHIFT</kbd><span class="st" id="shSt">steady breath</span></div>
          <div class="sh-bar"><div id="shFocus"></div></div></div>
        <div class="sh-prog"><div class="l"><span>Progress</span><span id="shPct">0%</span></div>
          <div class="sh-bar"><div id="shProg"></div></div></div>
      </div>
      <div class="sh-esc"><kbd>P</kbd> / <kbd>Esc</kbd> pause</div>
    </div>`;
  const $ = id => hud.querySelector('#' + id);

  function show(...scr) {
    [title, how, hud, results, pause].forEach(s => s.classList.add('hidden'));
    scr.forEach(s => s.classList.remove('hidden'));
    ui.classList.toggle('in-game', scr.includes(hud));
  }

  function startDrill(id) {
    resultShown = false; paused = false;
    if (engine.loadLevel) engine.loadLevel(id); else if (window.game?.start) window.game.start(id);
    beginHUD(id);
  }
  function beginHUD(id) {
    current = id; const d = meta(id);
    $('shName').textContent = d.title; $('shObj').textContent = d.objective || d.brief || '';
    $('shHint').textContent = ''; lastProg = { pct: 0, hint: '' }; live = {};
    focus = 1; t0 = performance.now(); tElapsed = 0; running = true; paused = false;
    show(hud);
    ui.classList.toggle('surgery', isSurgery(id));
  }
  function toMenu() {
    running = false; paused = false; current = null;
    try { if (window.game?.menu) window.game.menu(); else engine.unloadLevel?.(); } catch (e) { console.warn(e); }
    show(title);
  }
  function nextId() { const o = isSurgery(current) ? SURG_ORDER : ORDER; const i = o.indexOf(current); return o[(i + 1) % o.length]; }

  // ---------- results ----------
  function normGrade(g, metrics) {
    let items = {}, overall = null, letter = null;
    if (typeof g === 'number') overall = g;
    else if (g && typeof g === 'object') {
      const src = g.items || g.scores || g.osats || g;
      for (const [k, v] of Object.entries(src)) {
        const n = typeof v === 'object' ? (v.score ?? v.value) : v;
        if (typeof n === 'number' && !['overall', 'total', 'average', 'avg'].includes(k)) items[k] = n;
      }
      overall = g.overall ?? g.average ?? g.avg ?? g.total ?? null; letter = g.letter ?? g.grade ?? null;
      if (typeof overall !== 'number') overall = null;
      if (typeof letter !== 'string') letter = null;
    }
    const vals = Object.values(items);
    if (overall == null && vals.length) overall = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!letter) letter = overall != null ? letterFor(overall) : '-';
    return { items, overall, letter };
  }
  function fmtMetric(k, v) {
    if (typeof v === 'object' && v) return esc(v.display ?? v.value ?? JSON.stringify(v));
    if (typeof v === 'number') {
      if (/time|duration/i.test(k)) return v.toFixed(1) + ' s';
      if (/acc|pct|percent/i.test(k)) return (v <= 1 ? v * 100 : v).toFixed(0) + '%';
      if (/mm/i.test(k)) return v.toFixed(2) + ' mm';
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return esc(v);
  }
  function showResults({ id, metrics = {}, grade }) {
    resultShown = true; running = false; id = id || current; current = id;
    const g = normGrade(grade, metrics), d = meta(id);
    const fl = facts.filter(f => f.drill === id), fact = fl.length ? fl[Math.floor(Math.random() * fl.length)] : null;
    const rows = Object.entries(metrics).filter(([k]) => !k.startsWith('_')).map(([k, v]) =>
      `<tr><td>${esc(prettyM(k))}</td><td>${fmtMetric(k, v)}</td></tr>`).join('');
    const bars = Object.entries(g.items).map(([k, v]) => `
      <div class="sh-grow"><span class="n">${esc(pretty(k))}</span>
        <span class="b"><i style="width:${Math.max(0, Math.min(5, v)) / 5 * 100}%"></i></span><span class="s">${v}/5</span></div>`).join('');
    results.innerHTML = `
      <div class="sh-panel results">
        <div class="sh-panel-head"><div><div class="sh-kicker">${esc(d.title)} complete</div><h2>Results</h2></div>
          <div class="sh-letter"><div class="big">${esc(g.letter)}</div><div class="l">${g.overall != null ? g.overall.toFixed(1) + ' / 5' : 'overall'}</div></div></div>
        <div class="sh-cols">
          <div><h3>Metrics</h3><table class="sh-table">${rows || '<tr><td>No metrics</td><td></td></tr>'}</table></div>
          <div><h3>OSATS-style grade</h3>${bars || '<p class="muted">No grade items.</p>'}</div>
        </div>
        ${fact ? `<div class="sh-fact"><div class="sh-lbl">Why this matters</div><p>${esc(fact.fact)}</p><div class="src">Source: ${esc(fact.source || '')}</div></div>` : ''}
        <div class="sh-actions"><button class="sh-btn primary" data-a="retry">Retry</button>
          <button class="sh-btn" data-a="next">Next drill</button><button class="sh-btn ghost" data-a="menu">Menu</button></div>
      </div>`;
    results.querySelector('[data-a=retry]').onclick = () => startDrill(current);
    results.querySelector('[data-a=next]').onclick = () => startDrill(nextId());
    results.querySelector('[data-a=menu]').onclick = toMenu;
    show(results);
  }

  // ---------- pause ----------
  pause.innerHTML = `<div class="sh-panel narrow"><h2>Paused</h2><p class="muted">Take a breath.</p>
    <div class="sh-actions col"><button class="sh-btn primary" data-a="resume">Resume</button><button class="sh-btn" data-a="retry">Restart drill</button>
    <button class="sh-btn ghost" data-a="menu">Menu</button></div></div>`;
  function setPause(p) {
    if (!running) return; paused = p;
    if (p) { pause.classList.remove('hidden'); tElapsed += (performance.now() - t0) / 1000; }
    else { pause.classList.add('hidden'); t0 = performance.now(); }
    engine.paused = p; if (engine.clock) { try { p ? engine.clock.stop() : engine.clock.start(); } catch {} }
    ev.dispatchEvent(new CustomEvent('ui:pause', { detail: { paused: p } }));
  }
  pause.querySelector('[data-a=resume]').onclick = () => setPause(false);
  pause.querySelector('[data-a=retry]').onclick = () => { pause.classList.add('hidden'); setPause(false); startDrill(current); };
  pause.querySelector('[data-a=menu]').onclick = () => { pause.classList.add('hidden'); engine.paused = false; toMenu(); };
  addEventListener('keydown', e => { if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && running) setPause(!paused); });

  // ---------- engine events ----------
  const det = e => e.detail ?? e;
  ev.addEventListener('level:start', e => { const d = det(e); if (!resultShown || d.id !== current || !running) beginHUD(d.id || current); });
  ev.addEventListener('level:progress', e => {
    const d = det(e); lastProg = { pct: d.pct ?? lastProg.pct, hint: d.hint ?? lastProg.hint };
    for (const k of ['accuracy', 'focus']) if (typeof d[k] === 'number') live[k] = d[k];
    if (d.metrics && typeof d.metrics.accuracy === 'number') live.accuracy = d.metrics.accuracy;
  });
  ev.addEventListener('level:score', e => showResults(det(e)));
  ev.addEventListener('level:end', () => {});
  ev.addEventListener('game:menu', () => { running = false; paused = false; current = null; ui.classList.remove('surgery'); show(title); });

  // ---------- frame loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (running && !paused) {
      const steady = !!engine.input?.steady;
      if (typeof engine.input?.focus === 'number') focus = engine.input.focus;
      else if (typeof live.focus === 'number') focus = live.focus;
      else focus = Math.max(0, Math.min(1, focus + (steady && focus > 0 ? -0.22 : 0.12) * dt));
      const t = tElapsed + (now - t0) / 1000; $('shTime').textContent = fmtTime(t);
      let acc = live.accuracy; if (acc == null) { try { acc = window.game?.state?.()?.metrics?.accuracy; } catch {} }
      $('shAcc').textContent = typeof acc === 'number' ? Math.round(acc <= 1 ? acc * 100 : acc) + '%' : '--';
      $('shFocus').style.width = (focus * 100).toFixed(0) + '%';
      $('shFocus').classList.toggle('low', focus < 0.2);
      $('shSt').textContent = steady && focus > 0 ? 'steady' : focus <= 0.01 ? 'exhausted' : 'tremor active';
      $('shProg').style.width = Math.round((lastProg.pct <= 1 ? lastProg.pct * 100 : lastProg.pct)) + '%';
      $('shPct').textContent = Math.round(lastProg.pct <= 1 ? lastProg.pct * 100 : lastProg.pct) + '%';
      $('shHint').textContent = lastProg.hint || '';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  renderTitle(); renderHow(); show(title);
  return { show: () => show(title), toMenu, startDrill, showResults, dispose() { ui.remove(); } };
}
