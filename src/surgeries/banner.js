// SURGERY — top-of-screen incentive banner: step, instruction, score, patient stability, floating praise/combos/warnings.
// Minimal clinical style (Inter, teal accent, red only for warnings). Mounted by each surgery level, removed on dispose().

const CSS = `
.sgb{position:fixed;top:18px;left:50%;transform:translateX(-50%);width:min(680px,calc(100vw - 32px));z-index:40;pointer-events:none;
  font-family:Inter,system-ui,-apple-system,sans-serif;color:#e8edf2;-webkit-font-smoothing:antialiased}
.sgb-card{background:rgba(11,15,19,.88);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 20px 14px;
  box-shadow:0 8px 28px rgba(0,0,0,.35);transition:border-color .3s}
.sgb-card.bad{border-color:rgba(229,72,77,.55)}
.sgb-row{display:flex;align-items:center;gap:14px}
.sgb-pill{font-size:15px;font-weight:600;letter-spacing:.04em;color:#0b0f13;background:#3EC5B5;border-radius:999px;padding:3px 11px;white-space:nowrap}
.sgb-title{font-size:25px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sgb-title.swap{animation:sgbSwap .45s ease}
.sgb-score{text-align:right;line-height:1}
.sgb-score small{display:block;font-size:11px;letter-spacing:.12em;color:#8b98a5;font-weight:600;margin-bottom:3px}
.sgb-score b{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:#fff}
.sgb-score b.bump{animation:sgbBump .35s ease}
.sgb-instr{font-size:17px;color:#b9c4ce;margin:8px 0 10px;line-height:1.35;min-height:23px}
.sgb-dots{display:flex;gap:5px;margin-left:2px}
.sgb-dots i{width:22px;height:4px;border-radius:2px;background:rgba(255,255,255,.14)}
.sgb-dots i.done{background:#3EC5B5}.sgb-dots i.cur{background:rgba(62,197,181,.5)}
.sgb-vit{display:flex;align-items:center;gap:12px;font-size:13px;color:#8b98a5;font-weight:500}
.sgb-vit .lab{letter-spacing:.08em;text-transform:uppercase;font-size:11px;font-weight:600;white-space:nowrap}
.sgb-bar{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
.sgb-bar i{display:block;height:100%;width:100%;background:#3EC5B5;border-radius:4px;transition:width .4s ease,background-color .4s}
.sgb-bar i.low{background:#E5484D}
.sgb-num{font-variant-numeric:tabular-nums;color:#e8edf2;font-size:15px;font-weight:600;white-space:nowrap}
.sgb-num.hot{color:#ff8a8d}
.sgb-num em{font-style:normal;color:#8b98a5;font-size:11px;font-weight:600;letter-spacing:.06em;margin-right:4px}
.sgb-toasts{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:10px}
.sgb-t{font-size:22px;font-weight:600;padding:8px 18px;border-radius:10px;background:rgba(11,15,19,.88);border:1px solid rgba(62,197,181,.55);
  color:#3EC5B5;animation:sgbIn .28s ease-out both;white-space:nowrap}
.sgb-t.combo{background:#3EC5B5;color:#0b0f13;border-color:#3EC5B5}
.sgb-t.warn{border-color:rgba(229,72,77,.7);color:#ff9b9e}
.sgb-t.info{border-color:rgba(255,255,255,.14);color:#dfe6ec}
.sgb-t.out{animation:sgbOut .35s ease-in both}
.sgb-sum{margin-top:12px;background:rgba(11,15,19,.92);border:1px solid rgba(62,197,181,.6);border-radius:12px;padding:18px 22px;
  animation:sgbIn .45s ease-out both;text-align:center}
.sgb-sum h2{margin:0;font-size:28px;font-weight:700;color:#3EC5B5}
.sgb-sum p{margin:6px 0 0;font-size:16px;color:#b9c4ce}
.sgb-sum .big{display:flex;justify-content:center;gap:34px;margin-top:12px}
.sgb-sum .big div{line-height:1.1}.sgb-sum .big b{font-size:34px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.sgb-sum .big small{display:block;font-size:11px;letter-spacing:.12em;color:#8b98a5;font-weight:600;margin-top:4px}
@keyframes sgbIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes sgbOut{to{opacity:0;transform:translateY(-6px)}}
@keyframes sgbSwap{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
@keyframes sgbBump{50%{transform:scale(1.12);color:#3EC5B5}}
`;

