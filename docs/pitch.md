> **Superseded.** This early drills-only draft is kept for history. The final script is [video_script.md](video_script.md), and the final video is [`../video/steady_hands_final.mp4`](../video/steady_hands_final.mp4).

# Steady Hands: 3-minute video script

Track: Game Dev, "Project Vital Quest". Target length 3:00. Voiceover in plain, calm tone. Screen is the game unless noted.

## Storyboard

| Time | On screen | Voiceover | Rubric hit |
|---|---|---|---|
| 0:00-0:15 | Title screen, OR-light mood. Text: "Steady Hands: train the hands before the patient." | "Every surgeon's first real cut was practiced on something that was not a person. But simulation labs are expensive and most students never get near one. Steady Hands is a browser game that trains three core surgical skills, free, on any laptop." | Storytelling, why it matters, Impact (who it helps) |
| 0:15-0:35 | "How to play" panel, then drill select | "It is modelled on real training: the FLS program and OSATS grading. Move the mouse, hold click to act, and hold SHIFT for a steady breath. That cuts your hand tremor, but drains a focus meter. Each drill is scored on accuracy, errors and time." | Mechanics explained (controls, objectives, scoring) |
| 0:35-1:00 | Drill 1 Incision, played by the bot. Highlight deviation readout and timer. | "Drill one, incision. Follow the line. Score is deviation in millimetres and how steady your depth stays. Too far off the line and the pad flashes red." | Mechanics, Breadth |
| 1:00-1:25 | Drill 2 Suture, bot drives needle through targets. | "Drill two, suturing. Drive a curved needle through entry and exit points, in order. Yanking the needle counts as tissue trauma." | Complexity |
| 1:25-1:55 | Drill 3 Laparoscopy, bot moves pegs. Overlay arrow showing hand left, tip right. | "Drill three, laparoscopy. The tool pivots at a port, so move your hand left and the tip goes right. That is the fulcrum effect, and it is why trainees need practice. Move three pegs without touching a vessel." | Innovation, Curiosity, non-computing domain (surgery) |
| 1:55-2:15 | Results card: metrics table, OSATS item grades 1-5, letter grade. | "After each drill you get an OSATS-style report: respect for tissue, time and motion, instrument handling, flow, and precision, scored from one to five like real examiners do." | Breadth and Complexity, Communication |
| 2:15-2:30 | Fact cards (Seymour 2002: ~6x fewer errors with VR training; Birkmeyer 2013: skill linked to complications). | "Every drill ends with a real fact. In a 2002 trial, residents trained in VR made about six times fewer errors in the real operating room. Practice saves patients." | Curiosity, Impact, Storytelling |
| 2:30-2:45 | Short cut: build notes. Slide: "Challenges: tremor model, fulcrum mapping, 60 fps in browser, no external models." | "The hard parts were modelling tremor and the fulcrum effect so they feel right, scoring fairly, and keeping it procedural so it loads in seconds and runs at 60 frames per second." | Navigating challenges |
| 2:45-3:00 | Title card with who it helps and next steps. | "Steady Hands is for pre-med students, med school applicants and hospitals without sim labs. Next: VR and haptics, and testing with real clinicians. Steady hands save lives." | Impact, close |

## Rubric coverage checklist

- Innovation: a free, browser-based, no-install trainer built on real OSATS and FLS ideas, with tremor and a focus-meter mechanic.
- Curiosity: we studied the fulcrum effect, loss of depth perception, and OSATS, and show why each is hard.
- Communication: clear controls, objective and scoring panel before each drill; results card; fact cards with sources.
- Breadth and complexity: surgery is outside computing. 3D three.js scenes, procedural art, noise-based tremor, geometry-based scoring, rubric mapping.
- Impact: pre-med and med-school applicants who want hands-on exposure, schools and under-resourced hospitals without sim labs. Feedback from target audience: [FILL IN: quotes from any classmate, pre-med, or health-science teacher who tried it].
- Navigating challenges: tremor model, fulcrum mapping, fair scoring, performance, time limit of the hackathon.

## Game-track rules checklist

- Healthcare connection: surgical skills training and assessment.
- Mechanics explained: in-game "How to play" panel plus video segment 0:15-0:35.
- Storytelling and why it matters: opening hook (0:00-0:15) and fact cards (2:15-2:30).

## Q&A cheat sheet: five toughest questions

1. **"Is this realistic?"**
   It is not a replacement for a simulator. It is a free first step. It copies the structure of real curricula: tasks like peg transfer, the fulcrum effect, tremor, and OSATS-style grading. It teaches the concepts and builds early habits. Real haptics and full 3D tissue physics are the next layer.

2. **"How do you validate the scoring?"**
   The rubric items come straight from OSATS (Martin et al., 1997, which was validated against expert raters). Our thresholds are a first calibration so a careful player can reach 4 to 5. We have not run a formal validation. The next step is recording expert and novice runs and checking that scores separate them, which is how FLS was validated.

3. **"Who actually benefits, and how do you know?"**
   Pre-med students and med school applicants who rarely get hands-on exposure, and schools or hospitals with no sim lab. We gathered informal feedback from [FILL IN]. We would partner with a teaching hospital or surgical society to measure learning, not just enjoyment.

4. **"Does playing a game really improve surgical skill?"**
   Simulation training has strong evidence (Seymour 2002, Cook 2011 meta-analysis). We do not claim our game transfers to the operating room. We claim it teaches the ideas and motivates practice, and we would test transfer with a study.

5. **"What would 10x look like?"**
   VR headset and haptic controllers for true depth and force feedback, deformable tissue physics, more procedures (knot tying, bowel anastomosis), instructor dashboards and progress tracking, and partnerships with sim labs and medical schools. A teacher could then assign drills and see class results.

Bonus: "What was the hardest part?" Making the fulcrum effect feel fair, and tremor that is noticeable but not frustrating.

## Tips for recording
- Use `window.game.bot(id)` for each drill so the run is clean, then show the results card for at least 4 seconds.
- Keep fact cards on screen for 4 seconds so they can be read.
