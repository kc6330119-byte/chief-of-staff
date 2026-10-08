# Kevin & Praveen: Bi-Weekly 1:1 | September 8, 2026

> **Fictional sample for a public YouTube video.** Kevin Collins (the creator) is the only real person, shown as the manager of a fictional SRE team. Harborline Cloud, its people, customers, tools and incidents are invented.

**Date:** September 8, 2026, 10:14 AM | **Duration:** 3m 02s
**Attendees:** Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)
**Company:** Harborline Cloud | **Type:** Bi-weekly 1:1
**Prior context:** `2026-07-28_kevin-praveen_1on1.md` (last Kevin–Praveen 1:1, 6 weeks earlier) and `2026-05-05_kevin-sam_1on1.md` (Praveen named in an action item). Also uses the Q2 check-ins dated June 30, 2026 in `goals/harborline-sre-goals-2026.md`.

---

## Executive Summary

A short but noticeably better 1:1 than July 28. Praveen is still on a noisy rotation: **12 pages last week, 9 of them noise**, from the **same two sources as in July** (PingPost flapping on the web login check, and the disk warnings). His most important point was about alert fatigue: *"When you get paged for junk enough times, you start assuming the next one's junk too. That's how you miss the real one. That's April, basically."*

This time Kevin asked Praveen for the fix rather than bringing one, and Praveen had a plan ready:
1. **Dedupe the PingPost flaps** so a check must fail **three times in a row** before it pages.
2. A **weekly 30-minute alert review**: look at every page from the week and fix it, tune it, or delete it. Praveen will run it and bring **Riley**, so it doubles as on-call training.

Kevin gave Praveen ownership ("That's your idea, so I want you to own it") and committed to **protecting the 30 minutes on the team calendar**.

Praveen also shifted on the detection pilot. In July he said it would "page us more, not less." Today he proposed using its **shadow-mode noise labels as a second opinion in the review** ("I'd still decide"), and checked that it isn't "deciding who's on the team." Kevin reassured him and said any time the pilot saves should go into this review and into Riley.

On coverage: extra shifts are **better since Riley started shadowing**. **Riley is primary for the first time next week (week of Sep 14)**, with Praveen as secondary. Praveen called mentoring "the best part of the week."

Not discussed: the **alert-hygiene sprint Kevin was going to request from Dana on July 28** (open 6 weeks, and the same alerts are still paging), Marco's backfill, the Sam pairing, and Praveen's ACT-111 design review.

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-260908-1 | Set up and run a weekly 30-minute alert review: every page from the week gets fixed, tuned, or deleted. Bring Riley. | Praveen Iyer | Not set |  | Agreed |
| A-260908-2 | Dedupe PingPost flaps: require three consecutive failures before paging (his proposal; implementer and date not stated) | Praveen Iyer | Not set |  | Agreed |
| A-260908-3 | Protect the weekly alert-review slot on the team calendar | Kevin Collins | Not set |  | Agreed |
| A-260908-4 | Use the detection pilot's shadow-mode noise labels as a second opinion in the review; Praveen makes the final call | Praveen Iyer | When shadow mode runs (Q4 per goals) |  | Agreed |
| A-260908-5 | Riley's first primary on-call week, with Praveen as secondary | Riley Brooks | Week of Sep 14 | 2026-09-18 | Scheduled |
| A-260908-6 | Tell Praveen where the Dana alert-hygiene sprint request stands, and decide whether the weekly review replaces it or feeds it *(suggested)* | Kevin Collins | This week | 2026-09-11 | Suggested |
| A-260908-7 | Set a start date for the first alert review and a date for the PingPost dedupe (with Praveen Iyer) *(suggested)* | Kevin Collins | This week | 2026-09-11 | Suggested |
| A-260908-8 | Track weekly page counts (total / non-actionable) from the review as evidence for Praveen's alert-quality goal *(suggested)* | Praveen Iyer | Weekly |  | Suggested |
| A-260908-9 | Check in with Riley before and after the first primary week *(suggested)* | Kevin Collins | Week of Sep 14 | 2026-09-18 | Suggested |
| A-260908-10 | Credit Praveen's alert-review idea to Dana by name *(suggested)* | Kevin Collins | Next Dana 1:1 |  | Suggested |

