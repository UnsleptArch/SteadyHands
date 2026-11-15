// CORE — bootstrap: load art + engine + HUD defensively, expose window.game automation API.
let showError = (m) => { console.error(m); };

async function safeImport(path, label) {
  try { return await import(path); }
  catch (err) {
    console.warn(`[core] optional module ${label} not loaded:`, err.message);
    return null;
  }
}

async function boot() {
  const canvas = document.getElementById('scene');
  const uiRoot = document.getElementById('ui');
  const core = await import('./core/engine.js');
  showError = core.showError;

  const artMod = await safeImport('./art/index.js', 'art');
  const art = artMod ? { ...(artMod.default || {}), ...artMod } : {};

  const engine = core.createEngine(canvas, { art });

  // preload level metadata so the HUD can list drills
  await Promise.all(core.LEVEL_IDS.map((id) => engine.getLevelModule(id)));

  // window.game automation API
  const game = {
    ready: false,
    engine,
    levels: core.LEVEL_IDS.slice(),
    surgeries: core.SURGERY_IDS.slice(),
    async start(id) {
      await engine.loadLevel(id);
      return game.state();
    },
    state() {
      const s = engine.status;
      let metrics = s.metrics;
      const c = engine.currentLevel && engine.currentLevel.controller;
      if (!metrics && c && c.metrics) { try { metrics = c.metrics(); } catch { /* ignore */ } }
      return { level: s.level, progress: s.progress, focus: engine.input.focus, steady: engine.input.steady, hint: s.hint, metrics, grade: s.grade, done: s.done, paused: engine.paused, error: s.error };
    },
    menu() {
      engine.unloadLevel();
      engine.emit('game:menu', {});
      return game.state();
    },
    async bot(id) {
      if (id && (!engine.currentLevel || engine.currentLevel.id !== id)) await game.start(id);
      const c = engine.currentLevel && engine.currentLevel.controller;
      if (!c || typeof c.autoplay !== 'function') { console.warn('[core] no autoplay() for', id); return game.state(); }
      engine.emit('game:bot', { id: engine.currentLevel.id });
      await c.autoplay();
      return game.state();
    },
  };
  window.game = game;

  const hudMod = await safeImport('./ui/hud.js', 'ui/hud');
  let hudOk = false;
  if (hudMod && typeof hudMod.createHUD === 'function') {
    try { game.hud = hudMod.createHUD(uiRoot, engine); hudOk = true; }
    catch (err) { console.error('[core] createHUD failed', err); showError('HUD failed: ' + err.message); }
  }
  if (!hudOk) fallbackMenu(uiRoot, engine, game);

  game.ready = true;
  engine.emit('game:ready', {});
  document.body.classList.add('ready');
}

// Minimal menu used only when UI's hud.js is missing/broken.
function fallbackMenu(root, engine, game) {
  const el = document.createElement('div');
  el.id = 'core-menu';
  el.style.cssText = 'position:fixed;inset:0;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
    'font-family:Inter,system-ui,sans-serif;color:#e8edf2;background:rgba(6,8,11,.55);z-index:10';
  el.innerHTML = '<h1 style="font-weight:600;letter-spacing:.02em;margin:0 0 8px">Steady Hands</h1>' +
    '<p style="opacity:.7;margin:0 0 12px">Surgical skills trainer</p>';
  for (const id of game.levels) {
    const b = document.createElement('button');
    b.textContent = (engine.levels[id] && engine.levels[id].title) || id;
    b.style.cssText = 'width:220px;padding:10px;border-radius:6px;border:1px solid #3a4652;background:#1a2129;color:#e8edf2;font:15px Inter,system-ui;cursor:pointer';
    b.onclick = () => game.start(id);
    el.appendChild(b);
  }
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;top:12px;left:12px;font:13px Inter,system-ui;color:#cfd8e0;z-index:11;display:none';
  root.appendChild(el);
  root.appendChild(status);
  engine.on('level:start', () => { el.style.display = 'none'; status.style.display = 'block'; });
  engine.on('level:end', () => { el.style.display = 'flex'; status.style.display = 'none'; });
  engine.on('level:progress', (d) => { status.textContent = `${Math.round((d.pct || 0) * 100)}% — ${d.hint || ''}  [Esc: menu]`; });
  engine.on('level:score', (d) => { status.textContent = `Done! Grade ${d.grade && d.grade.overall} — ${JSON.stringify(d.metrics)}  [Esc: menu]`; });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && engine.currentLevel) game.menu(); });
}

boot().catch((err) => {
  console.error('[core] boot failed', err);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:center;color:#ffd7d7;background:#0b0d10;font:15px/1.5 Inter,system-ui,sans-serif;padding:24px;white-space:pre-wrap';
  el.textContent = 'Steady Hands failed to start:\n' + (err && (err.stack || err.message) || err);
  document.body.appendChild(el);
});
