---
name: review-transcript
description: Review a meeting transcript and save its summary in meeting-notes/. Use whenever the manager asks you to review, summarise or write up a transcript or a meeting, in plain words or with /review-transcript.
---

Purpose: review one meeting transcript, save its summary in meeting-notes/, and coach the manager on the meeting.
Sources: transcripts/, goals/, meeting-notes/, templates/meeting-summary-template.md, library/carnegie-notes.md, library/getting-more-notes.md, people.md, notes/notes.json
Last reviewed: 2026-10-22

The summary format is templates/meeting-summary-template.md. example.md, next to this file, is one complete
summary to copy the shape of.

If the manager doesn't name a transcript, list the files in transcripts/ that have no summary in meeting-notes/ yet
(a summary is named after its transcript, as under Dates), and ask which one to review.

## When the manager asks you to review a transcript
1. Read the transcript, the goals file, and every earlier summary in `meeting-notes/` that involves the same people.
2. Use only information dated on or before the meeting. Ignore later check-ins.
3. Connect this meeting to earlier ones. Flag any concern raised again, and any action item from an earlier meeting that is still open, with its date and how long it has been open. Put these in "Open Items from Earlier Meetings".
4. Write the summary in the template's format: Executive Summary, Action Items, Open Items from Earlier Meetings, Flip Cards, FAQ, Goals Review, Other Insights.
5. In Other Insights, coach the manager using their notes in library/carnegie-notes.md. When the meeting includes a request, a negotiation or a disagreement, also use their notes in library/getting-more-notes.md. Name the book and the principle for each point. Be candid: include what went well and at least one thing the manager could have done better. Label each point "What went well:" or "Could do better:".
6. Mark anything that wasn't said in the meeting as "(suggested)". Don't invent facts.
7. Keep observations about someone's wellbeing brief and factual in a single "Manager-only note". Never record health details.
8. Save the full summary to `meeting-notes/`, named as described under Dates, then show a condensed version in the chat.
9. The app checks the summary when you save it. If it reports anything, fix it and save again.

## Dates
- The meeting date is the one in the transcript's own header, not its file name.
  Transcripts write it in different ways, such as "August 3, 2026, 4:29PM" or
  "12 August 2026, 12:39pm". Read whichever form the transcript uses.
- If the date could be read two ways (03/08/2026), or the transcript has no date,
  ask the manager. Don't guess.
- If the date inside the transcript and a date in its file name disagree, use the
  one inside and say so in the chat.
- Write the date in the "**Date:**" line in words, as the template does
  ("August 3, 2026, 4:29 PM"). Use the same date in action-item IDs (A-260803-n).
- Name the saved summary: the date as YYYY-MM-DD, an underscore, then the
  transcript's name without its extension, any date in it, or the dashes and
  spaces left around that date, with the remaining spaces as underscores, ending
  in .md. "Weekly Sync - 20260803.docx" becomes
  "2026-08-03_Weekly_Sync.md". The app reads the date from the start of the file
  name, so it must come first.

## Action items
- Give every new action item an ID: A-YYMMDD-n, the meeting date and its row number.
  Never change or reuse an ID.
- If another summary in meeting-notes/ already uses IDs for this date, add the next
  letter after the date: A-YYMMDDb-n, then A-YYMMDDc-n. Never reuse an ID.
- One owner per item, spelled as in people.md. Name anyone else in the item's text.
  If a name is not in people.md, ask.
- Keep the words that were said in Due. Fill Due date only when they fix a day:
  "Friday" does, "this week" means that week's Friday, "next 1:1" does not.
- Never list an earlier item again as a new one. Put it under Open Items from Earlier
  Meetings with its ID. Start "Status now" with Open, Done or Dropped, then what was
  said. You report; you never close an item.
- A suggested item keeps its "(suggested)" mark and gets an ID like any other.
- If a table has no rows, leave it with its header rows only. Never add a placeholder
  row such as "None": every row in Action Items is read as an item.
- Keep shared or exported copies of a summary out of meeting-notes/ (for example in
  shared/). Every file in meeting-notes/ is read as its own meeting.
