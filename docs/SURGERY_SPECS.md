# SteadyHands: 3 Additional Surgery Specs

Chosen: (1) Laparoscopic Cholecystectomy (judgment: critical view of safety), (2) Ultrasound-Guided Central Venous Line (spatial skill: needle angle and Seldinger), (3) Chest Tube Insertion (anatomy and safe-triangle technique, blunt dissection). Together with appendectomy (laparoscopic/open basics) and laceration repair (suturing), these cover judgment, imaging-guided needle skill, and anatomic landmarks.

Shared conventions
- Mouse = instrument tip (raycast to the operative plane). LMB = engage/grasp/advance. Scroll = depth or rotation, as specified. SHIFT = steady breath: tremor amplitude x0.25, drains focus 20 %/s, regens 8 %/s when released. Focus at 0 = tremor x1.5 for 3 s.
- Tremor baseline: 1.5 px RMS jitter at 6-9 Hz, rising with vitals stress.
- Vitals: baseline HR 78, BP 120/80, SpO2 99. "Minor" mistake = HR +6; "major" = HR +15, BP -10 systolic; "critical" = banner + HR +25, SpO2 -4, and the step is flagged. Vitals relax 1 unit/s toward baseline.
- Grade per procedure: stars from total 0-100.

---

## 1. Laparoscopic Cholecystectomy: "Critical View of Safety"

**Context.** Gallbladder removal is among the most common abdominal operations (about 750,000 per year in the US). Its worst complication, bile duct injury, is mostly caused by misidentification (mistaking the common bile duct for the cystic duct), and the Critical View of Safety (CVS) technique exists to prevent it. Fact: Way et al., "Causes and prevention of laparoscopic bile duct injuries", Ann Surg 2003;237:460-469, found 97 % of 252 injuries were due to perceptual error, not skill deficit. CVS: Strasberg, J Am Coll Surg 1995;180:101-125; SAGES Safe Cholecystectomy Program.

**Skill taught:** do not cut until you have proven what you are cutting.

**Scene.** Laparoscopic video view (circular port vignette) within the overhead camera. Gallbladder (green-tan), liver edge (brown-red), cystic duct (pale yellow tube), cystic artery (pink-red tube), common bile duct (wider, white-green, further down). Two tools: left hand grasper (LMB), right hand = mouse tip hook/clipper. Key `Q` swaps instrument (grasper / hook / clip applier / scissors).

### Steps (target 130 s)

1. **Retract the gallbladder (counter-traction).**
   - Player: grasp the fundus and push it cephalad over the liver; grasp the infundibulum (neck) and pull it laterally.
   - Mechanic: LMB on fundus, drag up-right until a green "tension" ring reaches the zone; then click neck, drag laterally. Tension gauge 0-100; hold 40-70 for 2 s.
   - Realism: fundus cephalad plus infundibulum lateral opens Calot's triangle; too little tension hides the plane, too much tears the gallbladder.
   - Success: both holds at tension 40-70. Score 20 pts; full if achieved in under 20 s, -1 pt per extra second to min 10.
   - Failure: tension > 85 for over 0.5 s = tear (bile spill graphic, minor), HR +6, banner "Too much traction, ease off."

2. **Dissect Calot's triangle with the hook (expose the two structures).**
   - Player: using the hook, clear the peritoneum/fat covering the cystic duct and artery, and also take down the lower third of the gallbladder off the liver bed (cystic plate).
   - Mechanic: hold LMB and trace along highlighted dim fat strands; each stroke must move at < 120 px/s (cutting speed too high = bleed). Strokes only in the fat layer; the tool depth is controlled by scroll (3 depth lanes: peritoneum, fat, duct wall). Stay in "fat" lane.
   - Realism: dissection stays close to the gallbladder wall and away from the common bile duct; heat spread near ducts injures them.
   - Success: both structures show > 90 % cleared and the cystic plate is exposed (the "two structures and a window" requirement). 25 pts: coverage x 25, minus 5 per stray stroke (stray = stroke in duct lane).
   - Failure: duct-lane contact > 0.3 s = "thermal/hook injury" (major), HR +15. Speed over limit 2x within 3 s = small bleed (minor; cautery click needed, see step 5 in banner list).