---

## Open Items from Earlier Meetings

| ID | From | Item | Owner | Age | Status now |
|---|---|---|---|---|---|
|  | **Repeated concern** (Sam 1:1 May 5; Praveen Q2 check-in Jun 30; Praveen 1:1 Jul 28) | Praveen's on-call load is too high and most pages aren't actionable | Kevin Collins | 18 weeks since first raised | Open. **Raised a 4th time.** 9 of 12 pages were noise (~75%), vs. 11 of 14 (~79%) on Jul 28, from the same sources. Now has a Praveen-owned plan, and shifts are easing with Riley. |
| A-260728-1 | Jul 28, 2026 | Ask Dana for a two-week alert-hygiene sprint (PingPost thresholds, disk warnings, full list) | Kevin Collins | 6 weeks (42 days) | Open. **Not mentioned.** No evidence it happened; the same alerts are still firing. |
| A-260728-2 | Jul 28, 2026 | Evaluate the detection pilot during its shadow period | Praveen Iyer | 6 weeks | Open. **Progressing.** Praveen now proposes using its noise labels in the weekly review. |
| A-260728-3 | Jul 28, 2026 | Mentor Riley through on-call certification | Praveen Iyer | 6 weeks | Open. **On track.** Riley is shadowing and goes primary next week, with Praveen as secondary. |
| A-260728-5 | Jul 28, 2026 | Continue work on backfill for Marco's role | Kevin Collins | 6 weeks | Open. Not discussed. Extra shifts are "better," but Praveen is still covering them. |
| A-260728-4 | Jul 28, 2026 | Continue scheduler pairing with Sam | Praveen Iyer, Sam Torres | 6 weeks | Open. Not discussed. |
| A-260728-6 | Jul 28, 2026 | Agree with Praveen what comes off his plate *(suggested then)* | Kevin Collins | 6 weeks | Open. Partly addressed: Kevin protected 30 min/week. Nothing was formally removed, and the review adds a recurring commitment. |
| A-260505-1 | May 5, 2026 (Sam 1:1) | Bring duplicate ACT-110 / ACT-160 to Dana as a postmortem process gap | Kevin Collins | 18 weeks (126 days) | Open. Not discussed. No record it's closed. |
| A-260505-4 | May 5, 2026 (Sam 1:1) | Log Sam's incident-communication win as goal evidence | Kevin Collins | 18 weeks (126 days) | Open. Not discussed. No record it's closed. |

---

## Flip Cards

### Card 1: Still 9 of 12 pages noise
Last week: 12 pages, 9 of them noise. The sources are the same as in July: PingPost flapping on web login and the disk warnings. That's ~75%, basically unchanged from July 28 (~79%). Praveen: "I've kind of stopped reacting to them, which is its own problem."

### Card 2: Alert fatigue is how you miss the real one
Praveen linked the noise to April: "you start assuming the next one's junk too. That's how you miss the real one." April wasn't a paging miss, but the effect is the same: people stop looking. This ties noisy alerts directly to customer-detected incidents.

### Card 3: Praveen's plan: dedupe and a weekly review
(1) PingPost pages only after three consecutive failures. (2) A 30-minute weekly review of every page: fix, tune, or delete. Praveen runs it and brings Riley. It was his idea and he owns it. Kevin protects the time.

### Card 4: The review doubles as Riley's training
Praveen: "It's the fastest way to learn what's real in this system. Better than any runbook." One meeting cuts noise and prepares Riley for on-call.

