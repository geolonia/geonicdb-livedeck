# FOSS4G Hiroshima 2026 — Speaker Script (English / canonical)

**Beyond the API — Why AI-Era Data Integration Needs Open Standards, Not Just Open Data**

- Talk: 2026-09-03 13:30 · **20 min talk + 5 min Q&A**
- Source: Keynote Manuscript (B案・swarm, QC-approved). This script *splits* the manuscript for delivery; it does not rewrite it.
- Cut plan: **Plan B** — table-of-contents section dropped, "open data decade" minimized, rebuttals 4 → strongest 2. The three pillars, the demo, and the Close survive untouched.
- Canonical language: **English** (the stage language). The Japanese script mirrors this file; claims, numbers, and structure are identical.

---

## How to read this script

- Normal paragraphs = words to speak.
- **[CUE: …]** lines = stage directions and demo signals. Never spoken.
- 🎙️ blocks = the speaker's own story, deliberately unscripted. Only the frame and target time are given.
- Pace assumption: **110 words per minute** — a deliberate, non-native-friendly pace. At 120 wpm the talk lands ~1.5 min early; at 100 wpm it runs ~1.5 min late. The checkpoints below absorb that.
- ⚠ **All second counts are desk estimates.** They become real only at the run-throughs on 9/1–9/2. Time the rehearsal; do not treat these numbers as measured.

## Timing sheet (desk estimate)

| # | Section | Words | Spoken @110 wpm | Beats / demo | Total | Ends at |
|---|---------|------:|----------------:|-------------:|------:|--------:|
| I | Seed — the room starts posting | 183 | 100 s | 15 s | 115 s | 1:55 |
| II | The open data decade (minimized) | 142 | 77 s | — | 77 s | 3:12 |
| III | The meaning gap | 290 | 158 s | 10 s | 168 s | 6:00 |
| IV | The objection — two answers (incl. 🎙️ 60 s) | 224 | 122 s | 75 s | 197 s | 9:17 |
| V | The build story + ETSI conformance | 480 | 262 s | 10 s | 272 s | 13:49 |
| VI | The payoff | 111 | 61 s | — | 61 s | 14:50 |
| VII | Harvest — the agent reads the room | 202 | 110 s | 105 s | 215 s | 18:25 |
| VIII | Close — three questions | 150 | 82 s | 5 s | 87 s | **19:52** |

Sum: **1192 s = 19:52** — desk buffer to 20:00 is **8 s**, plus the contingency plan below. The alternate two-question Close is 76 s spoken (saves ~6 s more). Word counts are machine-counted from the spoken paragraphs of this file (cue lines, on-slide text, and 🎙️ frames excluded).

## Checkpoints & contingency

- **Checkpoint A — start of Act V ("The build story") at 9:17.** More than one minute late → plan to skip the live audience question in Act VII (saves ~45 s).
- **Checkpoint B — start of Act VII (map full screen) at 14:50.** More than one minute late → skip the audience question AND use the two-question Close (saves ~50 s total).
- 🎙️ is budgeted at 60 s. If it runs to 90 s, that alone consumes the audience-question reserve — that is fine; the reserve exists for exactly this.
- **Demo time is never cut.** All savings come from speech.
- Fallback (Act VII): if the venue network or the live pipeline stalls for **15 seconds**, switch to the pre-recorded demo video and narrate over it. Never debug on stage.

---

## ACT I — Seed: the room starts posting 【0:00–1:55 / 115 s】

**[SLIDE 1 — QR code, full screen. Nothing else. No title, no logo.]**

**[DEMO CUE ① — POST PROMPT. This is the moment you invite the room to post.]**

Good morning. Don't listen to me yet.

Please take out your phone. Point it at this code. A small form opens. Two questions. Where are you from — prefecture or country. What is your hometown famous for — its specialty. A third field is optional: a hidden local spot the maps don't know.

That's it. No account. No app. I will tell you why later. One promise: what you just typed will not disappear. It will come back at the end.

