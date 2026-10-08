# Kevin & Sam: Bi-Weekly 1:1 | September 15, 2026

> **Fictional sample for a public YouTube video.** Kevin Collins (the creator) is the only real person, shown as the manager of a fictional SRE team. Harborline Cloud, its people, customers, tools and incidents are invented.

**Date:** September 15, 2026, 3:03 PM | **Duration:** 3m 44s
**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE II)
**Company:** Harborline Cloud | **Type:** Bi-weekly 1:1
**Prior context:** `2026-05-05_kevin-sam_1on1.md` (last saved Kevin–Sam 1:1, 19 weeks earlier), `2026-07-28_kevin-praveen_1on1.md` and `2026-09-08_kevin-praveen_1on1.md` (Sam–Praveen scheduler pairing), `2026-09-10_kevin-riley_1on1.md` (Kevin told Riley "Sam's fixing" the April routing gap). Also uses the Q2 check-ins dated June 30, 2026 in `goals/harborline-sre-goals-2026.md`.

---

## Executive Summary

A short, high-energy 1:1 in which Sam moved from learning to owning. The **scheduler pairing with Praveen is finished: five sessions**, and Sam can now explain the April deadlock end to end ("Failover, lock table, why nothing timed out"). In May, Sam described reading runbooks "like a tourist." Kevin remembered the phrase and pointed out how much has changed.

Sam then took on the fix behind the April 21 incident. Last week Sam **asked the RCA wiki which action items were never finished**, and **ACT-110** (open since 2025) came up again, along with its April duplicate **ACT-160**. Sam will **merge ACT-160 into ACT-110, close the duplicate, and ship the fix**: route **ProcWatch heartbeat alerts on the scheduler to page the scheduler on-call**. Sam called it "one routing rule" and said "It felt personal, honestly." It's a production alerting change, so it needs change approval. **Kevin will sponsor it at the change board on Sep 29.** Kevin called it "a leadership move, not just a ticket."

Sam brought a goal metric: **median time to acknowledge on Harborline Pay pages dropped from about 9 minutes in June to 4 minutes last month (August)**. That's under the goal's 5-minute target. Sam credited the runbook cleanup and scheduler knowledge. Kevin said they'll **log it against the on-call goal today, with dates**.

Kevin asked permission, then gave feedback on the **web login post-incident review Sam ran**. It was clear, calm and blameless. Next time, when someone asks a question like "why didn't the health check catch it?", **ask the room first** so Riley (or someone else) gets to find the answer. Sam agreed ("I do that"). Finally, Sam asked whether the pilot will page in shadow mode. Kevin said **no**: it makes its calls quietly for comparison over a few weeks.

One thing wasn't raised: the fix won't land before Sep 29 at the earliest, and **Riley is primary on call this week** (week of Sep 14). Kevin reassured Riley on Sep 10 that "Sam's fixing it."

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-260915-1 | Merge ACT-160 into ACT-110 and close the duplicate | Sam Torres | Not set (before the Sep 29 change board implied) |  | Agreed |
| A-260915-2 | Write the change request for the routing rule: ProcWatch scheduler heartbeat alerts page the scheduler on-call. Add Kevin as sponsor. | Sam Torres | Change board, Tue Sep 29 | 2026-09-29 | Agreed |
| A-260915-3 | Sponsor the change at the change board | Kevin Collins | Tue, Sep 29 | 2026-09-29 | Agreed |
| A-260915-4 | Log the time-to-acknowledge improvement (~9 min in June → 4 min in August) against Sam's on-call goal, with dates (with Sam) | Kevin Collins | Today, Sep 15 | 2026-09-15 | Agreed |
| A-260915-5 | In the next post-incident review, ask the room before answering | Sam Torres | Next review |  | Agreed |
| A-260915-6 | After the change is deployed, fire a test heartbeat alert, confirm the scheduler on-call is paged, then close ACT-110 with the evidence *(suggested)* | Sam Torres | After Sep 29 |  | Suggested |
| A-260915-7 | Tell Riley and Praveen (primary/secondary this week) that ProcWatch scheduler heartbeat alerts still don't page, and agree how to watch for them until the change lands *(suggested)* | Kevin Collins | Immediately | 2026-09-15 | Suggested |
| A-260915-8 | While logging item 4, also log: Sam led the web login review, completed five scheduler sessions, used the RCA wiki to find ACT-110, and the May incident-communication win (open since May 5) *(suggested)* | Kevin Collins | Sep 15 | 2026-09-15 | Suggested |
| A-260915-9 | Credit Sam by name to Dana for owning the ACT-110 fix and for the time-to-acknowledge drop *(suggested)* | Kevin Collins | Next Dana 1:1 |  | Suggested |
| A-260915-10 | Ask Sam whether the RCA wiki or assistant was used in the web login review (AI-first goal evidence) *(suggested)* | Kevin Collins | Next 1:1 |  | Suggested |
| A-260915-11 | Ask Sam to share the full list of unfinished action items the RCA wiki returned (it may include ACT-121 and others) and decide what goes to Dana *(suggested)* | Kevin Collins | Next 1:1 |  | Suggested |

