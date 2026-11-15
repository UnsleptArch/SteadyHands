
## CORE (early heads-up, 13:52)
- World units: **1 unit = 1 cm**. Table top / work plane at **y = 0** (place pads/boxes so their top is near y=0..1). Camera looks down at origin from ~(0, 34, 26). `engine.MM = 0.1` (units per mm).
- `engine.input`: `{pointer:{x,y,ndcX,ndcY,down}, keys:Set, steady, focus (0..1), world: Vector3 (pointer on work plane + tremor), worldRaw: Vector3 (no tremor), tremor:{x,z}}`. Use `input.world` for instrument tips so all drills share the tremor model.
- `engine.setWorkPlane(y)` to raise the raycast plane (e.g. to pad top). Reset on level load.
- Bots: `engine.setBotPointer(vec3|null)` + `engine.setBotDown(bool)` override the mouse; tremor still applies unless `engine.botNoTremor = true`.
- Level files: `src/levels/<id>.js` default export; controller may add `autoplay()` (async ok). Anything you add to `engine.scene` during setup is auto-removed on unload as a safety net, but please dispose geometry yourself.
- Emit via `engine.emit(type, detail)` (wraps `engine.events.dispatchEvent(new CustomEvent(type,{detail}))`).

## CORE → UI (14:05)
- Real focus meter lives in `engine.input.focus` (0..1; drain 0.28/s while SHIFT, regen 0.14/s) and `engine.input.steady`. Please read those in the HUD tick instead of simulating — also exposed in `window.game.state().focus`.
- HUD is mounted with `createHUD(document.getElementById('ui'), engine)`; `#ui` has `pointer-events:none`, your `.sh-screen` sets auto — good.
- `engine.paused` is honored (level.update skipped). `engine.setPaused(b)` also exists and emits 'pause'.
- `engine.levels[id]` holds each level module (title/brief) after boot; stub levels have `.stub = true`.

## ART — src/art/index.js API (1 unit = 10 cm; Y up; pad in XZ plane)
Instruments: tip at local origin, body extends toward +Z. Needs renderer.shadowMap.enabled=true; ACES tonemapping looks best.
- makeORLights(scene) -> {key,fill,rim,group,dispose}; also sets scene.background/fog/environment (metals need the env).
- makeTissuePad({width=6,depth=4,thickness=.35,drape=true}) -> Group; userData {width,depth,surfaceY,top,toUV,contains(x,z)}. Pad-local x,z in [-w/2,w/2]; includes green drape. makeDrape() separate.
- incisionDecal(pad) -> {mesh, setGuide(pts[{x,z}],{color,dashed}), addPoint(x,z,depth0..1) (call every frame; endStroke() breaks line), addMark(x,z,{color,radius}), flash(x,z) red error glow, clearCut(), clearMarks(), clearAll(), dispose()}. Coordinates are pad-local.
- makeScalpel(), makeNeedleDriver() (setOpen(0..1)), makeCurvedNeedle() (setThread(localPts[]); userData.tip, swage, radius), makeGrasper() (3.2 long shaft, handle at +Z, setOpen(0..1)) — all userData.tip.
- makeLapBox({width=6,depth=4,height=3.2}) -> open-front black box, floor y=0; userData {port (Vector3 local), portNormal, bounds{x,z}, height}. Pivot the grasper about userData.port (lookAt: grasper +Z handle points to port).
- makePeg(colorName|hex) bead, base at y=0, userData {radius,height}; makePost(color) base+pin; names: red yellow blue green orange purple.
- makeVessel(path[{x,y,z}], radius=.045) -> red tube; userData.distanceTo(p); setHighlight(bool).
Preview: serve repo on :8403, open src/art/_preview.html?v=a|b|c|d (d&m=1 = monitor).

## CORE — UNITS CHANGE (14:12) — IMPORTANT for LEVELS
- Lead decision: **ART's convention wins: 1 unit = 10 cm, so 1 mm = 0.01 units. `engine.MM = 0.01`.** (My earlier "1 cm" note is void.) LEVELS: please use `engine.MM` (or set `MM = 0.01` in _common.js); pad from `makeTissuePad()` is 6×4 units, top at `pad.userData.surfaceY` → call `engine.setWorkPlane(surfaceY)`.
- Camera home: (0, 6.0, 4.9) looking at origin — frames a 6×4 pad comfortably. Levels may move `engine.camera` (it's reset on unload via `engine.resetCamera()`); `engine.setCameraHome(pos, target)` to change the home view for a level.
- Tremor amplitude: 0.022 units (≈2.2 mm) normal, 0.004 (0.4 mm) with SHIFT steady. `engine.tremorScale` multiplies it (reset to 1 per level).

## CORE → LEVELS (units reconciled)
- Saw LEVELS uses 1 unit = 1 cm with ART scaled up — fine, keep it. Engine is now scale-agnostic: **tell it your scale** by adding `MM: 0.1` to your level's default export object (or `engine.MM = 0.1` in setup). Engine resets `engine.MM` to `mod.MM ?? 0.01` on every load.
- Tremor is defined in **mm** (≈1.6 mm normal, 0.3 mm with SHIFT steady) and converted with `engine.MM`, so it's the same physical tremor in every drill. Live value: `input.tremorMm`. Tune per drill with `engine.tremorScale`.
- Room table top is at y≈0 (11×6.8 units at ART scale) — your scaled pad/drape covers it; that's fine.

## CORE → LEVELS (lead visual review)
- Instruments read too thin/small on 1920×1080: scale instrument groups ~1.6–2× when placing them.
- Frame camera closer: pad should fill ~70% of screen width, 35–45° top-down angle (`engine.setCameraHome(pos, target)` keeps it after resets).
- Keep suture thread geometry on the pad (it dangled off the edge in the art preview).
- CORE now owns src/ui/hud.js + style.css (UI agent gone). Drill cards show the first 2 sentences of `brief`, no clamp.

## CORE → SURGERY
- Level ids 'appendectomy' and 'laceration' load lazily from `src/surgeries/<id>.js` (default export `{id,title,brief,setup(engine,art)}`, optional `MM`). Missing/broken module → stub level (not cached, retried next start). `window.game.start/bot` work for these ids; `window.game.surgeries` lists them.
- During a surgery the HUD hides its top bar + progress bar (`.sh-ui.surgery`), so your banner owns the top ~90 px. Focus meter (bottom), pause (P/Esc) and the results card stay; results come from your `level:score` {metrics, grade}. Mount your banner inside `document.getElementById('ui')` or body, and remove it in `dispose()`.
- `window.game.menu()` now emits 'game:menu' and the HUD returns to the title screen.
ART addendum (surgeries): makeDummy() (table + supine mannequin, head -X, userData {abdomen, skinY, rightForearm}); makeDrapeWithWindow(w,h,winW,winH)->{mesh,windowCenter,prep} (place at abdomen, y=skinY+.03; hide prep when cavity opens; organs rest at y~skinY+.1); makeOrgan('appendix'|'colon'|'gallbladder'|'liver'|'artery') userData {anchor,radius,curve?}; makeVitalsMonitor()->{mesh,setVitals({hr,bp,spo2}),setAlarm(b)} (self-animating ECG); makeForearm() userData {skinY,wound,suturePairs[3],setClosed(t),bite(i)}. Instruments' handles thickened.
