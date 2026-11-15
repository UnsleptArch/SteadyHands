# Steady Hands: FINAL voiceover (about 3:00 at a brisk, clear pace)

## THE PROBLEM
Before a surgeon operates on a real person, they need hundreds of hours of hands-on practice. That practice happens in simulation labs that cost hundreds of thousands of dollars, and most students never get near one. We wanted to know how much of that training could reach anyone with a laptop.

## THE QUESTIONS (Curiosity + Innovation)
So we started with questions. How are surgeons actually trained and tested? We found FLS, the keyhole-skills exam surgeons must pass to become board-certified, and OSATS, which grades five things: respect for tissue, time and motion, instrument handling, flow and precision. Then we asked what makes these skills hard. The answer was tremor, and the fulcrum effect: in keyhole surgery the tool pivots at the skin, so your hand goes left and the tip goes right. Those became our core mechanics. We compared the alternatives, cadavers, box trainers and VR simulators, and every one of them needs money or hardware. A browser doesn't.

## THE GAME (Communication)
Steady Hands has three drills and five real procedures. The drills isolate one skill each: cutting at the right depth, placing sutures, and peg transfer, the actual FLS task. The procedures combine them. In an appendectomy you find the appendix without nicking its artery, while the patient's heart rate reacts to every careless move. A central line is guided by live ultrasound: the vein squashes under the probe, the artery pulses. In a gallbladder removal you must prove the Critical View of Safety before clipping, and if you pick the bile duct, the game stops you, the way a senior surgeon would. Every run ends with an OSATS-style report and a sourced fact, and a trivia mode teaches the why.

## BREADTH
That meant combining surgery, anatomy, physiology, ultrasound physics and medical-education research, then turning them into game design. It's built in three.js, and every organ, instrument and drape is generated in code: no downloaded models and no gore, so it loads in seconds even on a school Chromebook. Ten times more players costs nothing, because it's just static files. Ten times bigger means VR, haptic controllers and an instructor dashboard for a whole class.

## WHAT BROKE (Navigating challenges)
Plenty broke. Our first project, a wildfire predictor, didn't fit any track, so we pivoted mid-event. Our first art looked cartoonish, so we rebuilt it for grounded realism. To test fairly, we built automated first-time players that move a real mouse with shaky hands. They found a drill that dropped to one frame per second and a step that could soft-lock. We fixed both and re-ran until every level could be finished.

## EXPERT FEEDBACK (Impact + changed based on results)
Then we showed it to Dr. Enver Ozer, a head and neck surgeon and professor at Ohio State. He said the suturing and the trivia are the most valuable parts, because incisions are a skill you mostly acquire through real experience. He suggested injections, more types of suturing, and more procedures. So that's our roadmap: injection training and new suture techniques come next, ahead of new incision drills.

## WHO IT HELPS (Impact)
Steady Hands is for pre-med students, med-school applicants, and schools or hospitals without a sim lab. Next, we'll test it with students and residents to check that the scores really separate beginners from experts, the same way the FLS exam was validated.

## CLOSE
Steady Hands. Practice on pixels, not patients.

---
If long: cut "Ten times more players costs nothing, because it's just static files." then "We compared the alternatives ... A browser doesn't."

## Q&A (be ready)
- **Expert:** Dr. Enver Ozer, Professor of Otolaryngology, Head and Neck Surgery, The Ohio State University. Feedback: suturing and trivia most valuable; incisions are acquired skills; add injections, more suture types, more surgeries.
- **"Did AI build this?"** "We used AI coding agents heavily, like a team of junior devs. I directed the design, chose the procedures and the realism rules, reviewed every build, and decided what to cut."
- **"How do you validate scoring?"** "OSATS was validated against expert raters. Our playtests showed our thresholds are too generous, so the next step is expert vs novice runs, the way FLS was validated."
- **"10x?"** "Static files, so 10x players is free. 10x scope: VR, haptics, instructor dashboards, injections and suture-technique modules per Dr. Ozer."
