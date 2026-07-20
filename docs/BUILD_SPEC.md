# BUILD_SPEC.md — Agent-Ready Phased Build Instructions
### DataHub ML Drift Sentinel

**How to use this document:** Do not paste the whole thing into your agentic coder at once. Feed it **one phase at a time**, in order. After each phase, run the checkpoint yourself before moving on — don't let the agent tell you it passed, verify it. Each phase is self-contained with everything the agent needs: exact schemas, exact commands, and explicit "do not guess this" flags where the agent must look something up live instead of inventing it.

Companion doc: `DataHub_ML_Drift_Sentinel_PRD.md` (strategic rationale, judging-criteria mapping — give the agent this too for context, but BUILD_SPEC.md is what it should execute against).

---

## ⚠️ Global rules for the agentic coder (paste this once, at the start of session)

```
You are building a hackathon project against DataHub, an open-source metadata
platform. Two hard rules:

1. NEVER invent DataHub MCP tool parameter names, GraphQL field names, or SDK
   method signatures. Where this spec says "VERIFY LIVE", you must either
   (a) call the tool discovery / introspection mechanism available to you and
   read the real schema, or (b) fetch the linked documentation/source, before
   writing code that calls it. If you cannot verify, stop and tell me instead
   of guessing.

2. Work phase by phase. Do not start Phase N+1 until I confirm Phase N's
   checkpoint passed. If a phase's checkpoint fails, fix that phase — don't
   patch around it in a later phase.
```

---

## Phase 0 — Environment Setup

**Objective:** Working local DataHub instance + working MCP server connection, verified before any product code is written.

**Exact commands (grounded in official DataHub quickstart docs, current as of this project):**

```bash
# Prerequisites: Docker + Docker Compose v2, Python 3.10+
# Resource allocation: 2 CPUs, 8GB RAM, 2GB swap, 13GB disk minimum

pip install acryl-datahub
datahub version   # verify install

datahub docker quickstart
# This pulls docker/quickstart/docker-compose.quickstart-profile.yml
# automatically to ~/.datahub/quickstart — do NOT hand-write a
# docker-compose.yml, use the CLI-managed one.

# UI available at http://localhost:9002
# Default login: username=datahub, password=datahub

datahub init --username datahub --password datahub
```

**Generate a Personal Access Token** for MCP/SDK auth: DataHub UI → Settings → Access Tokens → Generate. Store as `DATAHUB_GMS_TOKEN` env var. `DATAHUB_GMS_URL` = `http://localhost:8080` (the GMS endpoint, not the 9002 UI port).

**MCP server (self-hosted):**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # installs uv/uvx

export DATAHUB_GMS_URL="http://localhost:8080"
export DATAHUB_GMS_TOKEN="<your PAT>"

uvx mcp-server-datahub@latest
```

**VERIFY LIVE:** Once the MCP server is running, connect to it (via Claude Code, `claude mcp add`, or any MCP client) and call its tool-listing mechanism. Save the real tool schemas (names + parameters) to `docs/mcp-tools-verified.json` in the repo. This file is the single source of truth for every later phase — no phase should call an MCP tool without a matching entry here.

**Checkpoint:**
- [ ] `http://localhost:9002` loads, login works
- [ ] `docs/mcp-tools-verified.json` exists and contains real, tool-discovered (not guessed) schemas for at minimum: `search`, `get_entities`, `get_lineage`, `get_lineage_paths_between`, `add_structured_properties`, `save_document`

---

## Phase 1 — Drift Engine (standalone, zero DataHub dependency)

**Objective:** Statistically correct drift detection, unit-tested, runnable in isolation.

### Exact synthetic schema

**`raw_transactions.csv`**
| column | type | notes |
|---|---|---|
| transaction_id | string | unique |
| customer_id | string | FK |
| amount | float | |
| transaction_type | categorical | {purchase, refund, chargeback} |
| timestamp | datetime | |

**`raw_customer_profile.csv`**
| column | type | notes |
|---|---|---|
| customer_id | string | unique |
| signup_channel | categorical | {organic, paid_ad, referral, partner} |
| account_age_days | int | |
| region | categorical | {north, south, east, west} |

