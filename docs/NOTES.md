
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

## CORE — GPU blank-canvas bug: ROOT CAUSE + FIX
- Root cause: on headless NVIDIA + ANGLE/Vulkan (linux3), **any three.js shadow map** (even a vanilla cube + DirectionalLight.castShadow, no ART code) makes the GPU process drop the WebGL context → "Shader Error 0/1282 VALIDATE_STATUS false" + blank canvas. Not our materials. Shadows off → renders fine. AMD iGPU via `--use-angle=gl-egl` renders WITH shadows fine.
- Fix (src/core/engine.js): `webglcontextlost` handler rebuilds the renderer on a fresh canvas with shadow maps off ("safe mode"), re-binds input, keeps scene/level state; emits 'renderer:reset'. `?safe=1` forces safe mode from the start (no boot error logged). `engine.safeMode` tells you which.
- Recording on linux3: either `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu` (AMD GPU, shadows ON, best look) or the Vulkan flags + `http://localhost:PORT/?safe=1` (RTX, no shadows).

## CORE → LOOK
- GPU white screen: cause + engine fix are in the "GPU blank-canvas bug" section above (it's shadow maps on headless NVIDIA/Vulkan, not shaders; already handled in engine.js via auto safe mode / `?safe=1`). Nothing to fix in src/art for it. If you want shadows on the RTX recording, that's a driver issue — use the gl-egl flags instead.
- src/core/room.js is yours for scene dressing (table, floor, lamp head, drape via art.makeDrape). Keep `buildRoom(scene, art)` returning `{group, lights, update}` and the table top at y≈0 (ART scale). Engine only calls `scene.environment = makeEnvironment(renderer)` if ART's makeORLights didn't set one.

## LEVELS (14:42) — patient framing + status
- Incision + suture now run on the patient: `buildPatientField()` in `_common.js` uses `art.makeSurgicalField({w:6,h:4})` scaled to a 100 mm field (falls back to makeDummy + makeDrapeWithWindow + pad, then to a bare box). Camera (0,10.4,8.6)->(0,0,0.3), ~50° overhead, field ≈75% of frame width.
- LOOK: in headless GPU (safe mode, no shadows) the field's surrounding drape renders black/invisible on linux3 — please check buildDrape lighting/material.
- Lap hides the CORE room meshes while active (`hideRoom(engine)`, restored on dispose) — the OR table z-fought the box floor (black blob). Added a contact-shadow blob under the jaws as a depth cue.
- Verified on linux3 (GPU, 61 fps): all three bots finish with grade A (incision 0.16 mm, suture 0.3 mm target error, lap 0 touches / ratio 1.11). Real-mouse playthrough of incision via Playwright mouse also completes.

## LOOK (14:55) — grounded-realism restyle (src/art/*, src/core/room.js)
- `makeSurgicalField({w=6,h=4,surfaceY=.35,drape=true,prep=true})` -> {mesh, surfaceY, toLocal(x,z)->[x,z] (+.x/.z), userData}. mesh.userData matches the old pad (width/depth/surfaceY/top/toUV/contains) so `incisionDecal(mesh)` works. `makeTissuePad()` = alias returning the field Group.
- Exports for others: `makeSkinMaterial({w,h,prep,repeat})` (warm skin + optional Betadine tint), `prepSkinMaterial(w,h)` (cached; SURGERY: please use it for the appendectomy skin halves instead of the flat tan `prepMat`: `art.prepSkinMaterial?.(WIN_W, WIN_H/2) ?? prepMat`).
- `makeDrapeWithWindow` is now a full-body blue drape (neck->feet, hangs over table sides, anaesthesia screen at the head, x≈-4.75 local); same return shape. Cavity walls = yellow subcutaneous fat, moist floor.
- Materials: MeshStandardMaterial only, no DoubleSide on drapes (gl_FrontFacing flip on ANGLE/Vulkan made them black in safe mode). One shadow-casting SpotLight (key). HDRI env: assets/hospital_room_2.hdr (Poly Haven CC0, 1k) via RGBELoader, fallback gradient.
- Vignette: DOM div #sh-vignette inserted before #ui by room.js.
- SURGERY (RECBOT): `game.engine.currentLevel.controller.targets()` → `{step, title, ready, plane, mirrored, targets:[{label, p:{x,y,z}, screen:{x,y}, holdSec?}]}` for the current step, in action order (labels: press-start/path/end for cuts, handleN-grab/drop, clickN, stitchN-press/release, press-and-hold, rub, drag-from/drop-on, hand-press-and-hold for the mirrored grasper). Wait for `ready:true` between steps (~1.2 s transition).

## RECBOT (demo recording)
- `src/main.js`: one guarded line in boot(): `?democursor=1` dynamically imports `src/ui/cursor.js` (visible crosshair for headless video). No other core change.
- Demo bot drives real mouse/keyboard; it reuses each level's `autoplay()` as a path planner by swapping `engine.setBotPointer/setBotDown` at runtime (see docs/RECORDING.md). Keep `autoplay()` working in new surgeries and they'll be recordable automatically.

## PATIENT (15:00) — new patient body (makeDummy -> makePatient)
- `src/art/patient.js` `makePatient()`; LOOK: `makeDummy()` body is now just `return makePatient()` (same userData: abdomen (-0.5,1.8,0), skinY 1.8, torsoHalfWidth, rightForearm, kind).
- Adult proportions (head -X, right side +Z), arms out on arm boards (pulse-ox + IV line), head on gel ring with cap + ET tube behind the anaesthesia screen.
- When a `makeDrapeWithWindow()` mesh sits at the patient's abdomen, the patient hides only that drape's flat *surface* (its hem, prep, cavity and screen bar stay) and builds a body-conforming drape with the same material + window: chest/abdomen/legs contour, feet tent, screen rising to the bar, draped arms. No API change for surgeries.

## CORE — free camera (src/core/freecam.js)
- User offset layered on the level's framing (levels unchanged): WASD pan, Q/E zoom out/in, right-drag orbit, wheel zooms ONLY while right button held (plain wheel still reaches levels), C reset; auto-reset on level start; off in menus/pause. Pitch clamped above the table; max zoom-out ≈2.4 m in ART-scale scenes (whole OR).
- Detection: if a level/tick moves the camera, that pose becomes the new base; the offset is applied just before render, so input raycasts use the visible camera.
- Keys disabled for 'central_line' (it uses Q/E/WASD); any level can opt out with `cameraKeys: false` in its default export (right-drag still works).
- API: `window.game.camera.reset(snap?)`, `.set({yaw,pitch,dist,pan:[x,z]}, snap?)` (yaw/pitch = rad offsets, dist = multiplier, 1 = level framing), `.get()`, `await .orbitTo({...}, seconds)` (eased). Test: tests/core_cam.py (GPU egl on linux3).

## PLAYTEST: drills with a noisy simulated human (14:50, linux3, gl-egl AMD, 1280x720)
Script: `tests/playtest_drills.py` (real `page.mouse`/keyboard; AR(1) Gaussian pointer noise 3-6 px, +-30% speed wobble, 0.6-1.4 s reaction delay, overshoot, 12-50% chance of releasing early, SHIFT on in ~half the runs, real clicks on title cards/Retry/Next/Menu). `--framesync` paces the hand by page frames (needed on loaded linux3, see BLOCKER 1). Artifacts: `tests/artifacts/playtest/*.png`.

| drill | doable | 3 attempts (time in game-clock / grade) | where it went wrong |
|---|---|---|---|
| incision | YES (frame-synced); NO in real time on a slow box | 4.4 s B, 3.2 s B, 5.6 s A (mean dev 0.5-0.6 mm) | real-time: 3/3 stuck at 6-8% (BLOCKER 1+2) |
| suture | YES | 8.1 s B, 9.3 s B, 6.8 s A (earlier run: 10.2/10.5 B) | needle not exiting if you release the instant your pointer reaches the far dot (rate-limited 6 samples/frame): counts as a retry; 1-2 tear events when noise >5 px |
| lap | YES | 27 s A, 28 s A, 35 s A (0 touches, 0 drops) | none for a sim that already knows the fulcrum inversion; a real first-timer will be slower (not simulated) |

Checks: all targets (incision line, 4 entry/exit pairs, 6 posts) project on-screen at 1280x720; lap hand range needs mouse x 112-1168, y 190-388 (reachable). HUD objective (top-left) + hint (bottom) are clear and update ("Press and hold on the green dot...", "Bite 1/4: press on the blue entry dot", "Grab a bead: hover the jaws over it..."). Esc and P pause, Esc/Resume/Restart/Menu from pause, results Retry/Next/Menu all work. No console errors. No hard soft-lock found except via BLOCKER 2 below.

PLAYTEST BLOCKER 1 (incision, perf): while the mouse is held and cutting, frame time on linux3 jumps from ~15-60 ms (idle) to ~900 ms/frame (rAF log: `[809,16,17,950,979,860,...]`). Cause is almost certainly `incisionDecal` in `src/art/index.js`: `compose()` redraws 3 canvases of ~2960x1950 px (pxu=300) into a 4th and re-uploads the CanvasTexture every frame the cut is dirty (every frame while cutting). Mouse input then lags ~1 s per event; the real-time simulated player fails 3/3. Repro: start incision on linux3, `page.mouse.down()` on the green dot and move. Fix idea: pxu ~100-120 (or draw cut straight into the output canvas, skip the re-composite, update texture at most every ~50 ms). Owner: LOOK/art (incisionDecal) or LEVELS.

PLAYTEST BLOCKER 2 (incision, progress can freeze): `if (devMm < 6 && c.s <= st.sMax + 1.0) st.sMax = ...` only advances progress while the pointer is within 1 cm (along the line) of the furthest point. If a hitch (see 1) or a fast flick puts the pointer further ahead, sMax freezes forever even though the groove is drawn all the way to the end dot (observed: completionPct 0.07 with the full cut visible, hint "Blade lifted: press again where your cut ended", but resuming requires pressing within 0.8 cm of the old sMax near the START). Looks like a soft-lock to a player. Fix: let sMax jump to c.s when devMm < 4 and c.s - sMax < ~3 cm, or resume at the visible cut end.

Minor: (a) incision depth band is tight: at ~30 mm/s (a normal slow trace) the blade often reads "Too deep" warnings (mean depth 4.2-4.5 mm of a 1.5-5 band) at low fps because dt is clamped at 0.1 s; harmless to completion. (b) Suture release-too-soon gotcha: add a hint such as "Keep holding until the needle exits" in the 'drive' state when k > 0.9N. (c) Lap start hint does not say the controls are inverted until you move; the brief does, the HUD objective doesn't. (d) linux3 was at load ~20 with other agents' Chromiums, idle fps 8-19; timings are game-clock, not wall-clock.
- LOOK (15:05) re user screenshot (mint drape + cream slabs + white cecum): that is SURGERY's *fallback* path (appendectomy.js:48 flat(0x2f8f74) / 0xd9b88a prepMat), taken when an art call threw — a transient ReferenceError in skinCanvas existed for ~1 min around 14:40 (fixed), or a stale browser cache. ART drape/prep factories now never throw (fallback to plain skin). Hard-refresh (Ctrl+Shift+R). SURGERY: please change the fallback drape colour to 0x3e6e8e anyway.
- makeOrgan(kind).userData now also has `size` (organ-local bbox), `worldSize` (after the group's pre-scale) and `bottom` (bottom-centre, organ-local). Sizes (ART units, 1 = 10 cm): appendix group 1.63 x 0.45 x 1.34 (cecum ~0.75 Ø, appendix ~0.9 long), colon 0.21x0.17x0.83?, gallbladder scene 2.44x0.76x1.91, liver 3.8x0.64x1.9, artery 3.35x0.22x0.4. Appendix fits the default 2.8x2.2 window at scale 1 — no need to upscale.
- LEVELS (fix for PLAYTEST BLOCKER 1+2): incision progress now tolerates hitches/flicks (sMax jumps up to 3 cm ahead when within 4 mm of the line), resume works at the visible cut end, and the drill auto-completes when the blade reaches the end dot (mean dev < 4 mm). The cut groove is now a cheap 3D ribbon instead of `incisionDecal.addPoint`, so there is no per-frame canvas recomposite while cutting (the decal only draws the static guide + rare error flashes). Noisy-mouse playtest on linux3 (jitter ±5 px, lift + resume, 6-sample flick): 2/2 complete (B and A). Minor (b) suture "keep holding until the needle tip exits" hint and (c) lap "controls are INVERTED" start hint added.

## ANATOMY: (15:10) — `src/art/anatomy.js` neighbouring-anatomy sets (preview: `tests/_anatomy.html?set=abdomen|field|thorax|neck`)
SURGERY owners: please add the matching set *behind* your interactive organ so an opened body shows real packed anatomy, not a lone organ in a box. Pure add-on, no change to art/index.js. Reply here ("ANATOMY ok for <surgery>") if you want me to wire it in minimally; otherwise just adopt the API.
- `makeAbdomenSet(opts)` → `{group, parts, anchors, bounds, setHighlight(name|null), setOmentum(bool), update(t)}`.
  Place: `set.group.position.copy(drapeResult.mesh.position)` (= abdomen, window centre at skin). Group-local: head −X, patient right +Z, up +Y, real adult proportions (1 = 10 cm) squashed vertically by `flatten` (0.45) so anterior organ tops sit at `topY` (0.03; drape rim 0.12, cavity floor −0.06). **Hide the drape's cavity floor** (`dr.cavity.children[0].visible = false`) — the set brings its own posterior wall. Parts lateral of the flat drape top are auto-sunk so nothing pokes through the drape.
  opts: `{omentum:true, highlight:null|'appendix'|'gallbladder'|<part>, flatten:0.45, topY:0.03, center:'navel'|'rlq'|'ruq'|'appendix'|'gallbladder'|'luq', kidneys:true, bladder:false}` — `center` shifts the set so that anchor is at the window centre (appendectomy: `center:'rlq'` puts cecum + appendix in the window; chole open view: `'ruq'`).
  parts: liver, gallbladder, cysticDuct, stomach, cecum, ascendingColon, transverseColon, descendingColon, sigmoid, epiploicFat, appendix, mesoappendix, smallBowel, omentum, kidneyR/kidneyL (`kidneys[]`), bladder?, posteriorWall, `appendixCurve` (CatmullRom in group space). Hide the set's own `appendix`/`gallbladder` if you keep your own interactive makeOrgan one (`set.parts.appendix.visible=false; set.parts.mesoappendix.visible=false`).
  anchors (group space): rlq/appendixBase, appendix, appendixTip, cecum, ruq/gallbladder, liverEdge, luq/stomach, hepaticFlexure, splenicFlexure, smallBowel, terminalIleum. Sizes (real, before flatten): liver ~2.0×1.0(deep)×2.9, small-bowel packet ~2.3×1.8 (loops r 0.13), colon r 0.25–0.32, appendix 0.6 long r 0.06, gallbladder 0.85 long.
- `makeThoraxSet(opts)` → `{group, parts:{ribs[] (rib2..rib10, userData.k), intercostals, pleura, lung, heart, diaphragm, chestWall?}, setInflation(0..1), update(t), ribZ(k,x)}`. Frame = chest_tube.js: skin y=0 (`group.position.y = Y0`), ribs along X (−X anterior), pitch 0.27 along Z (−Z axilla), `ribZ` identical to chest_tube's. opts `{side:'right'|'left' (heart only shows on left), pitch, slope, z5, ribDepth:0.1, chestWall:true (translucent sheet; false if you draw your own skin), inflation:0}`. Lung collapsed (0) sits ~4 cm deep & medial; 1 = against the pleura.
- `makeNeckSet(opts)` → `{group, parts:{ijv, carotid, scm, clavicle, thyroid, deepBed}, setCompression(0..1), update(t)}`. Frame = central_line.js: skin y=0 (`group.position.set(C.x, skinY, C.z)`), vessels along X (−X cranial, clavicle at x≈1.1), +Z lateral; IJV z+6 mm depth 14 mm (oval 7.2×5 mm), carotid z−8 mm depth 17.5 mm r 4 mm (same VEIN/ART consts; override via `opts.vein/opts.artery` in mm). `update(t)` pulses the carotid, `setCompression(1)` flattens the IJV 85%.

## PLAYTEST: surgeries (15:10, linux3) - progress notes
PLAYTEST BLOCKER S1 (central_line, layout at 1280x720): the ultrasound panel (`.cvl-us`, top:118px, 470 px wide, taller than the viewport) is clipped at the bottom: the DILATOR / WIRE / CATHETER depth gauge row (the only readout for "12-18 cm", "15-25 mm", "14-17 cm") is cut off or half visible, and the Focus meter + the bottom hint caption are covered on the right half. Repro: start central_line at 1280x720, reach step 4/5; gauge row sits at y~715-720+. The panel header also overlaps the banner's right edge (step dots / vitals at y~135). Fix idea: panel `max-height: calc(100vh - 130px)` with the canvas shrinking, or move gauges above the canvas.

## CHOLE (cholecystectomy agent)
- `src/surgeries/cholecystectomy.js`: OR intro (dummy + drape + 4 trocars) -> laparoscopic monitor view of a cavity built at y=-40 (own dome, scope light; OR lights are hidden while inside and restored after). Fulcrum control K=0.85. 5 steps: retract (traction gauge), hook dissection, CVS time-out (CBD decoy = critical + reset), clip 2+1 x2 then cut (Q swaps clip applier/scissors; cutting before clipping = critical), liver-bed trace + extraction. Uses ANATOMY `makeAbdomenSet` via dynamic import (gallbladder/liver/omentum hidden; our interactive liver/GB/ducts on top). Instrument swap in step 4 is X (not Q, which is camera zoom globally); the camera is level-controlled while inside the abdomen.
- SURGERY (15:22): appendectomy now = oblique slit over the appendix in intact prepped skin → retraction gapes an elliptical opening (dermis/fat/fascia walls); ANATOMY `makeAbdomenSet({center:'rlq'})` is always present under the skin (no visibility toggles/pop-in); appendix lifts 5 mm over 1 s on grasp; stump + bowel stay; specimen leaves the field. Bots: appendectomy A (3.8k), laceration A (2.2k), 0 console errors on linux3 (`--use-angle=gl-egl`).

### PLAYTEST re-test (15:25-15:40 EST, linux3 unloaded: idle 61 fps, REAL-time input, no framesync, commit 93ffe51)
- incision: 3/3 done, 2.3 s A, 2.8 s A, 3.4 s A (one early release at 66% recovered by re-pressing). BLOCKER 1 not reproducible at 61 fps (it was linux3 load + the 6 Mpx decal recompose; still worth cheapening for weak laptops). BLOCKER 2 not hit.
- suture: 3/3 done, 11.8 s B, 16.2 s B, 9.3 s A (0-1 tear events; 4 sim "retries" are the release-before-needle-exits gotcha, not counted by the game).
- lap: 1/3 finished (25 s A). Attempts 2 and 3 ended with 2/3 beads moved + 1 drop each: a bead released away from a post falls to the floor and my script does not go back for it (hint says "Dropped! Pick the bead up again"; code lets floor beads be re-grabbed, but this path is NOT verified by the playtest). Not a game bug as far as seen; a first-timer should be told a dropped bead can be picked up (hint exists).
- Pause (Esc/P), Resume, Restart, Menu, results Retry/Next/Menu: all pass. Console errors: none.
