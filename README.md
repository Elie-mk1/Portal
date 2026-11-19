# EM Recruiting Copilot (Project 3)

A copilot for a remote-staffing agency. It turns client call notes into a job description, finds the best 5 candidates with reasons, and runs email outreach. A recruiter approves every step in Slack.

**Live portal:** `https://YOUR-PORTAL.vercel.app` (passcode in the submission thread)
**Stack:** n8n (8 workflows) · Supabase (Postgres + pgvector + private file storage) · Gemini (free tier) · Slack bot · GoHighLevel · Gmail · Next.js portal on Vercel, built with Claude Code.

---

## How it works

```
Call notes ──► [01 JD] ──► Slack: Approve / Request changes / Reject
                                 │ Approve
                                 ├─► JD emailed to client (test inbox)
                                 └─► [03 Search] top 5 for the role ──► Slack: ✅ Approve / Skip per candidate
                                                                              │ Approve
                                                       GHL contact + opportunity ◄┘ (stage "Approved")
                                                       [06 Outreach] email 1 → 2 → 3 … stops on reply (stage "Replied")
CV files ──► Portal upload ──► [02 CV ingest] read → dedupe → index      (unreadable → flagged + Slack alert)
Slack question ──► [04 Slack bot] ──► [03 Search] ──► top 5, score, 2-line reason, CV file name
```

| # | n8n workflow | What it does |
|---|---|---|
| 00 | Setup & health check | Run once. Finds the GHL pipeline and stage IDs, saves them, and tests Gemini, Slack, Storage and Gmail. Prints ✅/❌ for each. |
| 01 | Call notes → JD | Gemini writes the JD from facts in the call only, saves it, and posts it to Slack with 3 buttons. |
| 02 | CV ingest | Reads PDF/Word/JPG/PNG (scans via Gemini OCR), extracts a profile, and runs the duplicate/update rule. Unreadable files are flagged. |
| 03 | Candidate search | Question → must-haves → hybrid search (meaning + keywords) → Gemini judges each candidate → code guards → top 5 or "no good match". |
| 04 | Slack questions | Plain-English questions to the bot (mention or DM). Verifies Slack's signature and answers in a thread. |
| 05 | Slack approvals | Every button: JD approve/changes/reject, candidate approve/skip. Updates the Slack message with who did what. |
| 06 | Outreach sequence | Runs every 2 min. Sends emails 1–3, stops on any reply, and moves GHL stages. |
| 07 | Build / rebuild shortlist | Runs 03 for an approved role and posts the top 5 to Slack with buttons. Called after JD approval and by the portal's **Rebuild shortlist** button. |

The **portal** has five pages:

- **Roles & shortlists:** open roles with their top 5, scores and reasons.
- **Candidate pipeline:** live GHL stages.
- **Candidates & CVs:** every CV file with its status, plus a "Needs attention" tab.
- **Upload CVs.**
- **Test:** the 10 questions, the right answers, and a button that asks the real bot and scores it out of 10.

## The hard cases and how each is handled

| Hard case | What happens | Where |
|---|---|---|
| Nothing reaches a client or candidate before Approve | Emails and GHL calls exist only behind the Slack buttons. A Postgres "claim" makes double-clicks harmless. | 05, `rc_claim_shortlist`, `rc_jd_decision` |
| No good match | The bot says "No good match" and lists the closest people, labelled as **not** meeting the must-haves. | 03 Finalize |
| Never invents a candidate | Code keeps only candidate IDs that came from the database pool. Anything the AI makes up is dropped, and names and files come from the DB, not the AI. | 03 Finalize (tested with a planted fake) |
| Every recommendation names its CV | Each match carries `cv_file_name` and a link to the file. | Slack, portal |
| Scanned image-only CV | No text layer, so Gemini reads the page image (OCR). The person is searchable **and** flagged "please double-check". | 02 |
| Unreadable or corrupted file | Status set to `unreadable`, Slack alert, listed under Needs attention. Never skipped. | 02 flag path |
| Same person twice (same CV / name variant / different email) | Same email **or** same phone (last 8 digits) means the same person. One searchable profile; the other file is marked duplicate. | `rc_ingest_cv` |
| Updated CV | The newer "last updated" date wins (upload time if no date). The old file is marked "replaced". Works in any upload order. | `rc_ingest_cv` |
| Testing must only email yourself | Test mode routes every email to `you+firstname-lastname@gmail.com`. The real address is never used. | `routeEmail`, settings |
| Keys never in the browser | Every key lives in n8n credentials or Vercel server env. The portal calls Supabase, n8n and GHL server-side only. | — |

