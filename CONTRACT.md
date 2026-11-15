# STEADY HANDS — surgical skills trainer (High School I/O 2026, Game Dev track "Project Vital Quest")
HARD TIMELINE (EST): playable skeleton 2:25 · all 3 drills playable 2:50 · polish/freeze 3:10 · go/no-go 3:15 · video by 4:15.
Track rules: game must incorporate healthcare; explain mechanics (controls, objectives, actions, scoring/progression);
communicate why the theme matters; creative & functional > polished. Judged older division (18) → be impressive but WORKING.

## Concept
A browser 3D (three.js) trainer for core surgical skills, modelled on real surgical-skills curricula (FLS / OSATS):
- Drill 1 "Incision": cut along a marked line on a tissue pad; score = deviation (mm), depth control, time.
- Drill 2 "Suture": drive a curved needle through entry→exit target pairs in order; score = accuracy, tissue trauma, time.
- Drill 3 "Laparoscopy": control a grasper through a fixed port (FULCRUM EFFECT: hand moves left → tip moves right, scaled),
  transfer 3 pegs/beads between posts without touching red "vessels"; score = errors, time, path length (economy of motion).
Hand-tremor simulation: slight noise on the instrument; holding SHIFT = "steady breath" reduces tremor but drains a focus meter.
Each drill ends with an OSATS-style grade (1–5 per item) + a one-line real-world fact (why this skill matters).
Look: clinical, clean, slightly dark OR-light mood; minimal UI with Inter font; no gore (tissue is a pale silicone training pad,
"incision" is a dark line/groove, no blood beyond a subtle red highlight on errors). Must run at 60 fps on a laptop.

## Tech (no build step)
index.html with an importmap: "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/". ES modules only. Serve: `python3 -m http.server 8400`
from repo root; open http://localhost:8400/. Pointer: mouse/trackpad (pointer lock optional), keys listed in UI.

## Module contract (each agent owns its files; integrate via these interfaces)
- src/core/engine.js (CORE): `createEngine(canvas) -> {scene, camera, renderer, clock, onTick(fn), input}`;
  `input` = {pointer:{x,y,ndcX,ndcY,down}, keys:Set, steady:boolean}; `loadLevel(id)`, `currentLevel`, `events` (EventTarget):
  emits 'level:start' {id}, 'level:progress' {id, pct, hint}, 'level:score' {id, metrics, grade}, 'level:end' {id}.
- src/levels/<id>.js (LEVELS): export default `{id, title, brief, setup(engine, art) -> controller}`, controller =
  `{update(dt, input), dispose(), metrics()}`; ids: 'incision', 'suture', 'lap'. Must emit progress + score events via engine.events.
- src/art/index.js (ART): factories `makeTissuePad()`, `makeScalpel()`, `makeNeedleDriver()`, `makeCurvedNeedle()`,
  `makeGrasper()`, `makeLapBox()`, `makePeg()`, `makeVessel(path)`, `makeORLights(scene)`, `incisionDecal(pad)` returning
  {mesh, ...helpers}; procedural (primitives + simple shaders), no external model files.
- src/ui/hud.js (UI): `createHUD(root, engine)`: title screen + drill select, in-drill HUD (objective, timer, tremor/focus meter,
  live accuracy), pause, results card (metrics table + OSATS-style grade + fact card from content/facts.json), "How to play" panel
  with controls/objectives/scoring (judges must see mechanics explained). style.css owned by UI.
- content/*.json (CONTENT): facts.json [{drill, fact, source}], drills.json [{id, title, brief, objective, controls, scoring}],
  osats.json grading rubric used by levels; docs/pitch.md (3-min video script + Q&A for Game Dev rubric).
- window.game automation API (CORE implements; QA consumes): `ready`, `start(id)`, `state()` ({level, progress, metrics}),
  `bot(id)` runs a scripted good playthrough of that drill (QA/LEVELS implement `autoplay()` per level), `menu()`.
- tests/ + scripts/record.py (QA): Playwright smoke test (no console errors, each drill starts, bot completes) and a 1920×1080
  recording script → MP4 (imageio-ffmpeg) following docs/pitch.md storyboard.
Commit early and often (`git add <your files> && git commit`); never edit another agent's files — ask via a note in
docs/NOTES.md instead (append-only, prefix with your role).

## ADDENDUM 2:15 PM — FULL SURGERIES (user request): short procedures on a LOW-POLY DUMMY, no gore, incentive messages at the top
- Mode "Surgeries" next to "Drills" on the title screen. Each surgery = a level (same interface as drills) made of 4–6 STEPS that
  reuse the drill mechanics (incise along a guide, retract, locate/grasp with fulcrum control, clamp/ligate, cut, suture to close).
- Surgeries (priority order): (1) 'appendectomy' (laparoscopic-style or open, stylized), (2) 'laceration' (simple wound repair on a
  forearm: clean → anesthetize marker → suture ×3 → dress), (3) optional 'cholecystectomy-lite' if time.
- LOW-POLY DUMMY: flat-shaded mannequin (CPR-dummy look, neutral grey/beige), surgical drape with a rectangular opening; inside,
  stylized flat-colored organs (no blood, no realistic tissue). Vitals monitor prop (HR, BP, SpO2) beside the table.
- INCENTIVE MESSAGES at the TOP of the screen (banner, minimal style): step instructions ("Step 2/5: Locate the appendix"),
  praise/combo ("Clean cut! +150", "Perfect bite ×3"), warnings ("Careful — artery nearby", "Patient HR rising"), and a running
  score + patient-stability bar. Vitals react: errors raise HR; steady work keeps them calm.
- Ownership: ART adds `makeDummy()`, `makeDrapeWithWindow()`, `makeOrgan(kind)` (appendix, colon, gallbladder, liver – stylized),
  `makeVitalsMonitor()` to src/art/index.js. SURGERY agent owns `src/surgeries/*` (procedures, step machine, banner overlay
  `src/surgeries/banner.js` mounted by the surgery level itself, vitals logic) and implements `autoplay()` per surgery.
  CORE wires the "Surgeries" cards into the title screen (it owns src/ui now) and registers level ids 'appendectomy', 'laceration'.
- Timeline: dummy+organs 2:35 · appendectomy playable 2:55 · laceration 3:05 · freeze 3:10.