---

## Open Items from Earlier Meetings

| ID | From | Item | Owner | Age | Status now |
|---|---|---|---|---|---|
|  | **Repeated concern** (May 5 Sam 1:1; Sep 10 Riley 1:1; today) | ProcWatch alerts don't page anyone: the root cause of the April 21 incident (ACT-110 / ACT-160) | Sam Torres (now) | ACT-110 open since RCA-2025-012 (May 2025), about 16 months. 19 weeks (133 days) since first raised with Kevin | Open. **Owner and path set today.** Sam merges the duplicates and takes the fix to the Sep 29 change board, with Kevin sponsoring. Still not live. |
| A-260505-1 | May 5, 2026 | Bring the duplicate ACT-110 / ACT-160 to Dana as a postmortem process gap: merge, one owner, a date | Kevin Collins | 19 weeks (133 days) | Open. **Partly overtaken.** Sam is merging and owns the fix, and the date is Sep 29. Whether the *process gap* (duplicates going unnoticed) reached Dana wasn't mentioned. |
| A-260505-4 | May 5, 2026 | Log Sam's incident-communication win (15-min updates, 0 escalations) as goal evidence | Kevin Collins | 19 weeks (133 days) | Open. Not mentioned. Kevin is logging the time-to-acknowledge metric today, so this is a good time to log both. |
| A-260505-5 | May 5, 2026 | Credit Sam by name to Dana for finding the duplicate *(suggested then)* | Kevin Collins | 19 weeks | Open. Not mentioned. Sam's new wins make this more relevant. |
| A-260728-4 | May 5, 2026 → Jul 28, 2026 | Scheduler-internals pairing, Sam with Praveen | Sam Torres, Praveen Iyer | 19 weeks since proposed; 7 weeks (49 days) since Jul 28 | Done. **Closed.** Five sessions complete. Sam can explain the April deadlock end to end. |
| A-260910-5 | Sep 10, 2026 (Riley 1:1) | Confirm with Sam whether ProcWatch alerts page before Riley's first primary week (Sep 14) *(suggested then)* | Kevin Collins | 5 days | Open. **Answered indirectly: they don't yet.** The change goes to the board on Sep 29, so Riley's primary week runs with the gap. Riley and Praveen weren't mentioned today. |
| A-260728-1 | Jul 28, 2026 (Praveen 1:1) | Ask Dana for a two-week alert-hygiene sprint | Kevin Collins | 7 weeks (49 days) | Open. Not mentioned (fourth meeting in a row with no status). |

---

## Flip Cards

### Card 1: Scheduler depth: done
Five pairing sessions with Praveen, which Sam set up. Sam: "I could actually explain the April deadlock to you now. Failover, lock table, why nothing timed out." In May it was "reading runbooks like a tourist." This achieves what Sam asked for in the Q2 check-in.

### Card 2: Sam owns the April fix (ACT-110)
Sam asked the RCA wiki which action items were never finished. ACT-110 (open since last year) came up, plus its April duplicate ACT-160. Plan: merge ACT-160 into ACT-110, close the duplicate, and ship one routing rule so ProcWatch scheduler heartbeat alerts page the scheduler on-call. Kevin: "That's a leadership move, not just a ticket."

### Card 3: Change board Sep 29, Kevin sponsoring
It's a production alerting change, so it needs change approval. The next board is the 29th. Sam writes the change request and puts Kevin on it as sponsor. Until then the April gap is still open.

### Card 4: Time to acknowledge: ~9 min → 4 min
The median time to acknowledge on Harborline Pay pages was about 9 minutes in June and 4 minutes in August, beating the goal's 5-minute target. Sam says the difference is runbook cleanup and knowing the scheduler: "I don't have to go look things up anymore." It's being logged today, with dates.

### Card 5: Feedback: ask the room first
Sam's web login review was "clear timeline, calm, blameless." When someone asked why the health check didn't catch it, Sam answered right away and was right, but Riley would probably have gotten there. Kevin: "People remember the answers they find, not the ones we hand them." Kevin added that he's working on it too.

