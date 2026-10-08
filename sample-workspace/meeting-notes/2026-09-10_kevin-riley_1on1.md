# Kevin & Riley: Bi-Weekly 1:1 | September 10, 2026

> **Fictional sample for a public YouTube video.** Kevin Collins (the creator) is the only real person, shown as the manager of a fictional SRE team. Harborline Cloud, its people, customers, tools and incidents are invented.

**Date:** September 10, 2026, 2:01 PM | **Duration:** 3m 38s
**Attendees:** Kevin Collins (SRE Manager), Riley Brooks (SRE I)
**Company:** Harborline Cloud | **Type:** Bi-weekly 1:1
**Prior context:** `2026-09-08_kevin-praveen_1on1.md` (Riley's first primary week and the weekly alert review), `2026-07-28_kevin-praveen_1on1.md` (Praveen agreed to mentor Riley), and `2026-05-05_kevin-sam_1on1.md` (the April 21 incident and ACT-110 / ACT-160). This is the first saved Kevin–Riley 1:1. Also uses the Q2 check-ins dated June 30, 2026 in `goals/harborline-sre-goals-2026.md`.

---

## Executive Summary

A short confidence-building 1:1 four days before Riley's **first primary on-call week (starts Monday, Sep 14)**. Riley opened with nerves: *"I keep thinking about April. What if something like that happens and I miss it?"* Kevin reframed it: in April **nobody missed a page, because there was no page**. The alert wasn't routed to anyone, that's a system problem, and **Sam is fixing it**. Riley won't be alone: **Praveen is secondary all week**, and "calling your secondary isn't failing, it's the process working."

Kevin told the story of his own first on-call (restarting the wrong production database and taking down order entry for 20 minutes), then used it to raise one piece of feedback gently: the **Keller & Moss ticket was reopened last week** because Riley closed it when the job completed, not when the customer confirmed. Riley owned it; Kevin said "that's how everybody learns that one" and asked Riley to **add "customer confirmed" to the close checklist**.

On goals, Riley picked a runbook for the automation goal: **replica rebuild**, still manual, which **cost 38 minutes in the February incident** and has an **action item, ACT-121, open since last year**. Kevin called it "a great pick."

Kevin noticed Riley was quiet about the AI pilot. Riley said they wonder whether it's worth learning all this if AI does on-call in a couple of years. Kevin's answer: the pilot can say "this looks like April," but it can't decide whether to wake Praveen or keep Norrland's payroll admin calm at 3 a.m. "That's judgment and relationships, and that's the job." Kevin also invited Riley to **Praveen's new weekly alert review** ("I'd love that") and will **check in midweek, Wednesday (Sep 16)**, "not to supervise."

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-260910-1 | Add "customer confirmed" to the ticket close checklist | Riley Brooks | Not set (immediately implied) |  | Agreed |
| A-260910-2 | Automate the replica rebuild runbook (ACT-121) for the automation goal | Riley Brooks | Not set |  | Agreed (Kevin approved the pick) |
| A-260910-3 | Join Praveen's weekly 30-minute alert review | Riley Brooks | When the review starts |  | Agreed |
| A-260910-4 | Midweek check-in with Riley during the on-call week | Kevin Collins | Wed, Sep 16 | 2026-09-16 | Planned |
| A-260910-5 | Confirm with Sam whether ProcWatch alerts page before Monday; if not, tell Riley and Praveen which alerts still don't page and how to watch for them *(suggested)* | Kevin Collins | Before Sep 14 | 2026-09-14 | Suggested |
| A-260910-6 | Agree a scope, target date and success measure for ACT-121 (baseline: 38 minutes manual in February) (with Riley Brooks) *(suggested)* | Kevin Collins | Next 1:1 |  | Suggested |
| A-260910-7 | Confirm the first alert-review date and the protected calendar slot (Kevin's Sep 8 commitment) so Riley's invite is real (with Praveen Iyer) *(suggested)* | Kevin Collins | Before Sep 14 | 2026-09-14 | Suggested |
| A-260910-8 | Log goal evidence: runbook selected (ACT-121), first primary week once complete, Praveen as secondary (his mentoring measure) *(suggested)* | Kevin Collins | End of September | 2026-09-30 | Suggested |
| A-260910-9 | Close the loop on Riley's AI concern, e.g. let Riley see the pilot's shadow-mode labels in the alert review so the tool feels like something they use *(suggested)* | Kevin Collins | Q4 (shadow mode) |  | Suggested |

---

## Open Items from Earlier Meetings

| ID | From | Item | Owner | Age | Status now |
|---|---|---|---|---|---|
|  | **Repeated concern** (Riley Q2 check-in Jun 30; noted in Jul 28 and Sep 8 summaries) | Riley is nervous about being primary on call | Kevin Collins | ~10 weeks (72 days) since Riley's check-in | Open. **Raised again today by Riley,** now tied to April. Kevin addressed it directly (April reframe, Praveen as secondary, his own story). Keep watching through the week. |
| A-260908-9 | Sep 8, 2026 (Praveen 1:1) | Check in with Riley before and after the first primary week *(suggested then)* | Kevin Collins | 2 days | Open. **"Before" done** (this meeting). A midweek check-in is planned for Sep 16. The "after" check-in isn't scheduled yet. |
| A-260908-1 | Sep 8, 2026 (Praveen 1:1) | Set up the weekly alert review and bring Riley | Praveen Iyer | 2 days | Open. **In progress.** Riley is invited and keen. No start date mentioned. |
| A-260908-3 | Sep 8, 2026 (Praveen 1:1) | Protect the weekly alert-review slot on the team calendar | Kevin Collins | 2 days | Open. Not mentioned. |
| A-260908-5 | Sep 8, 2026 (Praveen 1:1) | Riley's first primary week, with Praveen as secondary | Riley Brooks, Praveen Iyer | 2 days | Open. **Confirmed** for Mon, Sep 14. |
| A-260728-3 | Jul 28, 2026 (Praveen 1:1) | Mentor Riley through on-call certification | Praveen Iyer | 6 weeks (44 days) | Open. **On track.** Riley is going primary with Praveen as secondary. |
| A-260728-1 | Jul 28, 2026 (Praveen 1:1) | Ask Dana for a two-week alert-hygiene sprint | Kevin Collins | 6 weeks (44 days) | Open. Not mentioned (third meeting with no status). |
| A-260505-1 | May 5, 2026 (Sam 1:1) | Bring duplicate ACT-110 / ACT-160 (route ProcWatch alerts to paging) to Dana; merge, one owner, a date | Kevin Collins | 18 weeks (128 days) | Open. **Partial update.** Kevin said the routing problem is "Sam's fixing it," which suggests an owner now exists. Whether it went to Dana, and when the fix lands, wasn't stated. |
| A-260505-4 | May 5, 2026 (Sam 1:1) | Log Sam's incident-communication win as goal evidence | Kevin Collins | 18 weeks (128 days) | Open. Not mentioned. No record it's closed. |
|  | **2025 (per Riley)** | ACT-121: automate the replica rebuild | Unassigned until today | Open "since last year" (8+ months at minimum) | Open. **Picked up today** by Riley as their automation goal. It cost 38 minutes in the February incident while still open. |

---

## Flip Cards

### Card 1: Riley goes primary Monday
First primary on-call week starts Monday, Sep 14, with Praveen as secondary all week. Riley: "Nervous, honestly." Kevin's framing: calling your secondary "isn't failing, it's the process working." Kevin checks in Wednesday, "not to supervise."

### Card 2: April wasn't a missed page
Riley's fear was missing something like April. Kevin: "Nobody missed a page. There was no page. The alert wasn't routed to anyone. That's a system problem, and Sam's fixing it. You can't miss what never reaches you."

### Card 3: Kevin's first on-call story
Kevin restarted the wrong production database at 11 a.m. and took down order entry for 20 minutes. His manager didn't yell; he asked what Kevin would check next time before hitting enter. Kevin still asks himself that. Riley: "That actually makes me feel better."

### Card 4: Close on customer confirmation
The Keller & Moss ticket was reopened last week. Riley saw the job complete and closed it. The rule: close when the customer confirms it's fixed, not when we think it's fixed. The fix is to add "customer confirmed" to the close checklist. This is the exact measure in Riley's customer-communication goal.

### Card 5: Automation pick: replica rebuild (ACT-121)
Still manual, cost 38 minutes in the February incident, and ACT-121 has been open since last year. Kevin: "It's real, it's measurable." Same pattern as ACT-110: an old action item left open and then showing up in an incident.

### Card 6: Why learn this if AI does on-call?
Riley asked it out loud. Kevin: the pilot can say "this looks like April," but it can't decide whether to wake Praveen or keep Norrland's payroll admin calm at 3 a.m. "The tool makes you faster once you know what right looks like."

### Card 7: Weekly alert review as training
Praveen's new 30-minute review covers every page from the week, and he wants Riley in it. Kevin: "It's the best on-call training we've got." Riley: "I'd love that."

---

## FAQ

**Q: When is Riley's first primary on-call week, and who backs them up?**
A: It starts Monday, Sep 14. Praveen is secondary all week.

**Q: Why was Riley worried about April?**
A: Riley worried they'd miss something like the April incident. Kevin explained no one was paged in April because the alert wasn't routed, a system problem that Sam is fixing.

**Q: Is the April routing fix done?**
A: Not stated. Kevin said "Sam's fixing it." Whether it will be live before Sep 14 wasn't discussed.

**Q: What happened with Keller & Moss?**
A: Riley closed the ticket when the job completed, before the customer confirmed, and the customer reopened it last week. Riley will add "customer confirmed" to their close checklist.

**Q: Which runbook is Riley automating?**
A: Replica rebuild. It's manual, took 38 minutes in the February incident, and is tracked as ACT-121, open since last year. No target date was set.

**Q: What was Riley's concern about the AI pilot?**
A: Whether it's worth learning the system if AI does on-call in a couple of years. Kevin said the pilot handles pattern matching, but deciding and handling customers is judgment and relationships, which is the job.

**Q: What is the weekly alert review?**
A: A 30-minute review of every page from the week, run by Praveen (from the Sep 8 1:1). Riley is invited as on-call training.

**Q: When is Kevin's next check-in with Riley?**
A: Wednesday, Sep 16, midweek during the on-call week.

---

## Goals Review

*Reviewed against `goals/harborline-sre-goals-2026.md`. The Q2 check-ins (June 30) predate this meeting and are used.*

### Riley Brooks
1. **Milestone imminent, On-call certification (40%, shadowing plus a first primary week by end of Q3):** Shadowing is done or under way (per Sep 8), and the first primary week starts Sep 14, finishing before Q3 ends on Sep 30. Log the date once the week is complete. Kevin's Q2 note ("needs reps and confidence more than instruction") matches how he ran this meeting.
2. **Started, Automation (30%, automate one manual runbook end to end):** Riley chose the replica rebuild (ACT-121). It's a strong pick because it has a baseline (38 minutes in the February incident) and closes a stale action item. Log the selection now. It needs a scope and a date *(suggested)* so it doesn't become the next item "open since last year."
3. **One miss, Customer communication (30%, close tickets only with confirmed customer resolution):** The Keller & Moss ticket was closed before customer confirmation and reopened. Riley owned it and has a concrete fix. Record it as a learning point with the fix, and look for clean closes over the rest of Q3 and Q4 as evidence *(suggested)*.
4. **Q2 check-in follow-through:** Riley said "Nervous about being primary." Still true today, now with specific support in place (secondary, midweek check-in, alert review).

### Praveen Iyer *(not present, but affected)*
- **Mentoring and team capability (30%, mentor one engineer through on-call certification):** Riley's first primary week with Praveen as secondary is the milestone for this measure. Log it together with Riley's.

### Sam Torres *(not present, but affected)*
- **Reduce repeat incidents (40%, own one preventive fix end to end):** "Sam's fixing it" suggests Sam now owns the April routing fix (ACT-110 / ACT-160), as the May 5 summary proposed. **Confirm with Sam** before logging *(suggested)*.

### Kevin Collins
1. **Reduce customer-detected incidents (40%):** Riley's week starts before anyone has confirmed the ProcWatch routing fix is live. If it isn't, an April-style event could still be customer-detected. Worth checking before Monday *(suggested)*.
2. **Develop the team (30%, log evidence monthly):** This meeting has three pieces of Riley evidence and one of Praveen's. September logging is due soon.
3. **AI-assisted operations (30%, pilot in shadow mode in Q4):** Two engineers in three days (Praveen on Sep 8, Riley today) have raised job-related worries about the pilot. That's an adoption signal. A short team-wide message on what the pilot will and won't do *(suggested)* may help more than one-to-one reassurance.

---

## Other Insights

- **What went well: Kevin opened with Riley's feelings, not logistics.** "How are you feeling about it?" got an honest "Nervous, honestly," and the rest of the meeting responded to that.
  - *Leadership lens (Carnegie, Part 2 #1: "Become genuinely interested in other people"):* the whole meeting was built around Riley's concern, not Kevin's agenda.

- **What went well: Kevin told his own mistake before raising Riley's.** The wrong-database story came first, then "on that theme" led into Keller & Moss. Riley apologized, but the feedback landed without sting.
  - *Leadership lens (Carnegie, Part 4 #3: "Talk about your own mistakes before criticizing the other person"):* close to a textbook example.

- **What went well: the fault was made to seem easy to fix.** "No need. That's how everybody learns that one. Just add 'customer confirmed' to your close checklist and you'll never think about it again."
  - *Leadership lens (Carnegie, Part 4 #8: "Use encouragement. Make the fault seem easy to correct"; Part 4 #5: "Let the other person save face"):*

- **What went well: the runbook was Riley's choice.** Kevin asked "Have you picked a runbook?" rather than assigning one, and then praised the choice with reasons ("It's real, it's measurable").
  - *Leadership lens (Carnegie, Part 3 #7: "Let the other person feel that the idea is his or hers"; Part 4 #6: "Praise the slightest improvement"):*

- **What went well: Kevin noticed the quiet and asked about it.** "You seem quiet about the AI pilot" drew out a worry Riley hadn't planned to raise, and "I'm glad you said that out loud" made it safe.
  - *Leadership lens (Carnegie, Part 3 #9: "Be sympathetic with the other person's ideas and desires"):*

- **What went well: a strong close.** "You're ready. Go get 'em." after "not to supervise" gave Riley a reputation to live up to without adding pressure.
  - *Leadership lens (Carnegie, Part 4 #7: "Give the other person a fine reputation to live up to"):*

- **Could do better: Kevin answered the AI worry before exploring it.** Kevin's reply was the longest turn in the meeting, and Riley's response ("Okay. That's a better way to think about it") may be agreement or may be politeness. A question first, such as "What part of it worries you most?" *(suggested)*, would have shown whether this is about job security, relevance of skills, or something else.
  - *Leadership lens (Carnegie, Part 3 #6: "Let the other person do a great deal of the talking"; Part 2 #4: "Be a good listener"):* Riley's turns were mostly two to five words. Most of the meeting was Kevin talking.

- **Could do better: the reassurance depends on a fix nobody confirmed.** "You can't miss what never reaches you" is true, but the risk in April was to customers, not just to the on-call engineer. If the ProcWatch routing isn't live by Monday, Riley is primary with the same gap. Confirming its status with Sam and telling Riley plainly *(suggested)* would make the reassurance complete.
  - *Leadership lens (Carnegie, Part 3 #8: "Try honestly to see things from the other person's point of view"):* from Riley's side, "what's still unrouted?" is the practical question behind "what if I miss it?"

- **Could do better: no question about what Riley needs.** Nerves came up in June and again today. Kevin gave support (Praveen, the story, the check-in), but didn't ask "What would make you feel more ready for Monday?" *(suggested)*. This is the same follow-up the Sep 8 summary suggested after Praveen called Riley "ready enough."

- **Could do better: ACT-121 left without a date.** It's a good pick, but it's already been open since last year. A rough target (e.g. a first draft by end of October) *(suggested)* keeps it from repeating that history.

- **Pattern worth watching:** ACT-110 (2025) stayed open and April happened. ACT-121 (2025) stayed open and cost 38 minutes in February. Old action items keep appearing in new incidents. That's the "open promises evaporating" concern in Kevin's own Q2 check-in, and it supports the May 5 idea of auditing open RCA action items *(suggested)*. Separately, the Dana alert-hygiene sprint has now gone three meetings with no status.

- **Manager-only note:** Riley said they're nervous about the first primary week and questioned the long-term value of learning on-call skills given AI. They responded well to reassurance and were enthusiastic about the alert review. Check in Wednesday as planned and again after the week ends. Leave this out of any version shared with Riley or others.