3. **CVS checkpoint ("time-out", the judgment step).**
   - Player: the game freezes motion and presents a labelled-free structure view; the player must click the three CVS criteria checkboxes' real anatomical evidence: (a) click Calot's triangle cleared of fat, (b) click the lower third of gallbladder separated from the liver, (c) click the exactly two tubes entering the gallbladder. Then choose which tube is the cystic duct (click one of the three tubular structures: 2 correct candidates plus the CBD decoy).
   - Mechanic: click targets with LMB; SHIFT not needed. Rotate view with scroll (+/- 30 degrees) to see behind the structures (a "second window"), which is required to confirm the artery.
   - Realism: CVS requires all three; surgeons also use the posterior view to confirm no hidden third structure.
   - Success: all three criteria correct and cystic duct identified, no hint used. 20 pts (-7 per wrong click, a hint costs 10 and is allowed once).
   - Failure: choosing the CBD as the duct = critical, banner "STOP. That is the common bile duct," the step resets (no clipping allowed until corrected), SpO2 not affected but HR +25.

4. **Clip and cut (3 clips rule).**
   - Player: with clip applier, place 2 clips on the patient side and 1 on the specimen side of the cystic duct and artery, then cut between with scissors.
   - Mechanic: aim the clip jaw perpendicular to the structure (cursor-aligned angle indicator, within +/- 15 degrees). LMB clicks to deploy, with a 0.4 s hold to close (shake > 3 px during hold = misdeployed). Scissors: LMB between the two proximal and one distal clips, with at least 2 mm margin from the proximal clips.
   - Realism: two clips proximal, one distal; clip leaves margin to avoid slipping; never cut before clipping.
   - Success: 3 clips on each of duct and artery (6 total, or 3 on each if player clips duct then artery), correct angle, cut in the gap. 20 pts: 2 pts per correct clip, 8 pts cut accuracy.
   - Failure: cut before 2+1 clips = critical bleed or bile leak (red-free: the vessel "pulses" clear bile fluid and a warning banner), HR +25, BP -20. Clip on wrong structure = critical.

5. **Detach from liver bed and extract.**
   - Player: hook along the liver bed to detach, then grasp the gallbladder and drag it to the port.
   - Mechanic: trace a path with LMB held between two dotted lines within a 6 px corridor, 12 s budget. SHIFT helps the tight corridor. Dragging it out: LMB drag to the port.
   - Realism: dissect in the correct plane to avoid liver bed bleeding or perforation (gallstones spill).
   - Success: path accuracy > 85 %, no perforation. 15 pts.
   - Failure: leaving the corridor > 1 s = liver bed oozing (minor, HR +6); perforation = stones spill banner, -5 pts.

### Scoring and OSATS mapping
- Respect for tissue: tension and burn events (steps 1, 2, 5).
- Time and motion: step times, stroke count.
- Instrument handling: clip angle, tremor under 1.5 px.
- Flow of operation: no resets, CVS done before clips.
- Knowledge/judgment (OSATS "knowledge of procedure"): step 3.
- Totals: 100 pts. 90+ = 3 stars. Automatic cap of 1 star if the CBD was clipped/cut (a "never event").

### Banner voice
- Praise: "Critical View achieved. Now you may clip." / "Clean plane, no heat near the duct."
- Warning: "Two structures, one window. Prove it before you cut." / "Too much traction, ease off."

### Autoplay
The bot gently drags the fundus up-right and the neck lateral, holding tension around 55 with SHIFT tapping. It sweeps the hook slowly (80 px/s) in the fat lane along the dim strands, rotates the view by scroll to show the posterior window, clicks the three CVS evidence targets and the correct duct, then moves the clip jaw to align within 5 degrees, performs 3 clips on each structure with 0.5 s holds, snips in the gap, traces the liver bed corridor center-line, and drags the specimen to the port. Praise banners fire in sequence for a 3-star finish with flat vitals.

### Build risk
Cut first: the step 5 liver-bed corridor (replace with a single drag), then the scroll "second window" rotation in step 3, then the depth lanes in step 2 (use 2D coverage painting). Keep: tension gauge, CVS checkpoint, and the clip-before-cut rule (the core lesson).

---

## 2. Ultrasound-Guided Central Venous Line: "Find the Vein, Avoid the Artery"

**Context.** Central lines deliver drugs and fluids to critically ill patients, and are placed in the internal jugular vein (IJV) next to the carotid artery. Fact: the UK NICE Technology Appraisal 49 (2002) recommends two-dimensional ultrasound guidance for elective IJV cannulation, because landmark placement carries a risk of accidental arterial puncture; Pronovost et al., N Engl J Med 2006;355:2725-2732, showed that a checklist bundle (including sterile barrier and technique) cut ICU catheter bloodstream infection from a median 2.7 to 0 per 1000 catheter-days.

**Skill taught:** 3D spatial reasoning from a 2D image; the Seldinger technique; sterile discipline.