**[DEMO CUE ② — Map inset appears bottom-right and stays for the rest of the talk. ★FROM HERE THE ROOM IS POSTING — KEEP TALKING. Do not wait in silence; the posting happens under your voice.]**

Bottom-right corner — those dots are your hometowns. Keep posting; the form stays open. That corner is now live infrastructure.

**[SLIDE 2 — Title: "Beyond the API".]**

My name is Hal Seki. I run a company called Geolonia. We build geospatial data infrastructure for cities — and for the AI agents that are starting to use it.

Here is the promise of this talk. Before we finish, an AI agent will read what this room just wrote — and understand it. Not because the AI is clever. Because of what happened to your post on its way to the database.

That gap — between clever AI and understood data — is what this talk is about.

## ACT II — The open data decade, minimized 【1:55–3:12 / 77 s】

**[SLIDE 3 — "Access: solved. Meaning: not yet." One slide; the old two slides are merged.]**

Let me start with credit. Much of it belongs to people in this room. Over the last decade, the open data movement won. Governments publish. Licenses are open. Access is solved. This community did much of that work.

Here is the uncomfortable question. If access is solved, why is open data still so hard to use?

Here is what happened. Every portal invented its own schema. Every API invented its own field names and formats. Each one is open, technically. And each one is a small silo with a nice license. We did not tear down the silos. We rebuilt them with better licenses.

And now the new part. AI agents are becoming the main consumers of this data. Every new API is one more dialect an agent must be taught by hand. Open licenses freed the bytes. Nothing freed the meaning.

## ACT III — The meaning gap 【3:12–6:00 / 168 s】 — Pillar a

**[SLIDE 4 — "The four ambiguities." Four quadrants: Identity / Semantics / Units & conventions / Time.]**

Machine-readable is not machine-interpretable. Every dataset I have ever worked with has the same four problems.

Identity. Is "Chuo Community Center" in this file the same building as "Chūō Kōminkan" in that one?

Semantics. A column named capacity — is that the design capacity, or the people inside right now? Those two numbers save lives differently.

Units and conventions. My favorite, because it is geospatial. NGSIv2, an older standard for city data, writes latitude, longitude in its legacy location format. NGSI-LD and GeoJSON write longitude, latitude. Same two numbers. Two different places on Earth.

Time. Measured when? Valid until? Updated by whom?

For decades, humans absorbed these problems quietly. An engineer "just knows" that column seven is Shift-JIS. That was the hidden cost of every integration — paid in overtime, never written down.

AI agents inherit all of the ambiguity, and none of the caution. They never say: "This looks strange. Let me ask someone."

**[SLIDE 5 — THE REVEAL. DEMO CUE ③: pick one real audience post from the inset — one of the two seeded colleague posts if the early crop is thin. Show its raw NGSI-LD JSON full screen. Beat: let it land.]**

Now — look at what you have been making while I talked.

This is one of your posts, typed a few minutes ago. This is what it became before it reached the database.

The hometown: not a stray string in a comment box — a typed property from a published data model. The specialty: the same. Anything outside the model was rejected — it never reaches the database. A timestamp with a defined meaning. A permanent ID, so this post can be cited forever.

Here is the point. You did not fill in a schema. You answered two small questions. The data model did the agreeing for you. Two hundred strangers are producing interoperable data, right now, without ever having met.

That is a semantic layer. Not paperwork. An agreement, enforced by the platform, so meaning travels with the data.

## ACT IV — The objection, and two answers 【6:00–9:17 / 197 s】 — Rebuttal

**[SLIDE 6 — The objection, stated in its strongest form.]**

Every AI engineer in this room is thinking the same thing. Let me say it out loud, at its strongest.

"Modern language models already parse messy data. They guess column meanings. So why build a semantic layer at all? Won't the next generation of models make it unnecessary?"

That is a serious argument. I have two answers. The first I did not learn from a paper. I watched it happen.

