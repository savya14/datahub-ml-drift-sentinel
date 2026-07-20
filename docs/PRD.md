# PRD & Technical Blueprint: DataHub ML Drift Sentinel
### Build with DataHub: The Agent Hackathon — Submission Plan

**Author:** Savya | **Deadline:** Aug 10, 2026, 5:00 PM EDT (= **Aug 11, 2:30 AM IST** — note this, it trips people up)
**Category:** Production ML Agents
**Document status:** v1.0, working plan — expect this to flex as you build

---

## 0. Honest framing before anything else

This document assumes you're optimizing for **winning**, not for learning DataHub or padding your resume. That changes some choices below — the scope is deliberately narrower than "a real production system" and deliberately biased toward what's *visible and checkable* in a 3-minute video and a judge's 10-minute repo skim. Anywhere I've cut a corner for time, it's flagged as `[SCOPE CUT]`. Anywhere I'm not confident something will work, it's flagged as `[RISK]`.

You have **23 days** (Jul 18 → Aug 10) and this is not your only obligation — DSA, EA/Cisco prep are running in parallel. I've built the roadmap around ~2 hrs/weekday + ~8–10 hrs/weekend ≈ **65–75 total hours**. That is enough for the scoped MVP below. It is not enough if scope creeps.

---

## 1. Problem Statement

**Who has this problem:** ML platform teams running models in production where predictions depend on upstream feature pipelines they don't directly control.

**The failure mode:** A model's input feature distribution silently shifts (a source table's schema changes, an upstream job starts dropping nulls differently, a categorical field gets a new value range) and nobody notices until the model's live performance degrades — usually discovered days later via a business metric, not the data layer. The lineage connecting "this model" → "these features" → "these source tables" already exists in DataHub, but nothing walks it proactively and correlates a data-layer change with model risk.

**What DataHub gives you that a generic script doesn't:** the actual lineage graph (`get_lineage`, `get_lineage_paths_between`) connecting model → features → tables, plus a place to durably record the finding (`save_document`, `add_structured_properties`, `propose_lifecycle_stage`) so the next engineer — or the next agent run — inherits the diagnosis instead of re-deriving it.

**What this project is NOT:** a general data quality platform, a replacement for DataHub's own Assertions/Observability product, or a full MLOps monitoring stack. It's a narrow, sharp agent that does one job well: walk lineage from a model, detect drift signals at each hop, and write a structured, actionable finding back to the graph.

---

## 2. Strategic Rationale — why this specific project, mapped to the actual rubric

| Judging criterion (verbatim from hackathon page) | How this project satisfies it |
|---|---|
| **Use of DataHub** — "Strong submissions go beyond reading metadata and contribute back to the graph" | Uses read tools (`get_lineage`, `get_lineage_paths_between`, `get_entities`, `list_schema_fields`) AND mutation tools (`add_structured_properties`, `save_document`, optionally `propose_lifecycle_stage`) — genuine write-back, not a read-only dashboard |
| **Technical Execution** — "Does the code do what the submission claims?" | The drift math (PSI / KS-test) is real, verifiable statistics, not an LLM asked to "assess if this looks off." This is the part most competing submissions will fake with a prompt. |
| **Originality** — "beyond features DataHub already provides out of the box" | DataHub's own Assertions product does freshness/volume/schema checks — it does **not** do statistical feature-distribution drift tied to ML lineage. This is a genuinely uncovered niche, confirmed by inspecting `datahub-skills` repo (no `ml_platforms` catalog-interaction skill exists, only an `ml_platforms` connector standard) |
| **Real-World Usefulness** — "Would a real data/ML/AI platform team see clear value?" | Feature drift silently breaking production models is one of the most commonly cited real MLOps failure modes — a Pinterest engineering-manager judge will recognize it instantly |
| **Submission Quality** | Addressed directly in Section 8 (repo structure) and Section 9 (demo script) |
| **Bonus: Meaningful OSS Contribution** — "new connectors, skills, fixes, RFCs" | Packaging this as an installable **DataHub Skill** (`datahub-ml-drift`, matching the real `skills/<name>/SKILL.md` convention) and opening a PR/RFC against `datahub-project/datahub-skills` is a direct, explicit hit on this bonus line |

