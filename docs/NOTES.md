
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
ART revision: dummy arms now attached at sides; drape follows body (mesh local y=0 = drape level; set mesh.position = dummy.userData.abdomen). Drape result: {mesh, prep (tan skin patch, visible by default, hide on incision), cavity, cavityY (-0.06 local)}. Place organs at y = skinY + cavityY + 0.02. Organ groups are pre-scaled (colon .55, appendix .75): anchor/curve are organ-local, use organ.localToWorld().

## LEVELS (14:12)
- Drills in `src/levels/{incision,suture,lap}.js`, shared helpers in `src/levels/_common.js` (SURGERY agent: reuse `gradeDrill`, `makeReporter`, `runBot`/`makeBot`, `polyline`/`closestOnPolyline`, `Ribbon`, `fromArt`, `fitTo`).
- Scale: engine 1 unit = 1 cm. ART kit is 1 unit = 10 cm, so levels scale ART meshes: pad x(10/6) (=100 mm wide pad), lap kit x4, instruments x2.6–5.
- Each controller: `update/dispose/metrics/autoplay` + `_done`. Bots use `engine.setBotPointer/Down` with `engine.tremorScale = 0.3` (expert hands), restored after.
- Metrics keys match content/osats.json mapping exactly (incision: meanDeviationMm, depthVariability, offLineEvents, pauses, timeSec; suture: meanTargetErrorMm, needleOffCurveMm, traumaEvents, retries, timeSec; lap: vesselTouches, pathLengthRatio, drops, missedGrasps, timeSec). Extras: `accuracy` (0..1), completionPct, spacingSdMm, pathLengthCm, etc.
- `level:score` grade = `{items:{"Respect for tissue":4,...}, overall, letter (A–E from osats.json grades), text, detail[]}`. `level:progress` carries `{pct, hint, accuracy}`.
- Mechanics: incision depth = f(hand speed): lingering sinks the blade (>5 mm "too deep"), rushing = scratch. Suture: press on entry dot, sweep pointer along the dashed X-ray arc (screen-space tracking of the needle tip's path); off-curve >3 mm or backing out = tissue trauma; releasing early = retry. Lap: tip = centre − 0.85·(hand − centre) (fulcrum inversion + scaling), hold = jaws closed; two vessels form a chicane.
- Lap level adds a small DOM overlay div for the red error vignette (removed on dispose).
- CORE: drills (src/levels) default to `engine.MM = 0.1` automatically (1 unit = 1 cm); surgeries default to 0.01 (ART scale) unless the module exports `MM`. Tremor is ≈1.6 mm in every mode.

## SURGERY → CORE (integration)
- `src/surgeries/appendectomy.js` (6 steps) and `src/surgeries/laceration.js` (4 steps): default `{id,title,brief,MM:0.01,setup}`; controller `{update,dispose,metrics,autoplay,_done}`. Loaded via your SURGERY_IDS path — nothing else needed.
- Each level mounts its own top banner (`src/surgeries/banner.js`, `.sgb` fixed top-center, z-index 40, inside `#ui`) and removes it on dispose. Shared machinery in `steps.js` (step machine, mechanics, OSATS grading), `vitals.js`.
- Flow: ~1.6 s intro (wide shot) → steps (camera tweens per step) → summary card in banner ("Patient stable — discharged in 24 h") → `level:score` emitted ~4.2 s after the last step (summary is removed then so it doesn't overlap your results card). `autoplay()` resolves after that.
- `level:score` metrics: totalScore, timeSec, tissueErrors, missedActions, retries, meanPrecisionMm, instabilityPct, minStabilityPct, stepsCompleted, accuracy. grade = {items, overall, letter, text, detail, totalScore}. `level:progress` {pct, hint} per step.
- linux3 testing: the Vulkan flags from linux3_testing.md give CONTEXT_LOST / shader VALIDATE_STATUS errors for every level (even incision). `--use-angle=swiftshader --enable-unsafe-swiftshader` works there (slower).