### Card 5: From pilot skeptic to user, on his terms
In July: "The pilot is going to page us more." Today: use its shadow-mode noise labels as "a second opinion. I'd still decide." His condition was that it's "not deciding who's on the team." Kevin: "It drafts, you decide," and time it saves goes to the review and to Riley.

### Card 6: Riley goes primary next week
Riley's first primary week is the week of Sep 14, with Praveen as secondary. Praveen says Riley is "ready enough." That meets Riley's Q3 goal and Praveen's mentoring measure.

---

## FAQ

**Q: How noisy was on-call last week?**
A: 12 pages, 9 noise. The sources were PingPost flapping on the web login check and the disk warnings, the same ones as in July.

**Q: Why does Praveen think the noise is dangerous, not just annoying?**
A: Alert fatigue. After enough junk pages people assume the next one is junk too, and that's how a real one gets missed. He compared it to April.

**Q: What's the plan to reduce noise?**
A: Praveen's two-part proposal: dedupe PingPost flaps (three consecutive failures before paging), and a weekly 30-minute review of every page to fix, tune, or delete it.

**Q: Who runs the weekly review?**
A: Praveen, with Riley attending. Kevin will protect the time on the team calendar.

**Q: What does Praveen need from Kevin?**
A: "Mostly cover. Thirty minutes a week that doesn't get eaten by something else."

**Q: How will the detection pilot be used?**
A: In shadow mode, its noise labels would be a second opinion in the review. Praveen decides. Kevin confirmed that's the intended model ("It drafts, you decide") and that it won't be used to decide staffing.

**Q: When is Riley's first primary on-call week?**
A: Next week (week of Sep 14). Praveen will be secondary.

**Q: How are Praveen's extra shifts?**
A: Better since Riley started shadowing.

**Q: What happened to the Dana alert-hygiene sprint from July?**
A: It wasn't discussed. Its status is unknown from this meeting.

---

## Goals Review

*Reviewed against `goals/harborline-sre-goals-2026.md`. The Q2 check-ins (June 30) predate this meeting and are used.*

### Praveen Iyer
1. **Data point to log, Alert quality (40%, cut non-actionable pages by 50% by end of Q4):** 9 of 12 non-actionable (~75%), vs. 11 of 14 on Jul 28. No real movement yet, with about 16 weeks left in Q4. The dedupe and weekly review are now the main path to this goal and are Praveen-owned, so results count directly toward it. Using the review to log weekly counts would give a clean trend line *(suggested)*.
2. **Milestone near, Mentoring and team capability (30%, mentor one engineer through on-call certification):** Riley goes primary next week with Praveen as secondary, and the weekly review adds structured training. Log the date of Riley's first primary week as evidence.
3. **Not discussed (second meeting in a row), Reliability architecture (30%, ACT-111 design review):** At risk of slipping. Ask where it stands at the next 1:1 *(suggested)*.
4. **Q2 check-in follow-through:** "On-call load is too high… Most pages aren't actionable." Load is easing (Riley shadowing), but page quality isn't better yet.

### Riley Brooks *(not present, but affected)*
- **On-call certification (40%, shadowing plus a first primary week by end of Q3):** On track. Shadowing is under way and the first primary week falls in the last full weeks of Q3. Riley said in the Q2 check-in they were "nervous about being primary," so Praveen as secondary and the weekly review are good support. Kevin's own note says Riley "needs reps and confidence," so a quick check-in around that week would help *(suggested)*.

### Kevin Collins
1. **AI-assisted operations (30%, run the pilot in shadow mode in Q4 and track its false-positive rate):** The weekly review is a ready-made way to measure this: compare the pilot's noise label with Praveen's fix/tune/delete decision for every page *(suggested)*. Getting the team's most skeptical engineer to propose a use is a real win.
2. **Develop the team (30%, log evidence monthly; identify an on-call lead successor):** Praveen proposing, owning and teaching through the review is strong evidence for the on-call lead successor search. Log Praveen's initiative and Riley's milestone this month.
3. **Reduce customer-detected incidents (40%):** Praveen's alert-fatigue point is the link: less noise means real alerts get noticed. The review supports this goal.