**Why this beats the median submission:** with 764 registrants, the median team builds an app that *calls* the existing four skills (search/lineage/enrich/quality) to do something read-mostly. Very few will (a) do real statistics instead of LLM hand-waving, or (b) ship a new Skill artifact into the actual open-source registry. Both are checkable by a judge in minutes — that's what makes this defensible over a flashier-sounding idea.

`[RISK]` This only works if the stats are *actually* real and *actually* run live in the demo. If you fake the drift detection with a canned example, a technically literate judge (there are several on the panel) will see through it in the code review. Do not cut this corner.

---

## 3. Scope Definition

### 3.1 In scope (MVP — what you are building)

1. A **synthetic but realistic** data + ML lineage scenario, ingested into a local DataHub instance: a handful of source tables → a feature table → a "model" entity, connected via lineage edges.
2. A **drift detection engine**: given two time-windowed samples of a feature's values, compute Population Stability Index (PSI) and/or Kolmogorov–Smirnov statistic, and classify risk (low/medium/high) against a threshold.
3. An **agent orchestration layer** (Python, using the DataHub MCP Server tools) that:
   - Takes a model URN as input
   - Walks lineage upstream via `get_lineage_paths_between` / `get_lineage`
   - For each feature/table in the path, runs drift detection
   - Aggregates into a per-model risk report
4. **Write-back to DataHub**: attaches a drift score as a structured property on the feature/table entities, and saves a full incident report as a document via `save_document`, linked to the model.
5. Packaged as a **DataHub Skill** (`skills/datahub-ml-drift/SKILL.md` + `references/` + `templates/`) following the exact repo convention from `datahub-skills`, installable via `npx skills add`.
6. A CLI or minimal script entry point that judges can run themselves against a seeded local DataHub instance (docker-compose), per the "test the functionality" submission requirement.
7. A 3-minute demo video showing: seeding data → running the agent → drift detected → write-back visible in DataHub UI.
8. Public GitHub repo, Apache 2.0 license visible in the About section, README with setup instructions, `examples/` folder with a sample generated incident report.
9. A draft PR or Issue/RFC opened against `datahub-project/datahub-skills` proposing the new skill (even if not merged by deadline — the submission requirement is "meaningful contribution," not "merged").

### 3.2 Explicitly out of scope `[SCOPE CUT]`

- **Real production data sources.** You will not have time to hook up live Snowflake/BigQuery. Use synthetic CSVs ingested via DataHub's Python SDK emitter or a file-based ingestion recipe. State this honestly in the README — judges respect an honest "synthetic data, real methodology" framing far more than an implied claim of production use.
- **A trained ML model.** You are not training or serving an actual model. The "model" is a DataHub entity (dataset/mlModel) with lineage pointing to it. The drift detection operates on *feature* data, which is the actually interesting part; simulating model-serving is not required to prove the concept.
- **Real-time/streaming monitoring.** Batch, on-demand agent run only. A scheduler is a "future work" bullet, not a build item.
- **A polished frontend/dashboard.** CLI output + what's visible natively in the DataHub UI is enough. Do not build a custom React dashboard — that's hours you don't have, spent on something judges can already see natively in DataHub.
- **Multi-tenant / auth / production hardening.** Single local instance, single user, PAT auth. Fine for a hackathon.
- **Getting the skill actually merged upstream.** Out of your control and not required — opening the PR/RFC is what the bonus criterion asks for.

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Local DataHub Instance                    │
│              (docker-compose, DataHub Core/OSS)                │
│                                                                 │
│   Entities: source tables → feature_table → ml_model           │
│   (ingested via Python SDK emitter, synthetic data)             │
└───────────────────────────┬────────────────────────────────────┘
                             │  MCP (streamable HTTP or self-hosted
                             │  mcp-server-datahub via stdio)
