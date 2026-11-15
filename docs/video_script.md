# Steady Hands: FINAL 3:00 video script (rubric-first)

Gameplay is about 1 minute of fast cuts; the other 2 minutes answer the rubric questions directly. Read calmly, about 150 words per minute. **Bold** = what is on screen.

| Time | Rubric | On screen | Voiceover |
|---|---|---|---|
| 0:00–0:15 | Impact (problem) | **Title → OR wide shot** | "Before a surgeon operates on a person, they need hundreds of hours of practice. That practice happens in simulation labs that cost hundreds of thousands of dollars, and most students never get near one." |
| 0:15–0:40 | Innovation + Curiosity | **How-to-play panel, then the lap drill with hand-left / tip-right** | "The accepted idea is that real surgical training needs expensive hardware. We asked: which parts of it actually need the hardware? We studied how surgeons are trained and tested: the FLS keyhole program, OSATS skill grading, and the Critical View of Safety. Then we built those skills as mechanics. Hand tremor, the fulcrum effect where your hand goes left and the tool goes right, and grading on the same five categories examiners use." |
| 0:40–1:35 | Communication (working prototype) | **Fast cuts: incision → peg transfer → appendectomy retract + artery warning → central-line ultrasound → gallbladder "STOP" → chest-tube X-ray re-expanding → results card → trivia** | "Steady Hands is a free browser game with three skill drills and five real procedures. In an appendectomy the vitals react to every careless move. A central line is guided by live ultrasound: the vein squashes, the artery pulses. Clip the wrong duct in a gallbladder removal and the game stops you, the way a real surgeon would. Each run ends with a graded report and a sourced fact, and a trivia mode teaches the why." |
| 1:35–2:00 | Breadth & Complexity | **Chest-tube cross-section panel, anatomy close-up** | "This pulls from surgery, anatomy, physiology, ultrasound physics and medical-education research, with game design on top. The hardest piece was making realistic procedures from code alone, with no gore and no downloaded models. Ten times bigger means VR, haptic controllers and an instructor dashboard for a whole class." |
| 2:00–2:30 | Navigating Challenges | **Before/after visuals, playtest log, bot run** | "Plenty didn't work. Our first project, a wildfire predictor, didn't fit a track, so we pivoted mid-event. Our first look was cartoonish and felt fake, so we rebuilt it for grounded realism. Then we tested with automated first-time players. They found a soft-lock and a lag bug that made one drill impossible; we fixed both and re-tested until every level could be finished." |
| 2:30–2:52 | Impact (who, needs, feasibility, feedback) | **Title card with user groups** | "It's for pre-med students, med-school applicants and schools or hospitals without a sim lab. It runs on any laptop, even a school Chromebook, with nothing to install. [FRIEND QUOTE if you have it.] Next we'll test it with pre-med students and residents to check that the scores separate beginners from experts." |
| 2:52–3:00 | Close | **Logo** | "Steady Hands. Practice on pixels, not patients." |

## Rubric checklist (what each line earns)
- **Innovation 5** = research, then alternatives explored, giving a better solution: challenges "you need a sim lab"; drills-only expanded to real procedures; stylized look replaced by realism.
- **Curiosity 5** = questions, a plan, then acting on it: "which parts need hardware?" led to studying FLS/OSATS/CVS, which became mechanics.
- **Communication 5** = a working prototype with the essential elements: the minute of real gameplay.
- **Breadth 5** = a wide variety synthesized into something new, with non-computing fields named out loud.
- **Impact 5** = detailed, justified and feasible: named users, free browser, test plan, feedback.
- **Navigating Challenges 5** = alternatives that produced a more successful solution: the pivot, the visual rebuild, and the playtest-fix-retest loop.

## Q&A answers (be ready)
- **"Did AI build this?"** "We used AI coding agents heavily, like a team of junior devs. I directed the design, chose the procedures and the realism rules, reviewed every build, and decided what to cut. I can walk you through how scoring and the fulcrum mapping work."
- **"Is it realistic?"** "It's a first step, not a certified simulator. It copies the structure of real curricula (FLS tasks, OSATS grading, the Critical View of Safety). Haptics and tissue physics are the next layer."
- **"How do you validate scoring?"** "OSATS items were validated against expert raters in 1997. Our thresholds are a first calibration. Our playtests showed they're still too lenient, so the next step is recording expert vs novice runs to check the scores separate them, the way FLS was validated."
- **"10× bigger / 10× people?"** "It's static files, so 10× players costs nothing. 10× scope means VR headsets and haptic gloves, more procedures, instructor dashboards and med-school partnerships."
- **"Hardest part?"** "Making the fulcrum effect and tremor feel fair, and making procedures realistic without gore."