**Scene.** Split view: left = neck from overhead (draped, head turned, probe on the neck); right = live ultrasound image (greyscale, animated speckle). Vein = larger, oval, black, compressible; artery = rounder, thicker wall, pulsatile, not compressible. Keys: `Q` toggles ultrasound view fullscreen for convenience.

### Steps (target 120 s)

1. **Sterile prep and probe placement.**
   - Player: click the checklist items in order (hand hygiene, full drape, sterile probe cover, chlorhexidine), then place the probe transversely over the neck.
   - Mechanic: click 4 icons within a 12 s budget; then drag the probe to the highlighted band and scroll to rotate it until the marker is at 0 degrees (+/- 10).
   - Realism: maximal sterile barrier precautions are a core CLABSI bundle element.
   - Success: all four in order, probe aligned. 15 pts (3 pts per item, 3 pts alignment).
   - Failure: skipping an item = banner "Sterile barrier first." (minor), and an "infection risk" hidden counter +1 (shown on the results screen).

2. **Identify vein versus artery (compression test).**
   - Player: press the probe to compress; the vein collapses, the artery does not (and pulses).
   - Mechanic: hold LMB with the probe over the target for 1 s; ultrasound shows deformation. Then click the vein in the ultrasound view.
   - Realism: compressibility and pulsatility are the standard discriminators; anatomy varies (vein may overlie the artery).
   - Success: click inside the vein ellipse. 15 pts. Wrong choice: -10 and banner "That one pulses. Try compression."
   - Failure: committing the needle to the artery later is judged in step 3.

3. **Needle approach (out-of-plane, 45 degrees).**
   - Player: advance the needle toward the vein while watching the ultrasound.
   - Mechanic: mouse sets entry point on the skin and the needle direction; scroll = needle advance depth (0-40 mm); needle tip appears on the ultrasound only as a bright dot when the probe is "fanned" down with the arrow keys (A/D fan the probe along the needle, a deliberate skill: tip tracking). Needle angle shown 30-60 degrees as valid. Keep the tip on the tracked dot.
   - Realism: the needle tip is invisible unless tracked; surgeons walk the probe along the needle (the "tip tracking" idea) and use the depth of the vein (about 1-2 cm).
   - Success: the tip enters the vein centre (inside the ellipse by > 60 % width) with a "flash" of dark blood color (small, controlled, non-gory red-brown in the syringe) in under 25 s. 25 pts, linear in distance error.
   - Failure: tip in artery (bright red, pulsatile syringe) = critical, banner "Pulsatile. Arterial puncture, withdraw and hold pressure." HR +15, BP -10; the player must withdraw and retry (step score -10). Passing through the posterior vein wall (depth > vein base) = "through and through," minor. Tip beyond 35 mm = pleura warning: SpO2 -3, "Too deep. Pleura is near."

4. **Guidewire (Seldinger technique).**
   - Player: remove the syringe, thread the guidewire through the needle into the vein; remove needle over the wire.
   - Mechanic: a bar shows the wire insertion; hold LMB and slowly move the mouse downwards to feed the wire (max 18 cm). Wire should advance with SHIFT-steady motion. On the ultrasound the wire shows as a bright line in the vein. Ectopy warning: if inserted > 20 cm, premature heartbeats (ECG animation, HR irregular). Press `E` to withdraw the needle only after the wire is > 10 cm in, with a "never let go of the wire" indicator (if the mouse button is released while the wire is exposed, the wire is "lost" = critical).
   - Realism: Seldinger = needle, wire, dilator, catheter; always keep control of the wire; wire insertion too deep triggers arrhythmias.
   - Success: wire 12-18 cm and never released. 20 pts.
   - Failure: over 20 cm = arrhythmia banner "Wire too deep, ectopy on the monitor. Pull back." HR spikes +20 irregular. Released wire = "Lost the wire" (critical), -15 pts.

5. **Dilate, thread catheter, confirm.**
   - Player: nick the skin and pass the dilator over the wire (short), remove it, thread the catheter, remove the wire, flush.
   - Mechanic: three quick timed drags: dilator (push 5 mm into a band), catheter (feed with scroll 16 cm, +/- 2 cm target), pull the wire out (drag back, with a wire-held check). Then click "aspirate and flush" to see a blood return.
   - Realism: do not advance the dilator past the tract length; tip should sit at the cavo-atrial junction (about 15-16 cm for a right IJ line).
   - Success: catheter tip at 14-17 cm. 25 pts.
   - Failure: dilator too deep = vein laceration (major; HR +15, BP -15). Catheter too long = arrhythmia warning as above.

