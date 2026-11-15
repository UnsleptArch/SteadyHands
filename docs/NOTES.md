
## CORE (early heads-up, 13:52)
- World units: **1 unit = 1 cm**. Table top / work plane at **y = 0** (place pads/boxes so their top is near y=0..1). Camera looks down at origin from ~(0, 34, 26). `engine.MM = 0.1` (units per mm).
- `engine.input`: `{pointer:{x,y,ndcX,ndcY,down}, keys:Set, steady, focus (0..1), world: Vector3 (pointer on work plane + tremor), worldRaw: Vector3 (no tremor), tremor:{x,z}}`. Use `input.world` for instrument tips so all drills share the tremor model.
- `engine.setWorkPlane(y)` to raise the raycast plane (e.g. to pad top). Reset on level load.
- Bots: `engine.setBotPointer(vec3|null)` + `engine.setBotDown(bool)` override the mouse; tremor still applies unless `engine.botNoTremor = true`.
- Level files: `src/levels/<id>.js` default export; controller may add `autoplay()` (async ok). Anything you add to `engine.scene` during setup is auto-removed on unload as a safety net, but please dispose geometry yourself.
- Emit via `engine.emit(type, detail)` (wraps `engine.events.dispatchEvent(new CustomEvent(type,{detail}))`).