### Card 6: Shadow mode doesn't page
Sam asked whether the pilot will page in shadow mode. It won't. It makes its call quietly and the team compares it with their own calls for a few weeks. Kevin: once ACT-110 ships, "the pilot has one less thing to catch."

---

## FAQ

**Q: Is Sam's scheduler pairing with Praveen still going?**
A: It's finished. Five sessions. Sam can now explain the April deadlock: failover, lock table, and why nothing timed out.

**Q: Who owns ACT-110 now, and what is the fix?**
A: Sam. Merge ACT-160 into ACT-110, close the duplicate, then add one routing rule so ProcWatch scheduler heartbeat alerts page the scheduler on-call.

**Q: When will the fix be live?**
A: Not before the Sep 29 change board, where Kevin is sponsoring. No deploy date was given.

**Q: How did Sam find it again?**
A: Last week Sam asked the RCA wiki which action items were never finished. ACT-110 and ACT-160 both came up.

**Q: What's Sam's time-to-acknowledge trend?**
A: About 9 minutes in June, 4 minutes last month (August), on Harborline Pay pages. That's under the 5-minute goal.

**Q: What was the feedback on the web login review?**
A: Good overall: clear timeline, calm, blameless. Next time, ask the room before answering so others (e.g. Riley) get to find the insight.

**Q: Will the detection pilot page anyone in shadow mode?**
A: No. It makes its calls quietly, and the team compares them with their own for a few weeks.

**Q: Did Kevin mention Dana or the process gap?**
A: No. Neither the May 5 escalation to Dana nor crediting Sam upward came up.

---

## Goals Review

*Reviewed against `goals/harborline-sre-goals-2026.md`. The Q2 check-ins (June 30) predate this meeting and are used.*

### Sam Torres
1. **In progress, Reduce repeat incidents on Harborline Pay (40%):**
   - *"Close or merge duplicate action items":* Sam is merging ACT-160 into ACT-110. Log it with the date once it's done.
   - *"Own one preventive fix end to end":* The ProcWatch routing rule is exactly this, and Sam chose it. "End to end" should include change approval (Sep 29), deploy, and a verified test page *(suggested)*. Log each step.
2. **Target met, On-call excellence (30%):**
   - *"Median time to acknowledge under 5 minutes":* ~9 min (June) → 4 min (August). Log it today with the dates, as agreed. Worth confirming it holds for September *(suggested)*.
   - *"Lead one post-incident review":* **Met.** Sam ran the web login review. Log it with Kevin's feedback (clear, calm, blameless; ask the room first).
3. **Evidence, needs confirming, AI-first adoption (30%, use the RCA wiki or assistant in two post-incident reviews):** Sam used the RCA wiki last week to find unfinished action items, which is real and valuable use. Strictly, it wasn't *in a post-incident review*. Ask whether the wiki was used in the web login review *(suggested)*. If it was, that's one of two.
4. **Q2 check-in follow-through:** Sam said "I want to understand the scheduler well enough that it never surprises me again." Kevin said "Next step is depth on the scheduler and owning a preventive fix." **Both are now happening.** This is a strong mid-year story.

