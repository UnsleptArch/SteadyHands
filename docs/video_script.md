# Steady Hands: FINAL 3:00 video script (voiceover + edit)

Game Dev track "Project Vital Quest". Read calmly, about 150 words per minute. **Bold** = what is on screen (the edit follows this).

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:12 | **Title screen → OR wide shot** | "Every surgeon's first incision was practiced on something that wasn't a person. But simulation labs cost hundreds of thousands of dollars, and most students never touch one. This is Steady Hands: a free surgical trainer that runs in any browser." |
| 0:12–0:24 | **How-to-play panel** | "You control real instruments with your mouse. Your hand has a realistic tremor, and holding Shift takes a steady breath that calms it but drains your focus. Every run is scored like real surgical exams, with OSATS: respect for tissue, time and motion, instrument handling, flow and precision." |
| 0:24–0:52 | **Drills montage: incision, suture, laparoscopic transfer** | "Three drills build the core skills. Cut along a line at the right depth. Drive a curved needle through exact entry and exit points. And laparoscopy, where the tool pivots at the port: move your hand left and the tip goes right. That's the fulcrum effect, and it's why surgeons train for hundreds of hours." |
| 0:52–1:00 | **Results card (grade bars + fact card)** | "Every result explains your score and ends with a real, sourced fact about why the skill matters." |
| 1:00–1:35 | **Appendectomy: incision → retractors → artery warning → grasp → clamp → close** | "Then you put it together in real procedures. An appendectomy: incise over McBurney's point, retract, find the appendix without hitting its artery, clamp, cut and close. The banner coaches you, combos reward clean work, and the patient's vitals react: careless moves spike the heart rate." |
| 1:35–2:00 | **Central line: ultrasound panel, vein compresses, needle flash** | "A central line, guided by live ultrasound. The vein squashes under the probe; the artery pulses and doesn't. Keep the needle tip in the beam. A dark flash means vein; a bright pulsing flash means you hit the artery." |
| 2:00–2:20 | **Laparoscopic cholecystectomy CVS check ("STOP. That is the common bile duct") + chest tube X-ray re-expanding** | "In a keyhole gallbladder removal you must confirm the Critical View of Safety before clipping, because mistaking the bile duct is a career-defining injury. And in a chest tube you go over the top of the rib, then watch the collapsed lung re-expand." |
| 2:20–2:40 | **Fast cuts: playtest results, before/after visuals** | "The hard part was making it fair and real. We modelled tremor and the fulcrum effect, built every organ and instrument in code, and playtested with simulated first-time players. They found a soft-lock and a lag bug, and we fixed both before shipping." |
| 2:40–3:00 | **Title card: who it helps + feedback quote** | "Steady Hands is for pre-med students, med-school applicants and hospitals without sim labs. We playtested every level with simulated first-time players, and our next step is testing with pre-med students and surgical residents. Then VR and haptics. Steady hands save lives." |

## Rubric hits
- **Innovation:** a free browser version of FLS/OSATS-style training, plus real procedures, not just drills.
- **Curiosity:** fulcrum effect, the Critical View of Safety, ultrasound vein-vs-artery, the safe triangle over the rib.
- **Communication:** How-to-play panel, live coaching banner, results cards.
- **Breadth:** surgery, anatomy, medical-education research (OSATS 1997, FLS, Seymour 2002), ultrasound physics. All outside computing.
- **Impact:** named users plus a feasible next step (testing with pre-med students and residents). Optional: if a mentor or pre-med participant tries it, put one real quote at 2:40.
- **Navigating challenges:** playtester-found bugs fixed; GPU white-screen fix; mid-hackathon pivot (Q&A).

## Q&A answers (be ready)
- **"Did AI build this?"** "We used AI coding agents heavily, like a team of junior devs. I directed the design, chose the procedures and the realism rules, reviewed every build, and decided what to cut. I can walk you through how scoring and the fulcrum mapping work."
- **"Is it realistic?"** "It's a first step, not a certified simulator. It copies the structure of real curricula (FLS tasks, OSATS grading, the Critical View of Safety). Haptics and tissue physics are the next layer."
- **"How do you validate scoring?"** "OSATS items were validated against expert raters in 1997. Our thresholds are a first calibration. The next step is recording expert vs novice runs to check the scores separate them, which is how FLS was validated."
- **"10× bigger?"** "VR headsets and haptic gloves, more procedures, instructor dashboards, and partnering with med schools and sim labs."
- **"Hardest part?"** "Making the fulcrum effect and tremor feel fair, and making procedures realistic without gore."