**`raw_support_tickets.csv`**
| column | type | notes |
|---|---|---|
| ticket_id | string | unique |
| customer_id | string | FK |
| ticket_category | categorical | {billing, technical, account, other} |
| resolution_time_hours | float | |

**`churn_features` (derived, per customer_id):**
| column | type | derivation |
|---|---|---|
| customer_id | string | |
| avg_transaction_amount | float | mean(amount) over transactions |
| transaction_count_30d | int | count of transactions |
| refund_rate | float [0,1] | refund+chargeback count / total transactions |
| signup_channel | categorical | passthrough |
| account_age_days | int | passthrough |
| support_ticket_count_30d | int | count of tickets |
| avg_resolution_time | float | mean(resolution_time_hours) |
| region | categorical | passthrough |

### Controlled drift scenario (generate two versions of `churn_features`: `baseline.csv` and `current.csv`, ~300 synthetic customers each)

| feature | baseline behavior | current (drifted) behavior | expected result |
|---|---|---|---|
| `refund_rate` | mean ≈ 0.05, std ≈ 0.03 | mean ≈ 0.18, std ≈ 0.06 (simulate a chargeback wave) | **HIGH risk** — this is your headline finding |
| `signup_channel` | ~50% organic, 25% referral, 15% paid_ad, 10% partner | ~55% paid_ad, 20% organic, 15% referral, 10% partner (simulate new ad campaign) | **HIGH/MEDIUM risk** |
| `avg_resolution_time` | mean ≈ 12hrs, std ≈ 4 | mean ≈ 12.5hrs, std ≈ 4.2 (near-identical) | **LOW risk — this is your negative control, must NOT flag** |
| all other features | unchanged distribution | unchanged distribution | LOW risk |

A negative control that correctly stays LOW is more convincing to a judge than five features all screaming HIGH — it proves the detector discriminates rather than just alarming on everything.

### Drift math — exact formulas the agent must implement (do not substitute a library that hides the math; this needs to be inspectable code for the demo)