Answer one: the confidence trap. A smarter model does not fail less on ambiguous data. It fails better — its mistakes look more correct. It never says "I don't know." It picks the most likely meaning and keeps going. Wrong answers that look right are the most expensive kind. They survive review.

**[SLIDE 7 — The three measured facts, exactly as recorded (source: cmd_715 field report). They stay on screen, plain, while the speaker tells the story. Shift register: slower, personal.]**

> On the slide, not read aloud word-for-word:
> - The AI wrote a text-encoding name that does not exist — twice in a row ('shift-jis', then 'shiftjis'). Each looked plausible. Neither worked.
> - A conversion script ran with no errors. Unhandled CRLF line endings had silently turned the "capacity" field into null — in all 588 records. Zero out of 588. The work was reported as "complete."
> - The lesson, straight from the log: "It ran" does not mean "it's right."

🎙️ **[Here the speaker tells his own hackathon story, in his own words. Target 60 seconds — 90 s max; anything above 60 s spends the contingency reserve. This passage is deliberately unscripted.]**

That is the confidence trap, live. And nothing in that story improves when the model gets smarter. A smarter model invents more plausible names. It writes scripts that fail more quietly.

Answer two: this has happened before, every time. Every jump in machine capability brought more machine-readable structure, not less. Smarter crawlers got robots.txt, then sitemaps, then schema.org. Smarter models got OpenAPI, then function calling, then llms.txt, then MCP. If intelligence made structure unnecessary, MCP would not exist.

Smarter agents do not need less meaning. They consume more of it, faster, with higher stakes. Meaning is a contract — and contracts are what scale.

## ACT V — The build story, with the ETSI numbers 【9:17–13:49 / 272 s】 — Pillar b

**[⏱ CHECKPOINT A — you should be here at 9:17. More than a minute late → plan to skip the audience question in Act VII.]**

**[SLIDE 8 — "So we bet on a standard: NGSI-LD (ETSI GS CIM 009)." One honest diagram.]**

So which contract? We bet on NGSI-LD: an open standard for describing the things in a city — shelters, buses, sensors, complaints — in one common format. Published by ETSI, a European standards body.

On one slide: everything is an entity — a thing with a stable ID. Entities have properties, like capacity. And relationships — a shelter points to the organization that runs it; an agent follows the link instead of guessing. Location and time are built in. The coordinate order? Fixed, by the standard. Meaning lives in the data model, not in each API's documentation.

Now, this is FOSS4G. I can hear the question. "Why didn't you just run Orion-LD, the well-known reference broker?" Fair question. It deserves a straight answer — and an honest cost.