### Praveen Iyer *(not present, but affected)*
- **Mentoring and team capability (30%):** Five scheduler sessions with Sam, now complete, with a visible result (Sam's time to acknowledge and the ACT-110 ownership). Log it as supporting mentoring evidence alongside Riley's certification.

### Riley Brooks *(not present, but affected)*
- **On-call certification (40%):** Riley is primary this week while the ProcWatch gap is still open (see Other Insights). Riley was also in Sam's web login review, and Kevin's feedback is about giving Riley room to find answers there.

### Kevin Collins
1. **Reduce customer-detected incidents (40%):** April 21 was customer-detected because ProcWatch paged no one. Sam's fix removes that specific cause. Track it to a verified test page, not just board approval.
2. **Develop the team (30%, log evidence monthly; identify an on-call lead successor):** Kevin committed to logging today. Sam's initiative (self-arranged pairing, RCA wiki audit, owning a year-old fix, leading a review) is the kind of evidence the successor search needs.
3. **AI-assisted operations (30%, pilot in shadow mode in Q4):** Sam's question ("is it going to page me?") is the third team member in a week to ask about the pilot's effect on them (Praveen Sep 8, Riley Sep 10). Also, Sam's RCA wiki query is a live example of AI finding a dropped action item.
4. **Dana's Q2 note, "Make the team's wins more visible upward":** This meeting produced three wins worth sending to Dana: ACT-110 ownership, time to acknowledge down more than half, and Sam's first review led.

---

## Other Insights

- **What went well: Kevin remembered Sam's own words.** "That's a big change from 'reading runbooks like a tourist.'" Sam: "Ha. You remember that." Recalling a phrase from four months earlier shows Sam that Kevin was listening then and is tracking the growth now.
  - *Leadership lens (Carnegie, Part 2 #1: "Become genuinely interested in other people"; Part 4 #6: "Praise every improvement"):*

- **What went well: "Say more," then out of the way.** When Sam said "I want to own it," Kevin didn't add a plan. He asked Sam to explain, then asked "What do you need?" Sam had already worked out the merge, the fix and the change-board path.
  - *Leadership lens (Carnegie, Part 3 #7: "Let the other person feel that the idea is his or hers"; Part 2 #4: "Be a good listener"):* this also acts on the May 5 coaching point to not absorb the fix yourself.

- **What went well: a reputation to live up to.** "You're fixing the exact thing that hurt you in April. That's a leadership move, not just a ticket." It turns a routing rule into an identity: Sam as someone who closes the loop.
  - *Leadership lens (Carnegie, Part 4 #7: "Give the other person a fine reputation to live up to"):*

- **What went well: the feedback followed the book closely.** Kevin asked permission ("Can I give you some feedback?"), opened with specific praise (clear timeline, calm, blameless), framed the point as "one thing to try," and then said "I'm still working on it myself."
  - *Leadership lens (Carnegie, Part 4 #1: "Begin with praise and honest appreciation"; Part 4 #3: "Talk about your own mistakes before criticizing the other person"):* the content of the feedback, letting Riley find it, is Part 3 #7 again. Kevin was coaching Sam to use the approach Kevin had just used on Sam.

- **What went well: quick, concrete sponsorship.** "I'll sponsor it. Put me on the change request." No hedging, and Sam left knowing exactly what Kevin would do.

- **Could do better: Riley is on call right now with the same gap.** Five days earlier, Kevin told Riley the April gap is "a system problem, and Sam's fixing it." Today it became clear the fix can't land before Sep 29, during or after Riley's first primary week. Neither Riley nor an interim measure came up. Asking "Is there anything we can do this week while it's waiting on the board?" *(suggested)*, such as a manual watch or a temporary rule if the process allows it, and telling Riley and Praveen plainly, would close that loop.
  - *Leadership lens (Carnegie, Part 3 #8: "Try honestly to see things from the other person's point of view"):* from Riley's side, "Sam's fixing it" meant "it's handled."

- **Could do better: "It felt personal, honestly" went by quickly.** Kevin answered "Good. What do you need?" That's supportive and keeps momentum, but a second "Say more" *(suggested)* could have shown how April still sits with Sam, which is useful to know before the fix ships and for the Q2 check-in story.
  - *Leadership lens (Carnegie, Part 2 #4: "Be a good listener. Encourage others to talk about themselves"):*

- **Could do better: the wins stayed in the room.** Sam used the RCA wiki to find a year-old dropped action item, took ownership, and cut time to acknowledge by more than half. None of that was linked to Dana, even though Dana's Q2 note asked Kevin to make wins more visible upward, and the May 5 suggestion to credit Sam by name is still open. Kevin's own May 5 commitment to raise the duplicate as a process gap also went unmentioned. A quick "I still owe Dana the process-gap point; I'll bring your fix and your numbers with it" *(suggested)* would cover both.
  - *Leadership lens (Carnegie, Part 2 #6: "Make the other person feel important, and do it sincerely"; Part 3 #3: "If you are wrong, admit it quickly and emphatically"):*

- **Could do better: "What else did the wiki find?"** Sam's query was "which action items were never finished," and only ACT-110 was discussed. The Riley 1:1 already surfaced ACT-121 (open since 2025, cost 38 minutes in February). The rest of Sam's list is probably the audit the May 5 summary proposed, and it's already done *(suggested)*.

- **Pattern worth watching:** ACT-110 was open about 16 months and ACT-121 more than 8. Both were fixed or picked up only after an engineer went looking. The system still depends on individuals remembering. Sam's RCA wiki query is a repeatable check. Consider making it a monthly step, e.g. in Praveen's weekly alert review *(suggested)*. The Dana alert-hygiene sprint (Jul 28) has now gone four meetings with no status.

- **Manager-only note:** Sam said the fix "felt personal" because of April. Energy and confidence were noticeably higher than on May 5, and no wellbeing concerns were raised. Leave this out of any version shared with Sam or others.