┌───────────────────────────▼────────────────────────────────────┐
│                  ML Drift Sentinel Agent (Python)                │
│                                                                    │
│  1. Lineage Walker                                                │
│     — get_lineage_paths_between(model_urn, source_urns)           │
│     — get_lineage(model_urn, direction=upstream)                  │
│                                                                    │
│  2. Drift Engine  (pure Python, no DataHub dependency — testable   │
│     in isolation)                                                  │
│     — Loads "baseline" vs "current" feature samples (CSV/parquet)  │
│     — Computes PSI per numeric/categorical feature                 │
│     — Computes KS-statistic for continuous features                │
│     — Classifies: LOW / MEDIUM / HIGH risk per threshold            │
│                                                                    │
│  3. Risk Aggregator                                                │
│     — Combines per-feature scores into a per-model risk report     │
│     — Ranks upstream tables by contribution to risk                │
│                                                                    │
│  4. Write-Back Layer                                                │
│     — add_structured_properties(entity, drift_score, risk_level)    │
│     — save_document(incident_report, linked to model URN)           │
│     — [optional] propose_lifecycle_stage(model, "at_risk")          │
└────────────────────────────────────────────────────────────────┘
```

### 4.0 Deployment Architecture (hybrid — Vercel + Docker-capable host)

`[HONEST NOTE]` The whole project cannot run on Vercel. DataHub requires persistent stateful services (MySQL, OpenSearch/Elasticsearch, Kafka) that Vercel's serverless model does not support, and Vercel functions cap execution at 10–60s (300s on Pro) — too short for a full lineage-walk-plus-drift-audit run. What Vercel is genuinely good for, and worth having on your resume, is the frontend.

**Revised split:**

| Component | Hosted on | Why |
|---|---|---|
| Frontend UI (replaces Streamlit — see Phase 5 revision) | **Vercel** (Next.js) | Resume-relevant stack, generous free tier, trivial CI/CD from GitHub, gives a real public URL for the "project URL judges can test" submission requirement |
| DataHub instance (MySQL, OpenSearch, Kafka, GMS) | **Railway or Render** (Docker Compose–compatible) | Needs persistent containers — not serverless-compatible |
| Agent backend (FastAPI: lineage walk, drift engine, write-back, MCP calls) | Same host as DataHub (Railway/Render), exposed as a REST API | Keeps backend-to-DataHub calls on a fast internal network instead of round-tripping the public internet; avoids Vercel's execution time limits for what can be a multi-second audit run |
| Communication | Next.js (Vercel) → REST → FastAPI (Railway/Render) → MCP/SDK → DataHub | Standard three-tier split |

**Time cost, stated honestly:** this adds real scope — a second deployment target, a frontend/backend API contract, CORS, and Railway/Render Docker-deploy debugging, on top of the existing roadmap. Budget an additional **~6–8 hours** across Phase 5 and a new Phase 8. If you're behind schedule by Phase 5, the fallback is: keep the UI local and run it live in the demo video, skip public deployment entirely. The hackathon rubric requires judges can *test the functionality*, not that it's publicly hosted — a clear README + working local run + video satisfies that requirement on its own.

### 4.1 Tech stack

| Layer | Choice | Why |
|---|---|---|
| DataHub instance | Local docker-compose (DataHub Core/OSS, self-hosted) | No dependency on DataHub Cloud account approval/trial limits mid-build |
| MCP transport | Self-hosted `mcp-server-datahub` via `uvx`, stdio | Documented, no OAuth/DCR complexity to debug under time pressure |
| Agent language | Python 3.11+ | Matches your existing PolicyIQ/MarketLens stack; drift math libraries are Python-native |
| Drift math | `scipy.stats.ks_2samp`, custom PSI implementation (few lines, don't pull a heavyweight lib for this) | Standard, defensible, explainable to a judge in one sentence |
| Data ingestion into DataHub | DataHub Python SDK emitter (`datahub.emitter.mce_builder` / REST emitter) | Full control over synthetic lineage graph shape, no connector config needed |
| Agent-to-DataHub calls | Direct MCP tool calls via an MCP client library, OR direct Python SDK/GraphQL calls if MCP stdio integration eats too much time | `[SCOPE CUT]` — if MCP client plumbing in Python is a time sink, fall back to DataHub's Python SDK/REST API directly for the write-back calls and keep MCP for the interactive/Claude-driven demo path. Judges care that DataHub's context and mutation surface is used meaningfully — the transport detail matters less than the outcome. |
| Skill packaging | Markdown `SKILL.md` + `references/` + `templates/`, matching `datahub-skills` repo conventions exactly | This is what makes the OSS-contribution bonus land — sloppy packaging here undercuts the whole differentiator |
| Repo/License | Public GitHub repo, Apache 2.0 `LICENSE` file, visible in About section | **Hard submission requirement**, not optional |

`[RISK]` MCP client plumbing from a plain Python agent (not Claude Code/Cursor) is the least-documented part of everything you read today — the docs show MCP *client* configs for Claude/Cursor/etc., not a bare Python script calling MCP tools directly. Budget real debugging time here (see roadmap Phase 2) and have the SDK/GraphQL fallback ready so this doesn't become a blocker.

---

## 5. Synthetic Dataset & Lineage Design

You need a lineage shape that's simple enough to build in a day and rich enough to make a compelling demo. Suggested minimal graph:

```
raw_transactions (table)  ──┐
raw_customer_profile (table)─┼──► feature_table: churn_features (table) ──► churn_model (mlModel)
raw_support_tickets (table) ──┘
```

- 3 upstream "raw" tables, each with 2–4 columns
- 1 feature table joining/aggregating them (5–8 feature columns: numeric + categorical mix)
- 1 `mlModel` entity downstream, with lineage edge from `churn_features`

For the drift scenario: generate a **baseline** CSV (say, "last month's" feature distribution) and a **drifted** CSV (this week's), where 2–3 features have deliberately shifted (e.g., a categorical field gets a new dominant value, a numeric field's mean shifts by several standard deviations) and the rest stay stable. This gives you a demo-able, explainable, *controlled* result — not a hope-it-works live experiment on random data.

`[SCOPE CUT]` Don't try to make the synthetic data "look real" with thousands of rows. A few hundred rows per feature is enough for PSI/KS to produce a clean signal and keeps everything fast to regenerate while iterating.

---

## 6. Drift Detection Methodology (the technical core — don't skimp here)

### 6.1 Population Stability Index (PSI) — for both numeric (binned) and categorical features

```
PSI = Σ (current_% - baseline_%) × ln(current_% / baseline_%)
```
over each bucket/category. Standard interpretation thresholds:
- PSI < 0.1 → no significant shift
- 0.1 ≤ PSI < 0.25 → moderate shift, worth watching
- PSI ≥ 0.25 → significant shift, high risk

### 6.2 Kolmogorov–Smirnov test — for continuous numeric features

`scipy.stats.ks_2samp(baseline_sample, current_sample)` → D-statistic + p-value. Flag drift if p < 0.05 (standard significance threshold) — state this threshold explicitly in your README/report output so judges see you understand what you're claiming statistically, not just calling a library function.

### 6.3 Per-feature → per-model aggregation

- Each feature gets a risk classification (LOW/MEDIUM/HIGH)
- Model-level risk = worst-case of its features, with a breakdown showing *which* upstream table/feature is driving the risk (this is what makes the lineage-walk meaningful — you're not just reporting "something drifted," you're pinpointing *where in the graph*)

### 6.4 What goes into the write-back

- `add_structured_properties` on the feature/table entity: `drift_psi_score`, `drift_risk_level`, `last_checked_timestamp`
- `save_document`: a structured incident report — plain-English summary, per-feature breakdown table, root-cause table pointer, recommended action — linked to the model entity
- Optional stretch: `propose_lifecycle_stage(model_urn, "at_risk")` — a governed proposal rather than a direct mutation, which also lets you demo the proposal/approval MCP tools (`list_pending_proposals`, `accept_or_reject_proposals`) for extra "meaningful use of DataHub" credit

---

## 7. Agent Skill Packaging (`datahub-ml-drift`)

Following the exact structure observed in `datahub-project/datahub-skills`:

```
skills/datahub-ml-drift/
├── SKILL.md              # Main skill definition — trigger phrases, workflow steps
├── references/
│   └── drift-methodology.md   # PSI/KS explanation, thresholds, when to use which
└── templates/
    └── incident-report.md.tmpl # Template for the save_document output
