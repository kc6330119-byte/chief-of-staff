# Dana & Kevin: 1:1 with Manager | September 22, 2026

> **Fictional sample for a public YouTube video.** Kevin Collins (the creator) is the only real person, shown as the manager of a fictional SRE team. Harborline Cloud, its people, customers, tools and incidents are invented.

**Date:** September 22, 2026, 9:02 AM | **Duration:** 4m 26s
**Attendees:** Dana Whitfield (Kevin's manager), Kevin Collins (SRE Manager)
**Company:** Harborline Cloud | **Type:** 1:1 with manager
**Prior context:** This is the first saved Dana–Kevin 1:1. Dana is named in every earlier summary, and Kevin reported on all of them today: `2026-05-05_kevin-sam_1on1.md` (April 21 incident, ACT-110 / ACT-160, "take it to Dana"), `2026-07-28_kevin-praveen_1on1.md` (the Dana alert-hygiene sprint ask), `2026-09-08_kevin-praveen_1on1.md` (weekly alert review, pilot and staffing worry), `2026-09-10_kevin-riley_1on1.md` (Riley's first primary week, AI question), `2026-09-15_kevin-sam_1on1.md` (Sam owns ACT-110, Sep 29 change board). Also uses the Q2 check-ins dated June 30, 2026 in `goals/harborline-sre-goals-2026.md`.

---

## Executive Summary

A tight, well-run upward 1:1. Kevin came in with **"three wins and two asks"** and got a yes to both asks.

**Wins, each credited by name:**
1. **Sam** owns **ACT-110**, the scheduler paging fix behind April, is merging the April duplicate (ACT-160) into it, and is shipping the routing rule. Sam's **median time to acknowledge on Harborline Pay fell from ~9 min (June) to 4 min**.
2. **Riley** finished a **first primary on-call week**: **6 pages, 5 handled solo, the 6th escalated to Praveen** "exactly the way we'd want."
3. **Praveen** started the **weekly alert review**: in two sessions the team **deleted 7 alert rules and tuned 4**, and **noise pages dropped from 9 a week to 4**.

**Asks:**
1. **Two-week alert-hygiene sprint, starting next sprint.** Kevin opened by owning the miss: he promised Praveen on July 28 to ask Dana and didn't, and his notes flagged it when Praveen raised the concern again on Sep 8. **Dana approved** ("Given the numbers you just gave me, that's an easy yes"). This **closes an item open 8 weeks**.
2. **Back Sam's routing change at the Sep 29 change board.** Kevin is sponsoring; **Dana will add her name**.

Dana then raised two things. On the **AI pilot**, the team's reaction is "mixed, and healthy" (Praveen went from skeptic to wanting shadow-mode noise labels as a second opinion; Riley asked whether on-call is worth learning). Dana said she's **getting a question from above: whether AI means on-call can run with fewer people.** Kevin's answer: April was "not a headcount problem. It's an attention problem. The tool gives back attention," which he'd spend on root causes and on people like Riley, not on cutting the rotation. **Dana asked to borrow the line.** Dana also praised Kevin's 1:1 notes; Kevin explained he uses Claude on an approved setup, the team knows, and each person gets their own summary.

On Kevin's goals: **no customer-detected incident since April**, and **Praveen is Kevin's pick as successor for the on-call lead role**. Dana agreed and asked Kevin to **put it in his self-assessment "in exactly those words."**

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-260922-1 | Run a two-week alert-hygiene sprint | Kevin Collins | Starts next sprint (date not stated) |  | **Approved by Dana** |
| A-260922-2 | Add her name in support of Sam's ProcWatch routing change | Dana Whitfield | Change board, Tue Sep 29 | 2026-09-29 | Agreed |
| A-260922-3 | Write in the self-assessment: no customer-detected incidents since April, and Praveen as successor for the on-call lead role, "in exactly those words" | Kevin Collins | Self-assessment (date not stated) |  | Agreed |
| A-260922-4 | Use Kevin's "attention, not headcount" framing when answering the question from above | Dana Whitfield | Not set |  | Informal ("It's yours") |
| A-260922-5 | Tell Praveen today that the sprint is approved, credit his numbers, and ask him to scope or lead it; decide how it fits with his weekly review *(suggested)* | Kevin Collins | This week | 2026-09-25 | Suggested |
| A-260922-6 | Tell Sam that Dana is backing the change, and tell Sam, Riley and Praveen that their wins were named to Dana *(suggested)* | Kevin Collins | This week | 2026-09-25 | Suggested |
| A-260922-7 | Talk with Praveen about the on-call lead successor path, and agree what comes off his plate to make room *(suggested)* | Kevin Collins | Before the self-assessment is submitted |  | Suggested |
| A-260922-8 | Raise the Marco backfill with Dana, especially now that "fewer people" is being asked upstream *(suggested)* | Kevin Collins | Next Dana 1:1 |  | Suggested |
| A-260922-9 | Offer Dana data for her answer upward: weekly page counts (9 → 4), Riley's week, and the pilot's shadow-mode false-positive rate once Q4 starts *(suggested)* | Kevin Collins | Next Dana 1:1 |  | Suggested |
| A-260922-10 | Bring the process gap to Dana: postmortem action items go unfinished or get duplicated (ACT-110 / ACT-160, ACT-121), and propose a regular check using Sam's RCA-wiki query *(suggested)* | Kevin Collins | Next Dana 1:1 |  | Suggested |
| A-260922-11 | Log September goal evidence: Riley's primary week, Praveen's review results and mentoring milestone, Sam's time to acknowledge *(suggested)* | Kevin Collins | End of September | 2026-09-30 | Suggested |

---

## Open Items from Earlier Meetings

| ID | From | Item | Owner | Age | Status now |
|---|---|---|---|---|---|
| A-260728-1 | Jul 28, 2026 (Praveen 1:1) | Ask Dana for a two-week alert-hygiene sprint | Kevin Collins | 8 weeks (56 days) | Done. **Closed today. Approved.** Kevin owned the delay himself. Praveen still needs to hear it (see Sep 8 row below). |
|  | **Repeated concern** (May 5; Jun 30; Jul 28; Sep 8; today) | Praveen's on-call load and non-actionable pages | Kevin Collins | 20 weeks since first raised | Open. **5th time on record, first time with good news.** Noise down from 9/week to 4, and the sprint is approved. Praveen's load is still an issue: he's now reviewer, mentor, pilot evaluator, and proposed successor. |
| A-260505-1 | May 5, 2026 (Sam 1:1) | Bring duplicate ACT-110 / ACT-160 to Dana as a postmortem process gap: merge, one owner, a date | Kevin Collins | 20 weeks (140 days) | Open. **Mostly done.** Dana heard the fix, the owner (Sam) and the date (Sep 29). The *process gap* itself (unfinished and duplicated action items) was only touched on in "an action item nobody finished." No audit was proposed. |
| A-260915-9 | May 5, 2026 → Sep 15, 2026 | Credit Sam by name to Dana *(suggested)* | Kevin Collins | 20 weeks | Done. **Done.** ACT-110 ownership and time to acknowledge, both named. |
| A-260908-10 | Sep 8, 2026 (Praveen 1:1) | Credit Praveen's alert-review idea to Dana by name *(suggested)* | Kevin Collins | 14 days | Done. **Done**, with results. |
| A-260908-6 | Sep 8, 2026 (Praveen 1:1) | Tell Praveen where the Dana sprint request stands *(suggested)* | Kevin Collins | 14 days | Open. Now answerable: approved. Not yet told, as far as this meeting shows. |
| A-260908-2 | Sep 8, 2026 (Praveen 1:1) | Dedupe PingPost flaps (three consecutive failures) | Praveen Iyer | 14 days | Open. Not mentioned specifically. May be part of the 7 deleted / 4 tuned. |
| A-260728-5 | Jul 28, 2026 (Praveen 1:1) | Continue work on backfill for Marco's role | Kevin Collins | 8 weeks (56 days) | Open. **Not raised with Dana**, in the one meeting where it could move. Now at risk given the "fewer people" question. |
|  | Jul 28 / Sep 8, 2026 | Praveen's ACT-111 design review (Reliability architecture goal) | Praveen Iyer | Not discussed in three straight meetings | Open. Not mentioned. |
| A-260915-3 | Sep 15, 2026 (Sam 1:1) | Sponsor Sam's change at the Sep 29 board | Kevin Collins | 7 days | Open. **On track**, with Dana now backing it too. |
| A-260915-4 | Sep 15, 2026 (Sam 1:1) | Log Sam's time-to-acknowledge improvement with dates | Kevin Collins | 7 days | Open. Numbers reported to Dana; whether they were logged wasn't stated. |
| A-260915-7 | Sep 15, 2026 (Sam 1:1) | Tell Riley and Praveen that ProcWatch scheduler alerts still don't page until the fix ships *(suggested)* | Kevin Collins | 7 days | Open. Not mentioned. Riley's week finished without incident, but the gap is still open until the change is deployed. |
| A-260505-4 | May 5, 2026 (Sam 1:1) | Log Sam's incident-communication win (15-min updates, 0 escalations) | Kevin Collins | 20 weeks (140 days) | Open. Not mentioned. No record it's closed. |
|  | Sep 10, 2026 (Riley 1:1) | Riley automates the replica rebuild runbook (ACT-121); scope and date *(suggested)* | Riley Brooks, Kevin Collins | 12 days (ACT-121 itself open since 2025) | Open. Not mentioned. |
|  | **Repeated concern** (Praveen Sep 8; Riley Sep 10; Sam Sep 15; today) | What the AI pilot means for people's roles | Kevin Collins | 14 days | Open. **Now raised from above.** Dana is being asked whether AI means fewer people on-call. On Sep 8 Kevin told Praveen the pilot isn't "deciding who's on the team." |

---

## Flip Cards

### Card 1: Three wins, each with a name and a number
Sam: owns ACT-110, time to acknowledge ~9 → 4 min. Riley: first primary week, 6 pages, 5 solo, 1 clean escalation to Praveen. Praveen: weekly review, 7 rules deleted, 4 tuned, noise pages 9 → 4 a week. Dana: "That's a good month."

### Card 2: Kevin owned the July miss
"I should have asked you this in July." Praveen raised the noise, Kevin promised to ask Dana, and didn't, until his notes flagged it in September. Dana: "Thanks for owning that. Yes." The sprint starts next sprint.

### Card 3: Dana backs the April fix
Sam's routing change goes to the change board on Sep 29. Kevin sponsors it and Dana will add her name. It's "the fix behind April."

### Card 4: "Not a headcount problem. An attention problem."
Leadership is asking Dana whether AI means fewer people on-call. Kevin: April cost more than three hours and three customers' pay runs because of an unfinished action item. The tool gives back attention; spend it on root causes and people, not on cutting the rotation. Dana: "Can I borrow that line?"

### Card 5: Team reaction to the pilot is "mixed, and healthy"
Praveen went from worrying about more pages to wanting shadow-mode noise labels in his review. Riley asked whether on-call is worth learning. Kevin's answer to Riley: the tool can say "this looks like April," but it can't decide to wake someone or keep a customer calm at 3 a.m.

### Card 6: Kevin's goals: no customer-detected incident since April; Praveen as successor
Dana agreed on Praveen for the on-call lead role and asked Kevin to put both in his self-assessment "in exactly those words."

### Card 7: How the notes got better
Kevin runs transcripts through Claude on the approved setup. The team knows and each person gets their own summary. It gets him ~80% of the way; he fixes the rest and spends the time saved on people's goals.

---

## FAQ

**Q: Did Dana approve the alert-hygiene sprint?**
A: Yes. Two weeks, starting next sprint. Kevin first asked for it on July 28 and acknowledged the delay.

**Q: How much has alert noise dropped?**
A: Noise pages went from 9 a week to 4 after two sessions of Praveen's weekly review (7 rules deleted, 4 tuned).

**Q: How did Riley's first primary week go?**
A: Six pages. Riley handled five alone and escalated one to Praveen, which Kevin said was exactly the right call.

**Q: What is Dana doing for Sam's routing change?**
A: Adding her name alongside Kevin's sponsorship at the Sep 29 change board.

**Q: What is leadership asking about AI?**
A: Whether it means on-call can run with fewer people. Kevin argued the gain is attention, which should go to root causes and developing people, not to reducing the rotation. No decision was discussed.

**Q: Does the team know Kevin uses Claude for 1:1 notes?**
A: Yes. Kevin told them when he started, each person gets their own summary, and it runs on the approved setup.

**Q: Who is Kevin's successor for the on-call lead role?**
A: Praveen. Dana agreed.

**Q: Was Marco's backfill discussed?**
A: No.

---

## Goals Review

*Reviewed against `goals/harborline-sre-goals-2026.md`. The Q2 check-ins (June 30) predate this meeting and are used.*

### Kevin Collins
1. **On track, Reduce customer-detected incidents (40%, target zero in H2):** No customer-detected incident since April, so zero so far in H2 (Jul 1 to Sep 22). Caveat: the April root cause (ProcWatch scheduler alerts not paging) is still open until Sam's change is approved and deployed. The self-assessment is stronger if it can say the fix is live and verified by a test page *(suggested)*.
2. **Successor identified, Develop the team (30%):** Praveen named, and Dana agreed. Log the date. The other measure, "log goal evidence for every report monthly," is well supported by today's wins. September logging is due by month end.
3. **Not started yet, AI-assisted operations (30%, shadow mode in Q4, track false-positive rate):** Q4 begins Oct 1. The question from above raises the stakes: the false-positive rate and the use of time saved are now the evidence Dana needs to argue against cuts *(suggested)*.
4. **Dana's Q2 note, "Make the team's wins more visible upward":** **Clearly acted on.** Three people credited by name, each with a number. This is the strongest example of it on record.
5. **Kevin's own Q2 check-in, "stop open promises from evaporating":** The sprint ask shows the notes catching a dropped promise, and Kevin said so. Two older promises are still open: the May 5 process-gap point and the Marco backfill.

### Praveen Iyer *(not present, discussed)*
- **Alert quality (40%, cut non-actionable pages 50% by end of Q4):** 9 → 4 noise pages a week is about a 56% drop, already past the target if it holds. It's two weeks of data. Keep logging weekly counts through Q4 *(suggested)*.
- **Mentoring (30%):** Riley's first primary week is complete with Praveen as secondary. That's the milestone. Log it.
- **Reliability architecture (30%, ACT-111):** Not mentioned in this or the last two meetings.
- **Successor nomination:** Not a listed goal, but it changes his year. See Other Insights on load.

### Riley Brooks *(not present, discussed)*
- **On-call certification (40%, first primary week by end of Q3):** **Met.** Six pages, five solo, one appropriate escalation. Log it with dates.

### Sam Torres *(not present, discussed)*
- **On-call excellence (30%):** Time to acknowledge target met (~9 → 4 min).
- **Reduce repeat incidents (40%):** Merge and preventive fix in progress, now with Dana's support at the board.

---

## Other Insights

- **What went well: wins before asks, and the asks were earned by the wins.** Kevin said "three wins and two asks," got Dana's okay to start with wins, and let the numbers make the case. Dana's "Given the numbers you just gave me, that's an easy yes" shows it worked.
  - *Leadership lens (Carnegie, Part 3 #5: "Get the other person saying 'yes, yes' immediately"; Part 4 #1: "Begin with praise and honest appreciation"):* "That's a good month" came before the first ask.

- **What went well: the credit went to the team, by name.** Sam, Riley and Praveen each got a specific win and a number. This answers Dana's Q2 note and closes two earlier suggestions to credit Sam and Praveen upward.
  - *Leadership lens (Carnegie, Part 2 #6: "Make the other person feel important, and do it sincerely"):* it's sincere because each claim is specific and checkable.

- **What went well: Kevin admitted the July miss before Dana could notice it.** "I should have asked you this in July… my action item was still open." No excuses. Dana thanked him for owning it.
  - *Leadership lens (Carnegie, Part 3 #3: "If you are wrong, admit it quickly and emphatically"):* this is the answer to the Sep 8 and Sep 10 notes that the sprint had gone without status.

- **What went well: a concrete story instead of an argument.** On the headcount question, Kevin didn't argue with leadership. He used April (three hours, three customers' pay runs, one unfinished action item) to reframe the question, and gave Dana a line she can repeat.
  - *Leadership lens (Carnegie, Part 3 #11: "Dramatize your ideas"; Part 3 #7: "Let the other person feel that the idea is his or hers"):* "It's yours" made it Dana's argument to carry upward.

- **Could do better: the headcount question needed a question back.** Kevin answered well, but didn't ask what's driving it, who is asking, or what Dana needs to answer it. Dana is the one carrying this upstairs. Something like "What would help you make that case? I can bring page counts and the pilot's false-positive rate" *(suggested)* would have turned a good line into evidence.
  - *Leadership lens (Carnegie, Part 3 #8: "Try honestly to see things from the other person's point of view"; Part 2 #5: "Talk in terms of the other person's interests"):*

- **Could do better: Marco's backfill didn't come up, in the one meeting where it mattered most.** The backfill has been open since July 28, and Dana just said leadership is asking about fewer people on-call. Leaving it out risks the "fewer people" answer being settled by silence. Riley's strong week helps coverage, but Praveen has been covering Marco's shifts since July.
  - *Leadership lens (Carnegie, Part 2 #5: "Talk in terms of the other person's interests"):* Dana has to defend the team's size. Raising the backfill now, framed as "here's what the team has done with the attention it has" *(suggested)*, gives her the case, and is easier than after a decision.

- **Could do better: Praveen as successor needs Praveen's say.** Dana agreed quickly, which is good. But Praveen's load has come up five times since May, and he's now running the review, mentoring, evaluating the pilot, and (likely) scoping the sprint. Nothing in the notes shows Praveen has been asked. Before it goes into the self-assessment, talk with him about what he wants and what comes off his plate *(suggested)*.
  - *Leadership lens (Carnegie, Part 1 #3: "Arouse in the other person an eager want"; Part 3 #7: "Let the other person feel that the idea is his or hers"):* a role he chooses will stick better than one he hears about later.

- **Could do better: the sprint was approved without an owner or a start date.** "Starting next sprint" is close, but this item already slipped once. Given Praveen's review is already doing the work, he may be the natural lead, which would count toward his 40% goal *(suggested)*.

- **Pattern worth watching: the pilot and jobs.** Praveen (Sep 8) asked if it's "deciding who's on the team," Riley (Sep 10) asked if on-call is worth learning, Sam (Sep 15) asked whether it would page him, and now leadership is asking about fewer people. Kevin reassured Praveen on Sep 8. That reassurance now depends partly on a decision above Kevin. If the question goes further, the team should hear it from Kevin first *(suggested)*.

- **Pattern worth watching: promises now get caught, but only some.** The notes caught the July sprint ask and Kevin acted on it, which is the system working. The May 5 process-gap point (unfinished and duplicated action items, ACT-110 and ACT-121) and the Marco backfill are still open.

- **Manager-only note:** No wellbeing concerns were raised about Dana or Kevin. Praveen's workload remains the main thing to watch, especially if the successor role and the sprint are added. Leave this out of any version shared with others.