## Decisions (one line each, with why)

**Architecture**
- **n8n does the work; the portal is a window.** Graders and recruiters can see every step as a node, and the portal stays simple.
- **Business rules that must be atomic live in Postgres functions** (dedupe/replace, claim-before-approve, JD decision). Two clicks or two uploads at once can't create duplicates or double emails.
- **One settings table (`rc_settings`) instead of values spread across workflows.** You change the Slack channel, model or delays in one place.
- **Every n8n call to Supabase, Gemini, GHL and Slack is a plain HTTP Request with a named credential.** That is predictable, and named credentials auto-connect on import.
- **The portal → n8n webhooks need a secret header**, so nobody else can trigger them. Slack webhooks are verified with Slack's signing secret (HMAC written in plain JS because n8n blocks `crypto`).
- **Shared-sandbox safety:** everything is prefixed `EM-`/`em-p3-`, GHL items are tagged `EM-candidate`, and the portal only shows `EM-` opportunities.

**AI & search**
- **Gemini free tier** (`gemini-3.6-flash` for reading and judging, `gemini-embedding-2` at 768 dimensions for search). It is free, reads scanned PDFs natively, and the model is one setting away from a swap.
- **Structured profile per CV at upload time** (skills with years, languages, contact). Years are computed once, consistently, and are shown in the portal.
- **Hybrid retrieval: vector top-25 ∪ keyword hits.** Meaning finds "automation specialist" for "GHL builder", and keywords guarantee exact things like "Gorgias" or "Arabic" are never missed.
- **An index footer with skill aliases is appended to each CV's search text.** Asking for "GHL" finds a CV that only says "GoHighLevel".
- **The AI judges the whole pool against every must-have, then code applies the rules.** The AI is good at reading evidence; code is reliable at enforcing "all must-haves met", "score ≥ 60" and "real candidate only".
- **Scoring method:** meets every must-have = 60–100 (more for extra years, recent use, nice-to-haves); misses any = capped at 49 and never shown as a match. A recruiter can read the number without a manual.
- **The reason is exactly 2 lines:** line 1 = evidence (years, employer, level), line 2 = gap or bonus. That fits the brief and fits Slack.
- **The JD writer may only use facts from the call; unclear items become "TBC" + a question for the client.** Graders punish invention, and clients notice it.
- **Internal info (e.g. "don't tell them we can go to $2,200") goes to recruiter-only notes.** The approved JD is client- and candidate-safe.
- **Must-haves contain only things a CV can prove** (skills + years, languages, certificates, industry, country). Hours, equipment, background checks and soft skills go to the details. Otherwise every candidate fails screening on things no CV mentions — found in live testing.
- **Automatic backup model:** if the main Gemini model answers "busy" (503) or "quota" (429), the same request is retried on `gemini_fallback_model`. The free tier is often overloaded, and a recruiter shouldn't see that.
- **Rebuild shortlist button** on each open role. It re-runs the top 5 after new CVs arrive, or after the AI was busy, without re-approving the JD; approved or skipped people are kept.
- **Outreach emails are fixed templates with merge fields, not AI-written.** What candidates receive is predictable and was effectively approved with the candidate.