---

## Other Insights

- **What went well: Kevin led with the person, and meant it.** "How are you doing? Really." The "really" invited an honest answer, and Praveen gave one ("Same as always. Pages are pages").
  - *Leadership lens (Carnegie, Part 2 #1: "Become genuinely interested in other people"):* a clear improvement on July, when the pilot pitch came before any listening.

- **What went well: Kevin listened, then asked, then got out of the way.** "Say more about that" got the alert-fatigue insight. "What would you do about it, if it were entirely up to you?" got a ready-made plan. Praveen did most of the talking.
  - *Leadership lens (Carnegie, Part 2 #4: "Be a good listener"; Part 4 #4: "Ask questions instead of giving direct orders"):* this is the exact coaching point from July 28, acted on.

- **What went well: the idea stayed Praveen's.** "That's your idea, so I want you to own it. What do you need from me?" Kevin asked what support was needed and committed on the spot ("Done").
  - *Leadership lens (Carnegie, Part 3 #7: "Let the other person feel that the idea is his or hers"):* Praveen is more likely to sustain a review he designed than a sprint handed down.

- **What went well: Kevin let Praveen save face on the pilot.** When Praveen said "I was pretty negative about the AI pilot last time," Kevin said "You were honest." Praveen changed his position without having to admit he was wrong, and Kevin reassured him directly about the job-security worry.
  - *Leadership lens (Carnegie, Part 4 #5: "Let the other person save face"; Part 3 #8: "See things from the other person's point of view"):*

- **What went well: appreciation that acknowledged the cost.** "I know I handed you the mentoring in the middle of a heavy stretch, and you've done it well anyway."
  - *Leadership lens (Carnegie, Part 1 #2: "Give honest and sincere appreciation"; Part 3 #3: "If you are wrong, admit it quickly"):* naming the heavy stretch closes a loop from July.

- **Could do better: the Dana sprint went unmentioned.** On July 28 Kevin's one concrete offer was to ask Dana for a two-week hygiene sprint. Six weeks later the same PingPost and disk alerts are still paging, and neither person brought it up. Praveen may have stopped expecting it, which fits his "Same as always." A one-line status (approved, declined, or not yet asked) would have been better than silence, and it matters for whether the weekly review is extra work on top of a sprint or a replacement for it *(suggested)*. This is the "open promises evaporating" pattern from Kevin's Q2 check-in again.
  - *Leadership lens (Carnegie, Part 3 #3: "If you are wrong, admit it quickly and emphatically"):* "I haven't gotten you an answer on the sprint yet; here's when I will" *(suggested)* keeps trust intact.

- **Could do better: agreement without dates.** The dedupe and the review have an owner but no start date, and it's unclear who implements the dedupe. "I'll protect it on the team calendar" also has no day or time. "When's the first review?" *(suggested)* would have made it real before the meeting ended.

- **Could do better: "Ready enough" deserved a follow-up.** Riley said in Q2 they were nervous about being primary. A question like "What would make Riley more than ready enough?" *(suggested)* could have surfaced any gaps before next week.

- **Pattern worth watching:** This is the fourth time the noisy-page concern has come up (May 5, Jun 30, Jul 28, Sep 8), with the same named alerts. Momentum is better now because Praveen owns a fix, but the page count hasn't moved yet. Also, a senior engineer saying "I've kind of stopped reacting to them" is an early warning for the next customer-detected incident.

- **Manager-only note:** Praveen described his on-call as "same as always" and said he has started tuning out repeat alerts. He said extra shifts are better since Riley started shadowing, and that mentoring is "the best part of the week." His energy and engagement were noticeably higher than on July 28. Keep watching his load now that the weekly review is added. Leave this out of any version shared with Praveen or others.