```

`SKILL.md` should mirror the tone/structure of the existing five skills — a short description, example trigger phrases (`"Check churn_model for feature drift"`, `"/datahub-ml-drift audit the revenue pipeline"`), and a step-by-step workflow description that chains: search → lineage → (drift engine, external to MCP) → enrich/write-back. Read 1–2 existing `SKILL.md` files from the repo before writing yours — matching their voice exactly is part of what makes this look like a genuine contribution rather than a bolted-on hackathon artifact.

---

## 8. Repository Structure (submission-ready)

```
datahub-ml-drift-sentinel/
├── LICENSE                        # Apache 2.0 — MUST be visible in About section
├── README.md                      # Setup, architecture diagram, how to run, demo GIF/link
├── docker-compose.yml             # Local DataHub instance
├── data/
│   ├── seed_lineage.py            # Emits synthetic entities + lineage via DataHub SDK
│   ├── baseline_features.csv
│   └── drifted_features.csv
├── drift_engine/
│   ├── __init__.py
│   ├── psi.py
│   ├── ks_test.py
│   └── tests/                     # Unit tests on the stats — judges can run these
├── agent/
│   ├── lineage_walker.py
│   ├── risk_aggregator.py
│   ├── writeback.py
│   └── run_audit.py               # Main CLI entry point
├── skills/
│   └── datahub-ml-drift/          # The actual Skill contribution (Sec. 7)
├── examples/
│   └── sample_incident_report.md  # Pre-generated output, for judges who don't run it
└── docs/
    └── PRD.md                     # (this doc, trimmed — optional but shows rigor)
