# Kevin & Praveen: Bi-Weekly 1:1 | July 28, 2026

> **Fictional sample for a public YouTube video.** Kevin Collins (the creator) is the only real person, shown as the manager of a fictional SRE team. Harborline Cloud, its people, customers, tools and incidents are invented.

**Date:** July 28, 2026, 10:15 AM | **Duration:** 2m 21s
**Attendees:** Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)
**Company:** Harborline Cloud | **Type:** Bi-weekly 1:1
**Prior context:** `2026-05-05_kevin-sam_1on1.md` (Praveen not present but named in an action item and in the goals review). Also uses the Q2 check-ins dated June 30, 2026 in `goals/harborline-sre-goals-2026.md`.

---

## Executive Summary

A very short 1:1 (2m 21s, cut off by Kevin's hard stop for the ops review) with a tired senior engineer. Praveen came off a primary on-call week with **14 pages, 11 of them non-actionable**: PingPost flapping on the web login health check and Core Platform disk warnings that clear themselves in about five minutes. He was up at **3 a.m. three nights in a row** for alerts that fixed themselves. He is also covering some of **Marco's shifts** since Marco moved teams.

This is the **third time Praveen's workload has come up**: Sam called him "slammed" on May 5, Praveen said on-call load was too high and most pages weren't actionable in his June 30 Q2 check-in, and he said it again today.

Kevin offered one real piece of relief: he'll **ask Dana for a two-week alert-hygiene sprint** (PingPost thresholds, disk warnings, the whole list). Praveen called that "good." The rest of the meeting went the other way. Kevin pitched the detection pilot while Praveen was still describing the pain. Praveen pushed back ("The pilot is going to page us more, not less"). Kevin then asked him to take on **three things**: evaluate the pilot, **mentor Riley through on-call certification**, and pair with Sam on scheduler internals. The last one turned out to be already happening. Praveen and Sam have done **two sessions**, at Sam's request, which Kevin didn't know. That closes Kevin's May 5 action to "ask Praveen" (open 12 weeks).

Praveen's answers got shorter as the meeting went on ("Sure. Okay." / "I can do that." / "No. It's fine."). He agreed to everything but didn't sound bought in. Nothing came off his plate today.

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-260728-1 | Ask Dana for a two-week alert-hygiene sprint: PingPost thresholds, Core Platform disk warnings, the full noisy-alert list | Kevin Collins | Not set |  | Open |
| A-260728-2 | Evaluate the incident-detection pilot during its shadow period (judge which alerts it rates as noise vs. real) | Praveen Iyer | Shadow period (Q4 per goals) |  | Agreed |
| A-260728-3 | Mentor Riley through on-call certification | Praveen Iyer | Riley in rotation by September |  | Agreed |
| A-260728-4 | Continue scheduler-internals pairing with Sam (two sessions done) | Praveen Iyer | Ongoing |  | In progress |
| A-260728-5 | Continue work on backfill for Marco's role | Kevin Collins | Not set |  | In progress |
| A-260728-6 | Agree with Praveen what comes *off* his plate to make room for items 2–4, e.g. Marco's shifts *(suggested)* | Kevin Collins | Before next 1:1 |  | Suggested |
| A-260728-7 | Follow up with Praveen in writing on the Dana ask and give him a date for the hygiene sprint *(suggested)* | Kevin Collins | This week | 2026-07-31 | Suggested |
| A-260728-8 | Ask Praveen for the list of the 11 non-actionable pages to use as the sprint backlog and as a baseline for his alert-quality goal *(suggested)* | Kevin Collins | With item 1 |  | Suggested |
| A-260728-9 | Log goal evidence: Praveen's two pairing sessions with Sam, the Riley mentoring commitment, and last week's 11 of 14 non-actionable pages *(suggested)* | Kevin Collins | This week | 2026-07-31 | Suggested |

---

## Open Items from Earlier Meetings

| ID | From | Item | Owner | Age | Status now |
|---|---|---|---|---|---|
| A-260505-2 | May 5, 2026 (Sam 1:1) | Ask Praveen whether he can pair with Sam on scheduler internals (due "this week") | Kevin Collins | 12 weeks (84 days) | Dropped. **Closed / overtaken.** Kevin appears to have asked for the first time today. Sam had already asked Praveen himself, and they've done two sessions. |
| A-260505-1 | May 5, 2026 (Sam 1:1) | Bring the duplicate ACT-110 / ACT-160 action items to Dana as a postmortem process gap | Kevin Collins | 12 weeks (84 days) | Open. Not discussed. No record of it being closed. |
| A-260505-4 | May 5, 2026 (Sam 1:1) | Log Sam's incident-communication win as goal evidence | Kevin Collins | 12 weeks (84 days) | Open. Not discussed. No record of it being closed. |
|  | **Repeated concern** (Sam 1:1, May 5; Praveen Q2 check-in, June 30) | Praveen's on-call load is too high and most pages aren't actionable | Kevin Collins | 12 weeks since first raised; 4 weeks since Praveen's check-in | Open. **Raised again today.** One step taken (hygiene sprint request). The load itself (Marco's shifts) is unresolved, and three new asks were added. |

