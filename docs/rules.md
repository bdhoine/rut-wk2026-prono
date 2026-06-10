# Rut Prono WK 2026 — Scoring & Prediction Rules

This document describes the prediction (prono) and scoring rules for the **Rut Prono World Cup 2026** competition, organised at café *De Rut*. It is the authoritative source for the ranking logic the web app must implement.

> Source: *Reglement Rutprono WK 2026* (Hakke & Ruub). The original regulation is in Dutch; this is an English translation for development. The app **frontend must be in Dutch**.

---

## 1. Goal of the competition

Predict the **score of every match as accurately as possible**. Correctly picking only the winner is *not* enough to score maximum points. Players are ranked on total points accumulated across the whole tournament. Only the **final ranking** counts — there is no prize for leading after the group stage.

---

## 2. Per-match scoring

Each match is worth a **maximum of 9 base points**, awarded as follows:

| Condition | Base points |
|-----------|-------------|
| **Exact score** correct (e.g. predicted 3–2, result 3–2) | **9** |
| **Correct winner / correct draw**, but not the exact score | **7 − (goals off)**, with a **minimum of 3** |
| **Wrong outcome** (wrong winner, or predicted draw vs. a win, or vice-versa) | **0** |

Where **"goals off"** = the sum of the absolute differences per team between your predicted score and the actual result:

```
goalsOff = |predHome − actualHome| + |predAway − actualAway|
```

Scoring logic (base points before round multiplier):

```
if predHome == actualHome AND predAway == actualAway:
    points = 9
else if sign(predHome − predAway) == sign(actualHome − actualAway):   # same outcome: home win / away win / draw
    points = max(3, 7 − goalsOff)
else:
    points = 0
```

### Worked examples

**Example A — Mexico vs South Africa ends 3–2** (home win):

| Your prediction | Outcome match? | goalsOff | Base points | Why |
|-----------------|----------------|----------|-------------|-----|
| 3–2 | exact | 0 | **9** | exact score |
| 3–1 | yes (home win) | 1 | **6** | 7 − 1 |
| 2–1 | yes (home win) | 2 | **5** | 7 − 2 |
| 6–0 | yes (home win) | 5 | **3** | 7 − 5 = 2 → raised to minimum 3 |

**Example B — Germany vs Scotland ends 0–0** (draw):

| Your prediction | Outcome match? | goalsOff | Base points | Why |
|-----------------|----------------|----------|-------------|-----|
| 0–0 | exact | 0 | **9** | exact score |
| 1–1 | yes (draw) | 2 | **5** | 7 − 2 |
| 3–3 | yes (draw) | 6 | **3** | 7 − 6 = 1 → raised to minimum 3 |

If you let the **wrong team win**, you score **0 points** for that match.

---

## 3. Round multipliers

Base points are multiplied depending on the tournament round. There are **6 rounds**:

| # | Round | Dutch name | Multiplier | Max points / match |
|---|-------|-----------|:----------:|:------------------:|
| 1 | Group stage | Poulefase | **×1** | 9 |
| 2 | Round of 32 | 1/16de finales | **×2** | 18 |
| 3 | Round of 16 | 1/8ste finales | **×3** | 27 |
| 4 | Quarter-finals | Kwartfinales | **×4** | 36 |
| 5 | Semi-finals | Halve finales | **×4** | 36 |
| — | Third-place play-off | Troostfinale | **×4** | 36 |
| 6 | Final | Finale | **×5** | 45 |

> The third-place play-off and the final are submitted on the same form (round 6 deadline) but use **different multipliers**: ×4 for the third-place play-off, ×5 for the final.

---

## 4. Extra time and penalties

If a knockout match goes to **extra time**, the score used for scoring is the one **after 120 minutes**. Any **penalty shoot-out is irrelevant** and is never used for scoring.

**Example — Germany vs Scotland**: 0–0 after 90 min, 1–1 after extra time, Germany wins the shoot-out 3–2. The result used is **1–1**.

| Your prediction | Base points | After round multiplier |
|-----------------|-------------|------------------------|
| 0–0 | 5 (draw, goalsOff 2) | × 2/3/4/5 depending on round |
| 1–1 | 9 (exact) | × 2/3/4/5 depending on round |

---

## 5. Tournament-wide bonus predictions

On **prediction sheet 1** (group stage), each contestant also makes **4 bonus predictions**, evaluated over the **whole tournament**. Each correct prediction is worth **30 points**.

| Bonus prediction | Dutch | Rule |
|------------------|-------|------|
| **Top scorer** | Topschutter | Player with the most goals in the tournament |
| **Overall winner** | Eindwinnaar | The team that wins the World Cup |
| **Country with most goals conceded** | Land met meeste tegendoelpunten | Penalty shoot-outs **not** counted; extra-time goals **are** counted |
| **Country with most goals scored** | Land met meest gemaakte doelpunten | Penalty shoot-outs **not** counted; extra-time goals **are** counted |

Maximum bonus = **4 × 30 = 120 points**.

---

## 6. Inputs each contestant must provide

For the web app, a contestant's full entry consists of:

### Identity / contact
- **Name**
- **Mobile (GSM) number** — used for the WhatsApp communication group (collected on sheet 1).

### Group stage (submitted before the tournament starts)
- Predicted **score (home goals, away goals)** for **all 72 group-stage matches** (matchdays 1, 2 and 3).

### Knockout stage (submitted per round, before each round starts)
- Predicted **score (home goals, away goals)** for each knockout match. On paper, the contestant first fills in **which countries** reached the round (blank brackets are provided in advance); the official filled brackets are distributed via WhatsApp.
  - Round of 32: 16 matches
  - Round of 16: 8 matches
  - Quarter-finals: 4 matches
  - Semi-finals: 2 matches
  - Third-place play-off: 1 match
  - Final: 1 match

### Bonus predictions (on sheet 1, once for the whole tournament)
- Top scorer, overall winner, country with most goals conceded, country with most goals scored (see §5).

---

## 7. Submission & validity rules

These rules affect whether a prediction counts and therefore the ranking:

- **Entry fee:** €10, paid at the bar of café De Rut.
- **Registration:** only in person at café De Rut.
- **Entry valid only** after both: handing in the group-stage prediction sheets **and** paying the €10.
- **Group-stage predictions** must be handed in **on paper**, in De Rut, **before the start of the World Cup**.
- **From the knockout phase**, sheets may be handed in either:
  - deposited in the dedicated box at the bar in De Rut, **or**
  - sent as a **clear photo via WhatsApp to 0478 64 77 06 (Hakke)** — the photo **must include the contestant's name**.
- Predictions for every round must be submitted **at least 1 hour before the first match of that round** (see `schedule.md`).
- **Late submissions** score **0 points** for matches that have already been played or started.
- Once a form is handed in or sent, it **can no longer be changed**.
- Standings are posted in De Rut and updated regularly; updates and deadlines are also communicated via the WhatsApp group.

---

## 8. Prize distribution

The prize distribution depends on the **number of participants** and is announced during **round 1** (group stage). Only the final overall ranking is rewarded.

---

## Quick reference — ranking computation

```
totalScore(contestant) =
      Σ over all matches [ basePoints(match) × roundMultiplier(match) ]
    + Σ over 4 bonus predictions [ correct ? 30 : 0 ]

Contestants are ranked by descending totalScore.
Late forms ⇒ 0 base points for matches already started at submission time.
```
