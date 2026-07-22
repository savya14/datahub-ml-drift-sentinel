"""
Phase 3 — Agent Orchestration: run_audit.py

Combines lineage walking (agent/lineage_walker.py) with drift detection
(drift_engine/psi.py, drift_engine/ks_test.py) to produce a structured
ModelAuditReport per BUILD_SPEC.md Phase 3.

Usage:
    python agent/run_audit.py --model churn_model          # human-readable
    python agent/run_audit.py --model churn_model --json   # JSON output
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

import pandas as pd

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from drift_engine.psi import psi_numeric, psi_categorical
from drift_engine.ks_test import ks_test
from agent.lineage_walker import get_lineage_paths_between


# ---------------------------------------------------------------------------
# Structured report types (BUILD_SPEC Phase 3 schema)
# ---------------------------------------------------------------------------

@dataclass
class FeatureRiskResult:
    feature_name: str
    source_entity_urn: str
    psi: float
    ks_pvalue: float | None
    risk_level: str  # LOW / MEDIUM / HIGH
    baseline_distribution: list[float]
    current_distribution: list[float]
    null_rate: float | None = None
    recommendation: str | None = None


@dataclass
class ModelAuditReport:
    model_urn: str
    timestamp: str
    feature_results: list[FeatureRiskResult]
    overall_risk: str  # worst-case of feature_results
    top_contributing_feature: str
    upstream_entities: list[str] = None


# ---------------------------------------------------------------------------
# Core audit logic
# ---------------------------------------------------------------------------

def run_audit(model_name: str) -> ModelAuditReport:
    """Run a full drift audit for the given model and return a ModelAuditReport."""
    model_urn = f"urn:li:mlModel:(urn:li:dataPlatform:custom,{model_name},PROD)"

    # 1. Walk lineage and set feature CSV paths per model
    if model_name == "fraud_model":
        feature_dataset = "urn:li:dataset:(urn:li:dataPlatform:custom,fraud_features,PROD)"
        target_urns = [
            feature_dataset,
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_payments,PROD)",
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_user_devices,PROD)",
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_ip_blacklist,PROD)",
        ]
        baseline_filename = "fraud_baseline_features.csv"
        current_filename = "fraud_current_features.csv"
    else:
        feature_dataset = "urn:li:dataset:(urn:li:dataPlatform:custom,churn_features,PROD)"
        target_urns = [
            feature_dataset,
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_transactions,PROD)",
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_customer_profile,PROD)",
            "urn:li:dataset:(urn:li:dataPlatform:custom,raw_support_tickets,PROD)",
        ]
        baseline_filename = "baseline_features.csv"
        current_filename = "current_features.csv"

    paths = get_lineage_paths_between(model_urn, target_urns)

    # Extract dynamic upstream tables (ignoring the feature dataset itself)
    upstream_entities = set()
    for target, path_nodes in paths.items():
        if target != feature_dataset:
            # URN format is typically urn:li:dataset:(platform,name,env)
            parts = target.split(",")
            if len(parts) >= 2:
                upstream_entities.add(parts[1])
            else:
                upstream_entities.add(target)
    upstream_entities_list = sorted(list(upstream_entities))

    # 2. Load feature data
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    baseline_path = os.path.join(data_dir, baseline_filename)
    current_path = os.path.join(data_dir, current_filename)

    if not os.path.exists(baseline_path) or not os.path.exists(current_path):
        raise FileNotFoundError("Baseline or current feature CSVs not found in data/ directory.")

    baseline_df = pd.read_csv(baseline_path)
    current_df = pd.read_csv(current_path)

    ignore_cols = ["customer_id"]
    cols_to_test = [c for c in baseline_df.columns if c not in ignore_cols]

    # 3. Run drift detection per feature
    feature_results: list[FeatureRiskResult] = []

    from drift_engine.recommendations import get_recommendation

    for col in cols_to_test:
        null_rate = float(current_df[col].isnull().mean())
        if pd.api.types.is_numeric_dtype(baseline_df[col]):
            psi_res = psi_numeric(baseline_df[col], current_df[col], col)
            ks_res = ks_test(baseline_df[col], current_df[col], col)
            feature_results.append(FeatureRiskResult(
                feature_name=col,
                source_entity_urn=feature_dataset,
                psi=round(psi_res.psi, 6),
                ks_pvalue=round(ks_res.p_value, 6),
                risk_level=psi_res.risk_level,
                baseline_distribution=psi_res.baseline_dist,
                current_distribution=psi_res.current_dist,
                null_rate=round(null_rate, 4),
                recommendation=get_recommendation(psi_res.psi, ks_res.p_value, null_rate)
            ))
        else:
            psi_res = psi_categorical(baseline_df[col], current_df[col], col)
            feature_results.append(FeatureRiskResult(
                feature_name=col,
                source_entity_urn=feature_dataset,
                psi=round(psi_res.psi, 6),
                ks_pvalue=None,
                risk_level=psi_res.risk_level,
                baseline_distribution=psi_res.baseline_dist,
                current_distribution=psi_res.current_dist,
                null_rate=round(null_rate, 4),
                recommendation=get_recommendation(psi_res.psi, None, null_rate)
            ))

    # 4. Aggregate
    risk_scores = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    overall_risk = max(feature_results, key=lambda r: risk_scores[r.risk_level]).risk_level
    top_feature = max(feature_results, key=lambda r: r.psi)

    return ModelAuditReport(
        model_urn=model_urn,
        timestamp=datetime.now(timezone.utc).isoformat(),
        feature_results=feature_results,
        overall_risk=overall_risk,
        top_contributing_feature=top_feature.feature_name,
        upstream_entities=upstream_entities_list,
    )


# ---------------------------------------------------------------------------
# Human-readable printer
# ---------------------------------------------------------------------------

def print_report(report: ModelAuditReport) -> None:
    """Print the audit report in a human-readable table format."""
    print(f"=== Model Audit Report: {report.model_urn} ===")
    print(f"Timestamp: {report.timestamp}\n")

    print("Drift Results:")
    for r in report.feature_results:
        drift_str = f"PSI: {r.psi:.3f} ({r.risk_level})"
        if r.ks_pvalue is not None:
            drift_str += f", KS p-value: {r.ks_pvalue:.4f}"
        print(f"  {r.feature_name:<25} | {drift_str}")

    print(f"\nOverall Risk: {report.overall_risk}")
    print(f"Top Contributing Feature: {report.top_contributing_feature}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run ML model drift audit")
    parser.add_argument("--model", type=str, required=True, help="Model name to audit (e.g. churn_model)")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Output full report as JSON")
    parser.add_argument("--no-writeback", action="store_true", help="Skip writing results back to DataHub")
    args = parser.parse_args()

    report = run_audit(args.model)

    if args.json_output:
        print(json.dumps(asdict(report), indent=2))
    else:
        print_report(report)

    if not args.no_writeback:
        from agent.writeback import writeback
        writeback(report)