---

## Flip Cards

### Card 1: 11 of 14 pages were noise
Last week's primary rotation: 14 pages, 11 non-actionable. The causes were PingPost flapping on the web login health check and Core Platform disk warnings that clear in about five minutes. Praveen was up at 3 a.m. three nights in a row for alerts that fixed themselves. That's roughly 79% non-actionable, and a concrete baseline for his "cut non-actionable pages by 50%" goal.

### Card 2: The one real relief: an alert-hygiene sprint
Kevin will ask Dana for a two-week sprint of pure hygiene: PingPost thresholds, the disk warnings, "the whole list." It's the only item in the meeting that reduces Praveen's load, and it depends on Dana. No date was set.

### Card 3: Praveen is skeptical of the detection pilot
"The pilot is going to page us more, not less. Every new tool we've added has added pages." Kevin answered that it runs in shadow mode and pages no one at first, and conceded "Right, if it works." Praveen agreed to help evaluate it ("Sure. Okay.") but wasn't convinced.

### Card 4: Coverage gap since Marco left
Praveen is covering some of Marco's shifts on top of his own. Kevin said backfill is in progress and Riley will be in the rotation by September. Riley getting there depends on Praveen mentoring Riley through certification, so the relief also costs Praveen more work first.

### Card 5: Sam and Praveen are already pairing
Kevin asked Praveen to pair with Sam on scheduler internals, which was his May 5 action item. Praveen: "We've done two sessions already. He asked me himself. He's quick." Good news on growth for both of them, and a sign that Kevin's picture of the team is lagging.

### Card 6: Three new asks, nothing removed
Pilot evaluator, Riley's mentor, Sam's scheduler partner. Each one fits Praveen's goals, but he said all of them while describing a heavy on-call load, and nothing was taken off his plate.

---

## FAQ

**Q: Why was Praveen tired?**
A: He was primary on call last week and took 14 pages. 11 were non-actionable, including three 3 a.m. wake-ups in a row for alerts that cleared themselves. He's also covering some of Marco's shifts.

**Q: What are the noisy alerts?**
A: PingPost flapping on the web login health check, and Core Platform disk warnings that clear themselves within about five minutes.

**Q: What is Kevin doing about the noise?**
A: Asking Dana for a two-week alert-hygiene sprint covering PingPost thresholds, the disk warnings and the rest of the list. No date yet.

**Q: Will the detection pilot add pages?**
A: Not at first, according to Kevin. It runs in shadow mode and pages no one. The hope is that it learns patterns like the self-clearing disk warnings and reduces noise over time. Praveen is doubtful because every earlier tool added pages. The shadow period is meant to answer that.

**Q: What is Praveen's role in the pilot?**
A: Evaluation. Kevin wants him to judge the pilot's calls because he "know[s] which alerts are junk better than anyone."

**Q: When does Riley join the on-call rotation?**
A: Kevin said by September. Praveen agreed to mentor Riley through on-call certification.

**Q: Is the Sam–Praveen scheduler pairing happening?**
A: Yes. They've done two sessions, and Sam asked Praveen directly. Kevin didn't know until this meeting.

**Q: Did Praveen ask for anything?**
A: When Kevin asked "Anything I can unblock?" at the end, Praveen said "No. It's fine." He had already named two problems earlier: noisy pages and covering Marco's shifts.

---

## Goals Review

*Reviewed against `goals/harborline-sre-goals-2026.md`. The Q2 check-ins (June 30) predate this meeting and are used.*

### Praveen Iyer
1. **Baseline to log, Alert quality (40%, cut non-actionable pages by 50% by end of Q4):** Last week, 11 of 14 pages (~79%) were non-actionable. Log it as a data point with the date and the two main sources (PingPost login check, Core Platform disk warnings). The hygiene sprint is the most direct route to this goal. **Consider having Praveen lead or scope the sprint** so the result counts as his *(suggested)*.
2. **Milestone started, Mentoring and team capability (30%, mentor one engineer through on-call certification):** Praveen agreed to mentor Riley through certification, which is exactly this measure. Track it to Riley's certification.
3. **Supporting evidence, same goal:** Two scheduler-internals sessions with Sam, which Sam asked for. Log it. It isn't the certification milestone, but it's real capability-building.
4. **Not discussed, Reliability architecture (30%, design review for ACT-111):** No mention today. With three new asks, this one is at risk of slipping. Check where it stands at the next 1:1 *(suggested)*.
5. **Q2 check-in follow-through:** Praveen said "On-call load is too high since the team got smaller." Kevin's own note said "Watch workload; he's covering extra shifts." Four weeks later the load is the same or higher, and Praveen has more commitments.

### Riley Brooks *(not present, but affected)*
- **On-call certification (40%, first primary week by end of Q3):** "In the rotation by September," with Praveen as mentor, fits the goal, but end of Q3 is about nine weeks away. Riley's Q2 check-in mentioned nerves about being primary, which makes a mentor with time to spare more important.