### Scoring and OSATS mapping
- Respect for tissue: arterial puncture, depth/pleura events.
- Time and motion: needle redirections count (each > 1 redirect costs 3 pts).
- Instrument handling: angle, tremor, wire control.
- Flow: sterile steps and correct order.
- Knowledge: step 2 identification, sterile bundle.
- Total 100 pts. 3 stars at 85+. Arterial puncture caps at 2 stars; losing the wire caps at 1 star.

### Banner voice
- Praise: "Dark flash, vein confirmed. Textbook angle." / "Wire stayed in your hand the whole time."
- Warning: "Pulsatile. That is the artery, withdraw." / "Too deep. Pleura is near."

### Autoplay
The bot clicks the four sterile items in order, places the probe, holds LMB to compress the neck for a second, clicks the vein, sets the needle at 45 degrees, advances by scroll while fanning the probe with A/D to keep the dot centered, stops when the flash appears, feeds the wire to 15 cm with SHIFT held, withdraws the needle, dilates, threads the catheter to 15.5 cm, removes the wire and flushes. Vitals stay flat and praise banners fire at each step.

### Build risk
Cut first: tip tracking via A/D fanning (make the needle tip always visible on the ultrasound), then the sterile checklist (reduce to a single click), then the dilator sub-step. Keep: the vein/artery compression discrimination, the needle angle and depth with the artery decoy, and the "never let go of the wire" rule. The ultrasound view can be a 2D canvas texture with two ellipses plus noise, so it is cheap to build.

---

## 3. Chest Tube Insertion (Tube Thoracostomy): "The Safe Triangle"

**Context.** A chest tube drains air or fluid from the pleural space and is a life-saving emergency procedure for a tension pneumothorax or hemothorax in trauma. Fact: ATLS (American College of Surgeons, Advanced Trauma Life Support, 10th ed.) specifies insertion in the "safe triangle": anterior to the mid-axillary line, behind the lateral border of pectoralis major, and above the 5th intercostal space (nipple level), with the tube passing over the top of the rib because the neurovascular bundle runs along the lower border of each rib.

**Skill taught:** surface anatomy, blunt dissection, protecting the lung and the intercostal bundle.

**Scene.** Patient on their back, arm abducted above the head, chest from the side/overhead. Ribs drawn as faint ridges under translucent skin, nipple line and anterior axillary border shown as faint guides only in Easy mode. A small chest X-ray panel shows a collapsed lung (shrinking white lung field) with a tension indicator.

### Steps (target 100 s)

1. **Landmark and prepare.**
   - Player: click to mark the safe triangle on the chest wall, then prep and drape and inject local anesthetic.
   - Mechanic: click inside the triangle (bounded by the lateral edge of pectoralis, the anterior border of latissimus, the 5th-intercostal line); the marker snaps to the nearest intercostal space. Then LMB hold 2 s on the site for the anesthetic.
   - Realism: tube sits in the 4th-5th intercostal space at the mid-axillary line; too low risks the diaphragm, liver or spleen; too high risks the axillary vessels.
   - Success: marker inside the triangle at the 4th-5th space. 20 pts (distance falloff over 2 cm).
   - Failure: marker below the 6th space = banner "Too low. Diaphragm, liver and spleen live down there." (major, -10); marker out of the triangle = banner "Outside the safe triangle."

2. **Incision and subcutaneous track.**
   - Player: make a 2-3 cm skin incision along the rib line, then dissect through the fat toward the rib below the target space.
   - Mechanic: drag LMB horizontally for the incision (length 2-3 cm; shorter or longer lowers the score). The incision must be along the rib (direction +/- 10 degrees).
   - Realism: the incision is made over the rib below the intended space, so the tube track angles up over the rib.
   - Success: length 2-3 cm, direction aligned. 15 pts.
   - Failure: too long = cosmetic penalty only (-5).

3. **Blunt dissection over the top of the rib (the hero mechanic).**
   - Player: push a blunt clamp through the muscle layers and over the superior edge of the rib into the pleura.
   - Mechanic: the cursor controls the clamp's lateral position; scroll advances depth (resistance felt as scroll "stiffness" steps, with the pop at the pleura at about 3 clicks), then a final firm click (LMB) pops the pleura with a "hiss and rush of air" animation and the lung-silhouette begins to move on the X-ray panel. The clamp must stay within the upper 30 % of the intercostal space (cursor-y inside a green band just above the rib; the inferior 30 % is a red band marked as the neurovascular bundle only after failure). Spread by moving the mouse left-right with LMB held.
   - Realism: going over the top of the rib avoids the intercostal vein, artery and nerve below each rib; blunt dissection reduces lung injury; the finger sweep confirms entry.
   - Success: pleural entry in the upper band, depth stop at the pop (do not exceed 2 more clicks). 25 pts.
   - Failure: in the lower band = bleed (critical): a controlled red-brown seep, banner "Rib's lower edge, that is where the nerve and vessels run." HR +25, BP -20. Over-advancing past 3 clicks after the pop = lung laceration (major), SpO2 -5.