```

**Submission requirements checklist** (from the hackathon page, verbatim requirements):
- [ ] Project URL judges can test (hosted demo is hard for a local-DataHub project — a clear "run this in 5 minutes" README + video is the realistic substitute; state this explicitly)
- [ ] Public repo URL, Apache 2.0 license visible in About section
- [ ] Text description (features, functionality, tech, data used — be explicit that data is synthetic)
- [ ] Demo video, <3 min, YouTube/Vimeo, public
- [ ] `examples/` folder with sample outputs (optional but strongly recommended — do this)
- [ ] Feedback survey opt-in for the $50×10 bonus (low effort, do it)

---

## 9. Demo Video Script (3 minutes, tight)

1. **0:00–0:20** — Problem statement in plain English: "A model's feature drifts silently, nobody knows until the dashboard's wrong." Show the lineage graph in DataHub UI.
2. **0:20–0:50** — Run the agent: `python agent/run_audit.py --model churn_model`. Show it walking lineage live in terminal output.
3. **0:50–1:40** — Show the drift engine output: which feature drifted, PSI/KS numbers, risk classification. Briefly explain PSI in one sentence — this is where you prove it's real math, not an LLM guess.
4. **1:40–2:20** — Show the write-back: switch to DataHub UI, show the structured property and the saved incident document now attached to the entity.
5. **2:20–2:50** — Show the Skill packaging — `SKILL.md`, and the opened PR/Issue against `datahub-skills` repo.
6. **2:50–3:00** — One-line close: what a real team would do with this (schedule it, wire to alerting).

`[RISK]` Record this early (Phase 6, not Aug 9 night) — video editing and re-recording always take longer than expected, and a broken/rushed demo video actively hurts "Submission Quality" scoring.

---

## 10. Detailed Day-by-Day Roadmap (Jul 18 → Aug 10)

Assume ~2 hrs on weekdays, ~8–10 hrs across Sat/Sun. Adjust around your DSA/EA/Cisco commitments — but protect the weekend blocks, they're where the real progress happens.

### Phase 0 — Setup & Grounding (Jul 18–20, Sat–Mon)
- Register on Devpost, join hackathon, skim `#Rules` and `#Resources` tabs fully
- Get local DataHub instance running via docker-compose (this alone can eat half a day the first time — budget for it)
- `git clone` and read through `datahub-skills` repo fully — especially one full existing `SKILL.md` (e.g. `datahub-lineage`) end to end, and `CONTRIBUTING.md`
- Get `mcp-server-datahub` running self-hosted, confirm you can list tools and hit `get_me` successfully
- **Exit criteria:** local DataHub UI loads, MCP server responds, you've read one real SKILL.md closely

### Phase 1 — Drift Engine, standalone (Jul 21–24, Tue–Fri)
- Build `psi.py` and `ks_test.py` as pure Python, unit-testable, no DataHub dependency
- Generate baseline/drifted synthetic CSVs, hand-verify the PSI numbers make sense on a controlled shift
- Write unit tests
- **Exit criteria:** `pytest drift_engine/tests/` passes; you can run the drift engine on two CSVs from the command line and get sane, explainable numbers

### Phase 2 — Lineage Ingestion + MCP Integration (Jul 25–28, Sat–Tue)
- Write `seed_lineage.py` using DataHub's Python SDK emitter to create the 5-entity graph (3 tables → feature table → model)
- Verify the lineage graph renders correctly in DataHub's own UI before touching the agent
- Get the agent calling `get_lineage` / `get_lineage_paths_between` and successfully retrieving your seeded graph
- **This is your highest-risk phase — budget the whole weekend, not just weekday slivers.** If MCP-from-plain-Python proves painful, fall back to direct Python SDK/GraphQL calls (still legitimate "meaningful use of DataHub" — the mutation/read surface matters more than the transport)
- **Exit criteria:** running a script prints the full upstream lineage path from `churn_model` down to the 3 raw tables, pulled live from DataHub