**[SLIDE 9 — "Four requirements we couldn't compromise." Stated as OUR requirements, not as anyone's failings.]**

We had four requirements. I state them as ours, not as criticism of upstream — that is good software, made by people I respect.

One: fully managed and serverless. A city should not run a 24/7 broker to own its data.

Two: one engine for two protocols — NGSIv2 for legacy systems, NGSI-LD for the future. Same data.

Three: agents as first-class users. An MCP endpoint on the broker itself. Not an add-on in front of it.

Four: security built in, not bolted on. One policy layer, with tokens tied to the sender.

Those four forced an uncomfortable decision: reimplement the standard, from scratch. That product is GeonicDB.

**[SLIDE 10 — "GeonicDB in one page." Write in (checked by the standard) → store → read out (API for apps / MCP for agents).]**

GeonicDB is a database service for city data. The standard checks every write. Apps read through web APIs; agents, through MCP. The city runs no servers. And that corner is GeonicDB, live.

**[SLIDE 11 — "What it cost, and what it bought." Both columns visible at once.]**

Here is what it cost — because a keynote that hides the cost is an advertisement. Our own test suite is about 3,200 scenarios. More test code than product code. And what we ship is honestly a subset of the standard. "Subset," not "compliant" — you deserve the precise word.

**[SLIDE 12 — ETSI conformance chart, REUSED from the existing livedeck deck ("ETSI 適合度 84.2%" slide). The self-measurement note must be visible on the slide face. Present it as data — no triumph, no needling. FIWARE authors may be in the room.]**

But "subset" is not a feeling. It is a number. We took ETSI's official conformance test suite — 1,033 tests — and ran it ourselves. Four brokers. Same conditions. GeonicDB passed 84.2 percent. Stellio, 51.6. Scorpio, 36.5. Orion-LD, 24.6.

I do not claim compliance. I claim a measurement: 84.2 percent — the highest of the four. Our own measurement, late August, against our version 0.17. The conditions are on this slide.

We also walked away from upstream. Nobody upstream carries our bugs. Keeping up with the standard is our job now, permanently.

What we got is the other column on this slide. You can do the math.

One more thing, owed to this community: open-sourcing GeonicDB is planned. No date today. But I am saying it from this stage, on the record.

Here is the sentence to keep: we could leave the implementation because we never left the standard. Open standards make implementations replaceable — including ours, someday. Interoperability lives in the contract, not in any codebase. You want both: open source, and open standards.

## ACT VI — The payoff 【13:49–14:50 / 61 s】 — Pillar c

**[SLIDE 13 — "What a semantic layer gives an agent." Four tight bullets. The inset map is visibly full by now.]**

Now it is time to keep my promise. All talk long, that corner has been collecting your posts as validated NGSI-LD entities. In a moment, an AI agent will read them. Here is what the semantic layer hands it.

Typed attributes — the agent knows which field means what. Validated writes — wrong data fails immediately, with a clear error. It never enters the database. Remember the 588 silent nulls from my story? That is the failure this design prevents. Relationships an agent can follow — a graph to walk, instead of joins to invent. And one MCP endpoint — the agent discovers the tools and the data models by itself.

Enough claiming. Let's query.

## ACT VII — Harvest: the agent reads the room 【14:50–18:25 / 215 s】 — Demo · Pillar c

**[⏱ CHECKPOINT B — you should be here at ~14:50. More than a minute late → skip the audience question AND use the two-question Close.]**

**[FALLBACK, say nothing unless needed: if the network or pipeline stalls for 15 seconds, switch to the pre-recorded demo video and narrate over it. Never debug on stage.]**

**[SLIDE 14 — DEMO CUE ④: map goes FULL SCREEN. Beat — let the full map land. This is the visual payoff of the whole talk. Then split-screen: map + Claude connected to the broker's /mcp endpoint.]**

This is what two hundred people look like as a dataset.

Now the agent. This is Claude, connecting to GeonicDB's /mcp endpoint — the same live database your phones have been writing to. Nobody taught it this API. It discovers everything through the standard. Watch.

**[DEMO CUE ⑤ — Query 1. Type or trigger it; narrate what it DID, not just what it found. ~15 s wait.]**

First question: "How many posts are there — and how many of them are our seeds?"

It called the entities tool with a typed query. No scraping. No guessing.

**[DEMO CUE ⑥ — Query 2. The bundling. Origins and specialties are free text in mixed languages; the agent groups posts that mean the same thing and quotes the originals as evidence. Point at the map; read one or two quoted strings aloud. The agent will note, by itself, that it was given no dictionary — let that line land; do not talk over it. ~20 s wait + reading.]**

Second: "These posts mix Japanese, English, and more. Which ones mean the same thing? Group them. Quote your evidence."

**[DEMO CUE ⑦ — Query 3. The digest. Read it aloud, slowly. This is the promise from minute two, kept. ~15 s wait.]**

Third: "In three sentences — who is in this room?"

**[DEMO CUE ⑧ — OPTIONAL audience question (~45 s). SKIP this block if behind schedule — this is the planned cut. If no question comes, use the spare: "Which hometown appears most often, and what is it famous for?" Repeat the question clearly into the mic before passing it to the agent.]**

A live dataset deserves a live question. Someone shout one. Ask this data anything.

**[SLIDE 15 — The meta-point. One sentence, full screen.]**

Let me tell you what you just saw — because it was not an AI demo.

Two hundred strangers just produced an interoperable dataset in twenty minutes — without a single meeting about schema. The standard held the meeting for you.

No working group. No data dictionary. No integration project. You answered two questions. The contract did the rest. And an agent none of you have ever met just used your data correctly, on the first try. That is the thing open data alone cannot do — and open standards can.

## ACT VIII — Close: three questions 【18:25–19:52 / 87 s】

**[SLIDE 16 — Three questions, on screen while spoken. Then the final line alone.]**

I want to end with homework for us as a community. These are questions no vendor should answer alone.

One. Should conformance test suites — not reference implementations — become the main artifact that standards communities maintain? Those 1,033 tests told you more than any feature list. What if that layer were the commons?

Two. What is the NGSI-LD and OGC story for agent-to-agent data exchange? When no human is in the loop, who owns semantics?

Three. Open data policy took a decade to win. What would an "open meaning" policy for public data look like — and who should write it?

The map behind me stays up. Your posts are real entities in a real database. They will still be there, still queryable, when you walk out of this hall.

Open your data — yes, always. Then open its meaning.

Thank you. I have five minutes for your questions — including the hard ones.

### ALTERNATE CLOSE — two questions 【~76 s spoken · use when Checkpoint B says so】

**[Same slide, questions 1 and 3 only. Question 2 (agent-to-agent semantics) is the cut: it is the most specialized of the three, and question 1 already opens the standards-community thread for Q&A.]**

I want to end with homework — not for you alone, but for us as a community.

One. Should conformance test suites — not reference implementations — become the main artifact that standards communities maintain? Those 1,033 tests told you more than any feature list. What if that layer were the commons?

Two. Open data policy took a decade to win. What would an "open meaning" policy for public data look like — and who should write it?

The map stays up. Your posts are real entities in a real database. They will still be there when you walk out of this hall.

Open your data — yes, always. Then open its meaning.

Thank you. I have five minutes for your questions — including the hard ones.

---

## Speaker's pocket card — the ETSI measurement (NOT spoken; keep at hand for Q&A)

Full Q&A preparation lives in the anticipated-questions document (subtask_752d). This card covers only the measurement facts behind Slide 12.

- **What**: ETSI GS CIM 009 (NGSI-LD) official conformance test suite, **V1.9.1 target, 1,033 tests**, pinned to a fixed suite revision so runs are repeatable.
- **Scores (as shown on the livedeck slide)**: GeonicDB **84.2 % (870/1033)** · Stellio 51.6 % · Scorpio 36.5 % · Orion-LD 24.6 %. Self-measured, four brokers, same conditions. Measured 2026-08-28, **GeonicDB v0.17.0**.
- **Broker versions measured**: Orion-LD **1.9.0**; Stellio and Scorpio at their official "plug-test-latest" images; each broker on a fresh, empty database; identical suite commit; the suite's @context served from a pinned snapshot so no run depends on an external server that day.
- **Honest caveats — say these BEFORE anyone asks**:
  - GeonicDB ran with authentication disabled (its documented local-development mode) because the ETSI suite is unauthenticated. Not a patched build.
  - **Why is Orion-LD low?** The suite targets the newest spec revision (V1.9.1). Orion-LD 1.9.0 predates much of it, and entire classes it has not implemented (temporal, geo-queries in this suite's form) score zero. A large part of its result is also errored runs, not clean failures. The number says "distance from V1.9.1 as this suite measures it" — it does not say Orion-LD is bad software.
  - **"84.2 % means 15.8 % is missing — what is missing?"** True, and we know the list: mostly distributed operations (federation across brokers) and parts of context-source registration and temporal. We publish the failing test IDs internally and fix from that list.
  - v0.18.0 has since shipped with breaking changes; the spoken line "against our version 0.17" keeps the claim honest. Do not present the number as current-version.
- If pressed beyond this card: "That's a good question. The full run logs exist. Talk to me after — I'll show you."