**Data & dedupe**
- **Identity = email or phone (last 8 digits).** It catches "Lina Al-Khoury" with the same email and "Mateo" with a new email but the same phone. Name-only matches are flagged, not merged, so two different people with the same name stay separate.
- **Updated vs duplicate:** an exact copy or ≥80% identical text with no newer date counts as a duplicate; a different CV with a newer date counts as an update. Updates carry new facts, which must never be thrown away.
- **Files are kept, never deleted** (duplicate / replaced / unreadable statuses). The recruiter can always see what was received and why it was treated that way.
- **Files go into a private Supabase bucket, opened through 2-minute signed links.** CVs are personal data.

**Slack, GHL, email**
- **One Slack message per JD and one per shortlist, updated in place after each click.** The channel shows who approved what, with no message spam.
- **"Request changes" opens a Slack form (modal), then the JD is rewritten as v2 and posted again for approval.**
- **GHL pipeline "EM-Candidate Pipeline":** Approved → Contacted → Replied → Interviewing → Submitted to Client → Hired / No Response / Not a Fit. The automated moves are Approved, Contacted, Replied and No Response; the rest are for the recruiter.
- **GHL form mode for a read-only GHL key** (the shared sandbox has no Private Integrations). The Approve button opens a pre-filled GHL form in one click. The recruiter submits it, and GHL's own workflows create the opportunity, send the 3 emails, stop on reply and move the stages. This is the only way the pipeline can move without a write key, and the extra Submit is a second human check. Setup: `docs/GHL-FORM-MODE.md`. With a write key (leave `ghl_form_url` empty), n8n does it all through the API and Gmail, as described next.
- **Email through the Gmail API with thread IDs.** Follow-ups land in the same thread, and **any message in the thread we didn't send counts as a reply**, which stops the sequence instantly.
- **Sequence timing is a setting:** demo `0,10,20` minutes; real life `0,4320,10080` (now, +3 days, +7 days).
- **A lock in Postgres** means the 2-minute schedule and the "send now" trigger can never email the same person twice.

**Portal**
- **Next.js on Vercel, all data fetched server-side, behind a passcode.** It's fake data, but candidate profiles still shouldn't be public.
- **CVs upload one at a time with a live per-file result** (New / Duplicate / Updated / Needs attention). This respects free-tier AI limits and shows the hard cases happening.
- **Test page passes a question only on an exact match:** every expected person, nobody extra, nobody twice, or "no match" when nobody qualifies.
- **Design:** navy ink on sage paper. Green = approved, amber = needs you, brick = stopped. The match score meter has a tick at 60 ("meets every must-have").

## Repo map

```
n8n/              7 workflow JSON files (import into n8n)
supabase/         schema.sql — run once in the Supabase SQL editor
slack/            manifest.yml for the Slack app
portal/           Next.js recruiter portal (deploy to Vercel, root directory = portal)
data/             5 call transcripts, 60 CVs (PDF + Word), 2 hard-case files, test questions, manifest
docs/SETUP.md     step-by-step setup (no coding needed)
docs/LOOM.md      3-minute Loom script
docs/TESTING.md   how this was tested
scripts/          data generator, workflow builder, local end-to-end tests
```

## Data (all made up)

- **5 messy call transcripts:** Zoom, Otter and phone-app styles and a voice memo, with contradictions and missing budgets.
- **60 CV files for 55 people:** 35 PDF and 25 Word, in 6 layouts including two-column and tables.
- **1 scanned image-only CV** (Rhea Mendoza).
- **3 people twice:** Lucía (same CV as PDF and Word), Lina (name variant), Mateo (new email, same phone).
- **2 updated CVs:** Youssef (now 3.5 years of GHL) and Kevin (now speaks French).
- **2 extra unreadable files** in `data/hard-cases` to show flagging.
- **Emails use reserved `example.com/.net/.org` domains.**

See `data/README.md` for who is who and why each test question is tricky.