### Sam Torres *(not present, but affected)*
- **Growth follow-through:** The scheduler depth Sam asked for in May ("reading runbooks like a tourist") and in the June 30 check-in is happening: two sessions with Praveen, started by Sam. Praveen: "He's quick." Worth logging, and it came from Sam's own initiative.

### Kevin Collins
1. **AI-assisted operations (30%, run the pilot in shadow mode in Q4 and track its false-positive rate):** Praveen as evaluator is a strong choice, and his skepticism is useful for measuring false positives. Consider giving him the evaluation criteria up front, e.g. "the pilot must not increase pages" *(suggested)*.
2. **Develop the team (30%, log evidence monthly; identify an on-call lead successor):** Kevin didn't know about the Sam–Praveen pairing, which suggests evidence logging has gaps. Praveen is an obvious on-call lead candidate, but adding that now would add to his load.
3. **Reduce customer-detected incidents (40%):** Not discussed directly. Noisy paging that trains people to expect false alarms makes real alerts easier to miss, so the hygiene sprint supports this goal too.

---

## Other Insights

- **What went well: Kevin acknowledged the pain and made a concrete offer.** "Look, I hear you. Let me ask Dana for a sprint to clean up the alert rules." It was specific (two weeks, PingPost, disk warnings, the whole list) and it's the one moment Praveen responded positively ("That would be good").
  - *Leadership lens (Carnegie, Part 3 #9: "Be sympathetic with the other person's ideas and desires"):* the sympathy came with an action, which is what made it land.

- **What went well: Kevin respected the pushback instead of arguing it down.** When Praveen said "If it works," Kevin answered "Right, if it works. That's what the shadow period is for."
  - *Leadership lens (Carnegie, Part 3 #2: "Show respect for the other person's opinions. Never say 'You're wrong'"):* conceding the uncertainty kept the pilot conversation from becoming a debate.

- **What went well: specific recognition of expertise.** "You know which alerts are junk better than anyone" and "You'd be the best person for it" are true and specific.
  - *Leadership lens (Carnegie, Part 2 #6: "Make the other person feel important, and do it sincerely"):* sincere, but each compliment came attached to a new request, which blunts it (see below).

- **Could do better: Kevin pitched before he listened.** Praveen was describing three 3 a.m. wake-ups when Kevin jumped to "good timing, actually, because this is exactly what the detection pilot is for." Praveen had to interrupt to push back. A follow-up question like "Which of those eleven hurt most?" or "How are you holding up?" *(suggested)* would have let him finish and would have produced the sprint backlog.
  - *Leadership lens (Carnegie, Part 2 #4: "Be a good listener. Encourage others to talk about themselves"; Part 3 #6: "Let the other person do a great deal of the talking"):* Praveen talked for well under half of a 2-minute meeting.

- **Could do better: three asks to an overloaded person, with nothing removed.** Praveen raised load twice (pages, Marco's shifts). The replies were a request to Dana, a backfill with no date, and three new roles. Each role fits his goals, but framed this way they read as more work. A better approach *(suggested)*: first agree what comes off, e.g. "If you mentor Riley, I'll take you off Marco's shifts until September," then make the ask.
  - *Leadership lens (Carnegie, Part 3 #8: "Try honestly to see things from the other person's point of view"; Part 1 #3: "Arouse in the other person an eager want"):* connect the asks to what Praveen wants, which is fewer pages and fewer nights. "Mentoring Riley gets you off nights sooner" gives him a reason to want it.

- **Could do better: the short answers were a signal.** "Sure. Okay." / "I can do that." / "No. It's fine." A senior engineer who has raised the same concern three times and then says "It's fine" may have stopped expecting it to change. The hard stop meant this went unexamined. "Hang in there" is kind, but it isn't a commitment.
  - *Leadership lens (Carnegie, Part 2 #1: "Become genuinely interested in other people"):* consider a follow-up within the week *(suggested)*, not two weeks out, and protect the full slot next time.

- **Could do better: the May 5 promise went stale.** Kevin committed on May 5 to ask Praveen about pairing with Sam "this week." He asked 12 weeks later, after Sam and Praveen had already set it up themselves. The outcome was fine because the team took initiative. But it's the "open promises evaporating" pattern from Kevin's own Q2 check-in, on a small scale. Close the May 5 item and credit Sam for starting it.
  - *Leadership lens (Carnegie, Part 3 #3: "If you are wrong, admit it quickly and emphatically"):* a quick "I meant to ask you in May, glad you two got there first" builds trust.

- **Pattern worth watching:** Praveen is the go-to person for the scheduler, alert triage, pilot evaluation, Riley's certification and Sam's growth, while also covering Marco's shifts. That's a single point of failure for the team and a retention risk. If the hygiene sprint isn't approved or dated soon, Praveen's third report of the same concern won't have led to any change.

- **Manager-only note:** Praveen said he was tired after three consecutive 3 a.m. wake-ups and extra night coverage, and his answers were brief. Check in soon on his workload and consider easing his night coverage. Leave this out of any version shared with Praveen or others.
