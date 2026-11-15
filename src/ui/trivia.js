// Steady Hands trivia: self-contained full-screen quiz overlay. openTrivia() / closeTrivia()
const N = 10;
let bank = null, root = null, onKey = null;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rating = s => s >= 9 ? ['Attending', 'Ready to run the list.'] : s >= 7 ? ['Resident', 'Solid. A few more cases and you are there.'] : s >= 4 ? ['Med student', 'Good start. Keep reading.'] : ['First day', 'Everyone starts somewhere. Try again.'];

async function loadBank() {
  if (bank) return bank;
  const r = await fetch(new URL('../../content/trivia.json', import.meta.url));
  bank = await r.json();
  return bank;
}

export function closeTrivia() {
  if (onKey) removeEventListener('keydown', onKey, true);
  onKey = null;
  if (root) root.remove();
  root = null;
}

export async function openTrivia() {
  closeTrivia();
  root = document.createElement('section');
  root.className = 'sh-trivia';
  document.body.appendChild(root);
  onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeTrivia(); } };
  addEventListener('keydown', onKey, true);
  let qs;
  try { qs = shuffle(await loadBank()).slice(0, N); }
  catch (e) { console.warn('[trivia] bank failed', e); closeTrivia(); return; }
  if (!root) return;
  const st = { i: 0, score: 0, streak: 0, best: 0 };
  const panel = document.createElement('div');
  panel.className = 'sh-panel sh-tv';
  root.appendChild(panel);

  function head(right) {
    return `<div class="sh-panel-head"><div><div class="sh-kicker">SURGICAL TRIVIA</div><h2>${right}</h2></div><button class="sh-btn ghost" data-a="close">Back to menu</button></div>`;
  }
  function wire() { const c = panel.querySelector('[data-a=close]'); if (c) c.onclick = closeTrivia; }

  function renderQ() {
    const q = qs[st.i];
    const opts = shuffle(q.options.map((t, k) => ({ t, ok: k === q.answer })));
    panel.innerHTML = head(`Question ${st.i + 1} <span class="muted">/ ${qs.length}</span>`) + `
      <div class="sh-tv-stats"><span><b>${st.score}</b> score</span><span><b>${st.streak}</b> streak</span></div>
      <div class="sh-bar sh-tv-bar"><div style="width:${(st.i / qs.length) * 100}%"></div></div>
      <p class="sh-tv-q">${esc(q.q)}</p>
      <div class="sh-tv-opts">${opts.map((o, k) => `<button class="sh-tv-opt" data-k="${k}"><span class="sh-num">${'ABCD'[k]}</span>${esc(o.t)}</button>`).join('')}</div>
      <div class="sh-tv-fb hidden"></div>`;
    wire();
    const btns = [...panel.querySelectorAll('.sh-tv-opt')];
    btns.forEach(b => b.onclick = () => {
      if (panel.dataset.answered) return;
      panel.dataset.answered = '1';
      const pick = opts[+b.dataset.k];
      btns.forEach((x, k) => { x.disabled = true; if (opts[k].ok) x.classList.add('ok'); });
      if (pick.ok) { st.score++; st.streak++; st.best = Math.max(st.best, st.streak); }
      else { b.classList.add('bad'); st.streak = 0; }
      panel.querySelector('.sh-tv-stats').innerHTML = `<span><b>${st.score}</b> score</span><span><b>${st.streak}</b> streak</span>`;
      const fb = panel.querySelector('.sh-tv-fb');
      fb.classList.remove('hidden');
      fb.innerHTML = `<div class="sh-fact"><p><b class="${pick.ok ? 'sh-tv-good' : 'sh-tv-err'}">${pick.ok ? 'Correct.' : 'Not quite.'}</b> ${esc(q.explain)}</p><div class="src">${esc(q.source || '')}</div></div>
        <div class="sh-actions"><button class="sh-btn primary" data-a="next">${st.i + 1 < qs.length ? 'Next question' : 'See results'}</button></div>`;
      const nx = fb.querySelector('[data-a=next]');
      nx.onclick = () => { delete panel.dataset.answered; st.i++; st.i < qs.length ? renderQ() : renderEnd(); };
      nx.focus();
    });
  }

  function renderEnd() {
    const [r, line] = rating(st.score);
    panel.innerHTML = head('Results') + `
      <div class="sh-letter"><div class="big">${st.score}<span class="muted" style="font-size:48px"> / ${qs.length}</span></div>
      <h2 class="sh-tv-rank">${r}</h2><p class="muted">${line} Best streak: ${st.best}.</p></div>
      <div class="sh-actions" style="justify-content:center"><button class="sh-btn primary" data-a="retry">Retry</button><button class="sh-btn ghost" data-a="menu">Back to menu</button></div>`;
    wire();
    panel.querySelector('[data-a=retry]').onclick = () => openTrivia();
    panel.querySelector('[data-a=menu]').onclick = closeTrivia;
  }
  renderQ();
}