**PSI** (numeric features: bin into deciles using baseline's bin edges; categorical: bins = categories):
```python
def psi(baseline_pct: np.ndarray, current_pct: np.ndarray, epsilon=1e-4) -> float:
    baseline_pct = np.clip(baseline_pct, epsilon, None)
    current_pct = np.clip(current_pct, epsilon, None)
    return float(np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct)))
```
Thresholds: `< 0.1` → LOW, `0.1–0.25` → MEDIUM, `≥ 0.25` → HIGH

**KS-test** (continuous numeric only): `scipy.stats.ks_2samp(baseline_sample, current_sample)`. Flag drift if `p_value < 0.05`.

**Checkpoint (this is a real, computable assertion — do not skip):**
```python
# tests/test_drift_engine.py
def test_refund_rate_flags_high_risk():
    result = compute_drift("refund_rate", baseline_df, current_df)
    assert result.psi >= 0.25
    assert result.risk_level == "HIGH"

def test_resolution_time_stays_low_risk():
    result = compute_drift("avg_resolution_time", baseline_df, current_df)
    assert result.psi < 0.1
    assert result.risk_level == "LOW"
```
- [ ] Both tests pass on your actual generated synthetic data (numbers above are targets to generate data *toward*, not hardcoded outputs — tune the synthetic data generator until these hold true)
- [ ] `pytest drift_engine/tests/` green

---

## Phase 2 — Lineage Ingestion + Live MCP Retrieval

**Objective:** The 5-entity graph exists in your running DataHub instance, and your code can retrieve it live via MCP (or SDK/GraphQL fallback — see below).

### Entity/lineage graph to create

```
raw_transactions (dataset) ─┐
raw_customer_profile (dataset) ─┼─► churn_features (dataset) ─► churn_model (mlModel)
raw_support_tickets (dataset) ─┘
```

Use DataHub's Python SDK emitter (`datahub.emitter.rest_emitter` / `datahub.metadata.schema_classes`) to create these 5 entities with `UpstreamLineage` aspects connecting them exactly as above. **VERIFY LIVE**: pull the current SDK emitter API from `docs.datahub.com/docs/metadata-ingestion/as-a-library` or the installed package's own docstrings before writing this — SDK method signatures are exactly the kind of thing that gets hallucinated wrong.

**Checkpoint:**
- [ ] All 5 entities visible in DataHub UI at `localhost:9002`
- [ ] Lineage graph tab on `churn_model` shows the correct upstream chain visually
- [ ] A script calling `get_lineage_paths_between(churn_model_urn, [raw_transactions_urn, raw_customer_profile_urn, raw_support_tickets_urn])` (exact params per your `mcp-tools-verified.json`) returns the correct path — **live, from the running instance, not mocked**

**Fallback if MCP-from-Python proves painful (budget max 1 day before switching):** use DataHub's REST/GraphQL API directly for both ingestion and lineage retrieval. This still satisfies "meaningful use of DataHub" — document in the README which calls go through MCP vs. direct API and why, honestly.

---

## Phase 3 — Agent Orchestration

**Objective:** One command, `run_audit.py --model churn_model`, produces a complete per-model risk report by combining Phase 1 + Phase 2.

**Pipeline:** lineage walk (Phase 2) → for each upstream dataset with a feature column, load baseline/current samples → drift engine (Phase 1) → aggregate into a report object:

```python
@dataclass
class FeatureRiskResult:
    feature_name: str
    source_entity_urn: str
    psi: float
    ks_pvalue: float | None
    risk_level: str  # LOW / MEDIUM / HIGH

@dataclass
class ModelAuditReport:
    model_urn: str
    timestamp: str
    feature_results: list[FeatureRiskResult]
    overall_risk: str  # worst-case of feature_results
    top_contributing_feature: str
```

**Checkpoint:**
- [ ] `python agent/run_audit.py --model churn_model` runs end-to-end with no manual steps
- [ ] Output correctly identifies `refund_rate` (and/or `signup_channel`) as HIGH risk and `avg_resolution_time` as LOW risk
- [ ] Report is serializable to JSON (needed for both write-back and the UI in Phase 5)

---

## Phase 4 — Write-Back to DataHub

**Objective:** After running the audit, a human opening the DataHub UI sees the finding attached to the right entities — this is your single most important screenshot.

Using tool schemas from `docs/mcp-tools-verified.json` (do not guess params):
- `add_structured_properties` on `churn_features` and each drifted upstream table: `drift_psi_score`, `drift_risk_level`, `last_checked_timestamp`
- `save_document`: full incident report (use `templates/incident-report.md.tmpl`), linked to `churn_model` URN
- Optional stretch: `propose_lifecycle_stage(churn_model_urn, "at_risk")`, then demonstrate `list_pending_proposals` / `accept_or_reject_proposals`

**Checkpoint:**
- [ ] Navigate to `churn_features` in DataHub UI → structured properties visible with correct values
- [ ] Incident document visible, linked to `churn_model`
- [ ] Re-running the audit updates (not duplicates) these — idempotency matters for a judge poking at it twice

---

## Phase 5 — UI Layer (Next.js, Vercel-deployable)

**Objective:** A visually polished, demo-ready interface, deployable to Vercel for a real public URL and a resume-relevant stack. Revised from the earlier Streamlit plan per the deployment decision in PRD Section 4.0 — this costs more time than Streamlit would have; see Phase 8 for the honest fallback if you're behind schedule.

**Split:**
- **Frontend:** Next.js (App Router), deployed on Vercel. Pure presentation + API calls — no DataHub/MCP logic lives here.
- **Backend:** FastAPI, wraps Phases 1–4's Python code (drift engine, lineage walker, write-back) behind a small REST API: `GET /models`, `POST /audit/{model_urn}`, `POST /writeback/{model_urn}`. Deployed alongside DataHub on Railway/Render (Phase 8).

**Exact page spec:**

1. **Header:** Project name, one-line description
2. **Model selector:** dropdown populated live from `GET /models` (which internally calls `search`/`get_entities` — no hardcoded model list)
3. **"Run Audit" button** → `POST /audit/{model_urn}` → renders:
   - Lineage diagram: model → features → tables, color-coded by risk (a lightweight graph library — e.g. `react-flow` or even a hand-laid-out SVG for 5 nodes is fine, don't over-engineer this)
   - Per-feature risk cards: PSI value, risk badge (green/amber/red), small bar chart comparing baseline vs. current distribution (`recharts`)
4. **"Write to DataHub" button** → `POST /writeback/{model_urn}` → success confirmation + direct link to the entity in the DataHub UI
5. **Footer:** link to GitHub repo

**Checkpoint:**
- [ ] `npm run dev` locally renders the page, model dropdown populates from the live FastAPI backend (which in turn hits live DataHub — no mock data anywhere in this chain)
- [ ] "Run Audit" round-trips to the backend and shows real results within a few seconds
- [ ] Lineage diagram renders correctly, color-codes match actual risk levels
- [ ] "Write to DataHub" button works, confirmation link opens the correct entity

**This is what you record for the demo video.**

---

## Phase 6 — Skill Packaging + OSS Contribution

Per PRD Section 7 — `skills/datahub-ml-drift/SKILL.md` + `references/` + `templates/`, matching `datahub-skills` repo conventions exactly.

**VERIFY LIVE:** before writing `SKILL.md`, fetch and read at least one real file — e.g. `https://github.com/datahub-project/datahub-skills/blob/main/skills/datahub-lineage/SKILL.md` — and match its structure/voice. Do not invent the format from the README description alone.

**Checkpoint:**
- [ ] `SKILL.md` structurally matches a real existing skill (headers, trigger-phrase style, workflow description)
- [ ] PR or Issue opened against `datahub-project/datahub-skills`, linked in your submission

---

## Phase 7 — Repo Finalization, Demo Video, Submission

Per PRD Sections 8–9 and 12 (Definition of Done). No new technical work here — packaging, README, video, submission form.

---

## Phase 8 — Deployment (Vercel + Railway/Render)

**Objective:** Public URLs for the frontend and a working demo, without silently blowing your deadline.

**Steps:**
1. Deploy DataHub + FastAPI backend to Railway or Render as Docker services (both support `docker-compose`-style multi-container deploys). Expose the FastAPI service's URL.
2. Set the deployed backend URL as an environment variable in Vercel's project settings for the Next.js frontend.
3. Deploy the Next.js frontend to Vercel via GitHub integration (push to `main` → auto-deploy).
4. Verify the full chain works against the **deployed** instances, not just localhost — this is a distinct checkpoint, things that work locally often break on deploy (CORS, env vars, cold-start timing).

**Checkpoint:**
- [ ] Vercel URL loads and successfully calls the deployed backend
- [ ] "Run Audit" and "Write to DataHub" work end-to-end against the deployed DataHub instance
- [ ] Link both URLs in your README and Devpost submission

**Honest fallback — use this if you reach Aug 6–7 and Phase 8 isn't done:** Skip public deployment. Run everything locally for the demo video, and state clearly in the README: "Live demo shown in video; to run locally: [steps]." The hackathon submission requirement is that judges *can test the functionality* — a clean local setup with a good README satisfies this. A rushed, broken Vercel deployment recorded in your demo video actively hurts you more than an honest "run it locally" README helps you. Do not let deployment debugging eat into Phase 6/7 time.

---

## Master Checklist Summary (one line per phase)

- [ ] Phase 0 — DataHub + MCP running, tools verified live
- [ ] Phase 1 — Drift engine, negative-control test passes
- [ ] Phase 2 — Lineage graph live in DataHub, retrievable via code
- [ ] Phase 3 — End-to-end audit report from one command
- [ ] Phase 4 — Write-back visible in DataHub UI, idempotent
- [ ] Phase 5 — Streamlit UI, live data, working write-back button
- [ ] Phase 6 — Skill packaged, PR/Issue opened upstream
- [ ] Phase 7 — Repo finalized, demo video recorded
- [ ] Phase 8 — Deployed to Vercel + Railway/Render (or honest local fallback documented)
- [ ] Submitted on Devpost before Aug 10, 5PM EDT
