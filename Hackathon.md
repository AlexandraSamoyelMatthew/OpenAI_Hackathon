# Alex.OS — Hackathon Reference

## Vision

Alex.OS is an AI-powered workspace that helps developers learn, build, and work smarter. The MVP combines an educational AI code and cybersecurity reviewer with an AI study companion.

## MVP scope

### 1. AI Code + Cybersecurity Reviewer

- Paste JavaScript or TypeScript.
- Identify bugs and security risks.
- Explain the impact in plain language.
- Show a safer code fix and explain why it is better.
- Display severity and a CWE label when relevant.

Security focus: hardcoded secrets, SQL/command injection, unsafe dynamic execution, XSS, weak randomness, raw password handling, missing validation, authorization mistakes, and insecure configuration.

### 2. AI Study Companion

- Paste or upload study notes.
- Generate a summary.
- Generate flashcards.
- Generate a short quiz.
- Generate one coding exercise with hints.

## Tasks

| Area | Task | Owner | Done when |
|---|---|---|---|
| Backend | Connect OpenAI Responses API | Backend | Valid structured review response returns |
| Backend | Validate input and limit request size | Backend | Empty/huge input shows helpful error |
| Backend | Error handling and demo fallback | Backend | API failure does not break the UI |
| AI | Security-review prompt and JSON schema | AI/Backend | Findings include impact, fix, and explanation |
| AI | Study prompt and JSON schema | AI/Backend | Summary, cards, quiz, exercise render reliably |
| Frontend | Code editor, results cards, scan animation | Frontend | Code review flow is polished on desktop/mobile |
| Frontend | Study Companion screen | Frontend | Notes flow has four result tabs |
| Design | Landing/empty/loading/error states | Design | App communicates value before the first click |
| Testing | Code-review test set | QA | Empty, invalid, huge, insecure, and safe samples pass |
| Testing | Study test set | QA | Short and long notes produce usable content |
| Demo | Record/rehearse 90-second demo | Whole team | Runs cleanly without explaining setup |

## Four-day timeline

### Day 1 — Foundations

- Finish code-review endpoint, prompt, and UI connection.
- Add demo mode and error states.
- Agree on JSON contracts for both features.

### Day 2 — Study Companion

- Build note input/upload and result tabs.
- Add summary, flashcards, quiz, and coding exercise endpoint.

### Day 3 — Quality

- Test 10 code samples and 5 study-note samples.
- Improve explanations, mobile layout, loading states, and visual consistency.

### Day 4 — Delivery

- Freeze scope, fix only critical bugs, rehearse demo, deploy, and record backup video.

## Roles

- Product manager: scope, user story, judging narrative, demo script.
- Frontend: flows, responsive layout, results components, accessibility.
- Backend/AI: API routes, prompt contracts, validation, security review logic.
- Design: visual consistency, onboarding, empty/error/loading states.
- QA: test cases, regressions, demo rehearsal.

## Judge demo script (90 seconds)

1. “Alex.OS helps developers learn while they build.”
2. Paste a short login snippet with a hardcoded password and interpolated SQL.
3. Click **Review code**; the gold scan line moves.
4. Point to the high-severity security findings: hardcoded secret and SQL injection, then show the safe fix and explanation.
5. Switch to Study Companion and paste JavaScript notes.
6. Show the generated summary, flashcards, quiz, and one coding exercise.
7. Close: “Instead of only identifying problems, Alex.OS teaches the developer what to do next.”

## Future roadmap (out of MVP)

- File/repository review and language detection.
- Auth, saved learning plans, and progress history.
- Retrieval over uploaded notes and citations.
- Team workspaces, pull-request reviews, and CI integration.
- Dedicated static analysis tools to complement AI review.

## Safety note

Alex.OS provides educational review and should not be treated as a complete security assessment. It does not run submitted code and should complement testing, dependency scanning, and professional review.