### Phase 3 — Agent Orchestration (Jul 29 – Aug 2, Wed–Sun)
- Wire lineage walker → drift engine → risk aggregator into one pipeline
- Build `run_audit.py` CLI entry point with clean, readable terminal output (this doubles as your demo visual)
- **Exit criteria:** one command produces a full per-model risk report end-to-end, reproducibly

### Phase 4 — Write-Back (Aug 3–5, Mon–Wed)
- Implement `add_structured_properties`, `save_document`, verify both actually show up correctly in the DataHub UI attached to the right entities
- Implement optional `propose_lifecycle_stage` + demo `list_pending_proposals`/`accept_or_reject_proposals` if time allows `[SCOPE CUT candidate if behind schedule]`
- **Exit criteria:** after running the agent, you can navigate to the entity in DataHub UI and see the drift score and incident report attached — this is your single most important screenshot/video moment

### Phase 5 — Skill Packaging + OSS Contribution (Aug 6–7, Thu–Fri)
- Write `SKILL.md`, `references/drift-methodology.md`, `templates/incident-report.md.tmpl` matching repo conventions exactly
- Open a PR or Issue/RFC against `datahub-project/datahub-skills` proposing the addition — even a well-written Issue counts as "meaningful contribution" if a full PR isn't realistic in the time left
- **Exit criteria:** PR/Issue is live and linked in your submission

### Phase 6 — Demo, README, Polish (Aug 8, Sat)
- Record demo video (script in Section 9), aim for first-take-clean by rehearsing the CLI run twice beforehand
- Write final README with architecture diagram, honest "synthetic data" disclosure, setup steps
- Populate `examples/sample_incident_report.md`
- **Exit criteria:** a stranger could clone your repo and get it running from the README alone

### Phase 7 — Buffer, Submission, Feedback Survey (Aug 9–10, Sun–Mon)
- Full end-to-end dry run as if you were a judge
- Fix whatever breaks (something always breaks)
- Submit on Devpost, opt into the $50×10 feedback survey bonus
- **Hard deadline: Aug 10, 5:00 PM EDT = Aug 11, 2:30 AM IST — submit by Aug 10 evening IST to leave yourself buffer, do not cut it to the wire against a US timezone deadline**

---

## 11. Risk Register (honest, not hedged)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP-from-Python integration is more fiddly than the docs suggest | Medium-High | Medium | Fallback to direct DataHub SDK/GraphQL for write-back calls; MCP still used for the interactive demo path |
| Time collision with DSA/Cisco CCET prep causes Phase 2/3 to slip | Medium | High | Weekend blocks are non-negotiable; if slipping, cut `propose_lifecycle_stage` stretch goal first, not core write-back |
| Local DataHub docker-compose setup burns a full day unexpectedly | Medium | Medium | Attempt this Day 1 (Jul 18), not later, so you have runway to debug |
| Demo video looks like a toy because data is synthetic | Low-Medium | Medium | Be upfront in README and video narration about synthetic data + real methodology — judges penalize overclaiming far more than honest scoping |
| Another team builds something similar | Low | Medium | The specific combination (real drift stats + Skill packaging + OSS PR) is a fairly unusual intersection; even partial overlap won't match on all three |
| PR to `datahub-skills` gets no maintainer response before deadline | High (near-certain) | Low | Doesn't matter — the bonus criterion rewards the contribution being made, not merged |

---

## 12. Definition of Done (self-check before submitting)

- [ ] Agent runs end-to-end against a fresh docker-compose DataHub instance from a clean clone
- [ ] Drift detection produces correct, explainable numbers on the controlled synthetic scenario
- [ ] At least one mutation tool write-back is visible in the DataHub UI after a run
- [ ] `skills/datahub-ml-drift/SKILL.md` exists and matches repo conventions
- [ ] PR/Issue opened against `datahub-project/datahub-skills`
- [ ] Repo is public, Apache 2.0 `LICENSE` visible in About section
- [ ] README lets a stranger reproduce your demo
- [ ] Video is under 3 minutes, public, shows the thing actually running
- [ ] `examples/` has a real sample output
- [ ] Submitted on Devpost with feedback survey opted in