4. **Finger sweep and tube placement.**
   - Player: sweep a finger around the opening to check for adhesions, then grasp the tube with a clamp on its tip and advance it posteriorly and superiorly (apex for air, base for fluid).
   - Mechanic: sweep = circular mouse motion around the hole (one full revolution at radius 8-14 px). Tube: LMB drag along the guideline to the target zone; the instruction changes depending on the case roll (pneumothorax = aim up toward the apex; hemothorax = aim down and back). Insertion length shown 0-30 cm; the ideal is all the holes inside the chest (the last side hole marker at 2 cm past the skin).
   - Realism: tube direction depends on air (apical) versus fluid (basal and posterior); every side hole must be inside the pleural space or the tube will leak and give subcutaneous emphysema.
   - Success: direction within 25 degrees of the target, depth 10-14 cm to the last hole. 20 pts.
   - Failure: tube goes anterior over the mediastinum (direction error > 45 degrees) = banner "Wrong direction, it will not drain." -8 pts and the lung stays down; last hole outside the skin = air leak warning.

5. **Connect, secure and confirm.**
   - Player: connect to the underwater seal drain, suture the tube in place, then check for "swinging" in the water column and re-expansion on the X-ray.
   - Mechanic: drag the tube end to the drain port (snap within 12 px); clicking the 3 icons in order (drain below chest level, suture, dressing); press and hold SHIFT with the mouse still for 2 s to "watch the fluid swing" (a steady breath and a still hand are the point).
   - Realism: the drain must stay below chest level and under water-seal; clamp discipline: never clamp a bubbling tube.
   - Success: seal correctly connected, X-ray lung re-expands to 100 %. 20 pts.
   - Failure: drain raised above the chest (dragging it too high) = backflow warning, "Keep the drain below the chest." HR +6; leaving it disconnected for 5 s = SpO2 -3 per 5 s.

### Scoring and OSATS mapping
- Respect for tissue: blunt dissection, band position, over-advance.
- Time and motion: the pneumothorax is progressive (SpO2 falls 1 per 15 s until the pop), which rewards speed without recklessness.
- Instrument handling: tremor on the pleural pop, tube drag accuracy.
- Flow: sequence landmark, incision, dissection, tube, drain.
- Knowledge: triangle, direction by diagnosis.
- Total 100 pts; 3 stars at 85+; a lower-band entry caps at 2 stars.

### Banner voice
- Praise: "Over the top of the rib, the safe way in." / "Lung re-expanding, sats climbing."
- Warning: "Outside the safe triangle." / "Stay above the rib. Vessels run below it."

### Autoplay
The bot clicks the marker in the safe triangle at the 5th space, holds for the anesthetic, drags a 2.5 cm incision along the rib, then positions the clamp in the upper band, scrolls three notches against the resistance, clicks at the pop, spreads gently, swirls the finger sweep once, drags the tube posteriorly and superiorly to 12 cm, snaps it to the drain, clicks the three secure icons, and holds still with SHIFT while the lung re-expands and SpO2 returns to 99.

### Build risk
Cut first: the finger sweep (auto-complete), then the secure and dressing icons, then the diagnosis-dependent tube direction (always apical). Keep: the safe triangle marker, the upper-band versus lower-band rib mechanic with resistance steps and pop, and the re-expanding X-ray panel (a simple 2D canvas lung shape scaled with a variable).

---

## Build notes across all three
- Each is ~45 min for one developer if stripped to its "hero mechanic" first: CVS checkpoint plus clip-before-cut; vein/artery plus needle angle plus wire hold; rib band plus pop.
- Reuse shared systems: tremor/SHIFT, the vitals event bus (`minor`, `major`, `critical`), the banner queue, the step state machine, and the results screen with OSATS bars (Respect for tissue, Time and motion, Instrument handling, Flow, Precision).
- Facts to verify before citing in slides: Way 2003 (97 % perceptual), Strasberg 1995, NICE TA49 2002, Pronovost 2006, ATLS 10th ed. safe triangle.