export function createBanner(parent = document.body) {
  if (!document.getElementById('sgb-style')) {
    const s = document.createElement('style'); s.id = 'sgb-style'; s.textContent = CSS; document.head.appendChild(s);
  }
  const root = document.createElement('div');
  root.className = 'sgb';
  root.innerHTML = `<div class="sgb-card">
      <div class="sgb-row"><span class="sgb-pill" data-k="pill">1/1</span><span class="sgb-title" data-k="title"></span>
        <div class="sgb-score"><small>SCORE</small><b data-k="score">0</b></div></div>
      <div class="sgb-instr" data-k="instr"></div>
      <div class="sgb-vit"><span class="lab">Patient stability</span><div class="sgb-bar"><i data-k="bar"></i></div>
        <span class="sgb-num" data-k="hr"><em>HR</em>72</span><span class="sgb-num" data-k="bp"><em>BP</em>118/76</span>
        <span class="sgb-num" data-k="spo2"><em>SpO₂</em>98%</span><span class="sgb-dots" data-k="dots"></span></div>
    </div><div class="sgb-toasts" data-k="toasts"></div>`;
  parent.appendChild(root);
  const $ = (k) => root.querySelector(`[data-k="${k}"]`);
  const card = root.querySelector('.sgb-card');
  let shownScore = 0, targetScore = 0, raf = 0, alive = true;
  const recent = new Map();

  function tickScore() {
    if (!alive) return;
    if (shownScore !== targetScore) {
      const d = targetScore - shownScore;
      shownScore += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * 0.18));
      if (Math.abs(targetScore - shownScore) < 1) shownScore = targetScore;
      $('score').textContent = Math.round(shownScore).toLocaleString('en-US');
    }
    raf = requestAnimationFrame(tickScore);
  }
  raf = requestAnimationFrame(tickScore);

  function toast(text, kind = 'praise', ms = 1700) {
    // de-duplicate identical messages fired in quick succession
    const now = performance.now();
    if (recent.has(text) && now - recent.get(text) < 1200) return;
    recent.set(text, now);
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'sgb-t ' + kind;
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 380);
    if (kind === 'warn') { card.classList.add('bad'); setTimeout(() => card.classList.remove('bad'), 900); }
  }

  return {
    el: root,
    setStep(i, n, title, instr) {
      $('pill').textContent = `${i}/${n}`;
      const t = $('title'); t.textContent = title; t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap');
      $('instr').textContent = instr || '';
      $('dots').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < i - 1 ? 'done' : k === i - 1 ? 'cur' : ''}"></i>`).join('');
    },
    setInstruction(s) { if ($('instr').textContent !== s) $('instr').textContent = s; },
    setScore(v, bump = true) {
      targetScore = v;
      if (bump) { const b = $('score'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    },
    setVitals({ stability, hr, sys, dia, spo2 }) {
      const bar = $('bar'); bar.style.width = Math.round(Math.max(0.03, stability) * 100) + '%';
      bar.classList.toggle('low', stability < 0.45);
      const h = $('hr'); h.innerHTML = `<em>HR</em>${Math.round(hr)}`; h.classList.toggle('hot', hr > 100);
      $('bp').innerHTML = `<em>BP</em>${Math.round(sys)}/${Math.round(dia)}`;
      $('spo2').innerHTML = `<em>SpO₂</em>${Math.round(spo2)}%`;
    },
    praise(text) { toast(text, 'praise'); },
    combo(text) { toast(text, 'combo', 1900); },
    warn(text) { toast(text, 'warn', 1900); },
    info(text) { toast(text, 'info', 1600); },
    summary({ title, sub, score, grade, extra }) {
      const s = document.createElement('div');
      s.className = 'sgb-sum';
      s.innerHTML = `<h2>${title}</h2><p>${sub || ''}</p><div class="big"><div><b>${score.toLocaleString('en-US')}</b><small>TOTAL SCORE</small></div>
        <div><b>${grade}</b><small>OSATS GRADE</small></div>${extra || ''}</div>`;
      $('toasts').innerHTML = '';
      root.appendChild(s);
    },
    clearSummary() { root.querySelectorAll('.sgb-sum').forEach((e) => e.remove()); },
    dispose() { alive = false; cancelAnimationFrame(raf); root.remove(); },
  };
}
