"""
Phase 4 — Write-Back to DataHub: writeback.py

Writes ModelAuditReport results back to DataHub:
1. Adds structured properties (drift_psi_score, drift_risk_level,
   last_checked_timestamp) on churn_features and each drifted upstream entity.
2. Saves/updates an incident report document linked to the churn_model URN.

Uses the DataHub Python SDK for both operations (MetadataChangeProposalWrapper
with DatahubRestEmitter), ensuring proper token-based auth via DATAHUB_GMS_TOKEN.

Idempotency: structured properties are emitted as UPSERT (overwriting previous
values). Documents use a deterministic URN derived from the title, so re-running
updates the same document rather than creating duplicates.
"""

import hashlib
import json
import os
import sys
import time
from dataclasses import asdict

import jinja2
from datahub.emitter.mcp import MetadataChangeProposalWrapper
from datahub.emitter.rest_emitter import DatahubRestEmitter
from datahub.metadata.schema_classes import (
    AuditStampClass,
    DocumentContentsClass,
    DocumentInfoClass,
    DocumentStatusClass,
    RelatedAssetClass,
    StructuredPropertiesClass,
    StructuredPropertyValueAssignmentClass,
)

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.run_audit import FeatureRiskResult, ModelAuditReport


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROP_PSI = "urn:li:structuredProperty:drift_psi_score"
PROP_RISK = "urn:li:structuredProperty:drift_risk_level"
PROP_TIMESTAMP = "urn:li:structuredProperty:last_checked_timestamp"

INCIDENT_TITLE_PREFIX = "Drift Incident Report"


def _get_emitter() -> DatahubRestEmitter:
    gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
    gms_token = os.environ.get("DATAHUB_GMS_TOKEN")
    return DatahubRestEmitter(gms_server=gms_url, token=gms_token)


# ---------------------------------------------------------------------------
# 1. Structured Properties Write-Back
# ---------------------------------------------------------------------------

def write_structured_properties(report: ModelAuditReport) -> None:
    """
    Emit structured properties (drift_psi_score, drift_risk_level,
    last_checked_timestamp) to churn_features and each entity with
    MEDIUM or HIGH drift.

    The StructuredPropertiesClass aspect is an UPSERT — re-emitting with
    the same propertyUrns overwrites the previous values, ensuring idempotency.
    """
    emitter = _get_emitter()

    # Collect unique entity URNs to tag.
    # Always tag the feature dataset (source_entity_urn) with the worst-case overall.
    entities_to_tag: dict[str, FeatureRiskResult] = {}

    if not report.feature_results:
        return

    worst_result = max(report.feature_results, key=lambda r: r.psi)
    feature_urn = report.feature_results[0].source_entity_urn
    # The overall risk for the feature dataset should match the report's overall risk
    worst_result.risk_level = report.overall_risk
    entities_to_tag[feature_urn] = worst_result

    feature_to_raw = {
        # churn_model features
        "avg_transaction_amount": "raw_transactions",
        "transaction_count_30d": "raw_transactions",
        "refund_rate": "raw_transactions",
        "signup_channel": "raw_customer_profile",
        "account_age_days": "raw_customer_profile",
        "region": "raw_customer_profile",
        "support_ticket_count_30d": "raw_support_tickets",
        "avg_resolution_time": "raw_support_tickets",
        # fraud_model features
        "payment_amount": "raw_payments",
        "tx_frequency_1h": "raw_payments",
        "device_trust_score": "raw_user_devices",
        "failed_login_attempts": "raw_user_devices",
        "ip_risk_score": "raw_ip_blacklist",
        "is_vpn": "raw_ip_blacklist"
    }

    # "urn:li:dataset:(urn:li:dataPlatform:custom,churn_features,PROD)"
    parts = feature_urn.split(",")
    if len(parts) >= 3:
        platform = parts[0].split("(")[1]
        env = parts[2].strip(")")
    else:
        platform = "urn:li:dataPlatform:custom"
        env = "PROD"

    # Find the worst drifted feature for each raw table
    raw_table_worst_result: dict[str, FeatureRiskResult] = {}
    for feature_result in report.feature_results:
        if feature_result.risk_level in ("MEDIUM", "HIGH"):
            raw_table_name = feature_to_raw.get(feature_result.feature_name)
            if raw_table_name:
                if raw_table_name not in raw_table_worst_result:
                    raw_table_worst_result[raw_table_name] = feature_result
                elif feature_result.psi > raw_table_worst_result[raw_table_name].psi:
                    raw_table_worst_result[raw_table_name] = feature_result

    for raw_table_name, worst_feat_result in raw_table_worst_result.items():
        raw_table_urn = f"urn:li:dataset:({platform},{raw_table_name},{env})"
        entities_to_tag[raw_table_urn] = worst_feat_result

    for entity_urn, result in entities_to_tag.items():
        mcp = MetadataChangeProposalWrapper(
            entityUrn=entity_urn,
            aspect=StructuredPropertiesClass(
                properties=[
                    StructuredPropertyValueAssignmentClass(
                        propertyUrn=PROP_PSI,
                        values=[str(round(result.psi, 4))],
                    ),
                    StructuredPropertyValueAssignmentClass(
                        propertyUrn=PROP_RISK,
                        values=[result.risk_level],
                    ),
                    StructuredPropertyValueAssignmentClass(
                        propertyUrn=PROP_TIMESTAMP,
                        values=[report.timestamp],
                    ),
                ]
            ),
        )
        emitter.emit(mcp)
        entity_name = entity_urn.split(",")[1] if "," in entity_urn else entity_urn
        print(f"  ✓ Structured properties set on {entity_name}")


# ---------------------------------------------------------------------------
# 2. Incident Report Document
# ---------------------------------------------------------------------------

def _render_incident_report(report: ModelAuditReport) -> str:
    """Render the incident report markdown from the Jinja2 template."""
    template_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates"
    )
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(template_dir),
        undefined=jinja2.StrictUndefined,
    )
    template = env.get_template("incident-report.md.tmpl")

    risk_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for r in report.feature_results:
        risk_counts[r.risk_level] += 1

    model_name = report.model_urn.split(",")[1]
    return template.render(
        model_name=model_name,
        model_urn=report.model_urn,
        timestamp=report.timestamp,
        overall_risk=report.overall_risk,
        top_contributing_feature=report.top_contributing_feature,
        high_count=risk_counts["HIGH"],
        medium_count=risk_counts["MEDIUM"],
        low_count=risk_counts["LOW"],
        feature_results=report.feature_results,
    )


def write_incident_report(report: ModelAuditReport) -> str:
    """
    Render and save/update the incident report document in DataHub.

    Uses a deterministic URN derived from the document title so that
    re-running always updates the same document (idempotency).
    Preserves the original 'created' timestamp on subsequent runs.

    Returns the document URN.
    """
    emitter = _get_emitter()

    model_name = report.model_urn.split(",")[1]
    title = f"{INCIDENT_TITLE_PREFIX} — {model_name}"
    content = _render_incident_report(report)

    # Deterministic URN from title for idempotent upsert
    doc_id = hashlib.md5(title.encode()).hexdigest()[:16]
    doc_urn = f"urn:li:document:drift-sentinel-{doc_id}"

    now_ms = int(time.time() * 1000)
    actor = "urn:li:corpuser:datahub"

    # Preserve the original created timestamp if the document already exists
    created_stamp = AuditStampClass(time=now_ms, actor=actor)
    try:
        from datahub.ingestion.graph.client import DataHubGraph, DataHubGraphConfig
        gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
        gms_token = os.environ.get("DATAHUB_GMS_TOKEN", "")
        graph = DataHubGraph(DataHubGraphConfig(server=gms_url, token=gms_token))
        existing = graph.get_aspect(doc_urn, DocumentInfoClass)
        if existing is not None and existing.created is not None:
            created_stamp = existing.created
    except Exception:
        pass  # First run or connectivity issue — use current time

    mcp = MetadataChangeProposalWrapper(
        entityUrn=doc_urn,
        aspect=DocumentInfoClass(
            status=DocumentStatusClass(state="PUBLISHED"),
            contents=DocumentContentsClass(text=content),
            created=created_stamp,
            lastModified=AuditStampClass(time=now_ms, actor=actor),
            title=title,
            relatedAssets=[RelatedAssetClass(asset=report.model_urn)],
        ),
    )
    emitter.emit(mcp)
    print(f"  ✓ Incident report saved: {doc_urn}")

    return doc_urn


# ---------------------------------------------------------------------------
# Combined write-back
# ---------------------------------------------------------------------------

def writeback(report: ModelAuditReport) -> None:
    """Run all write-back operations for a completed audit report."""
    print("\n=== Phase 4: Writing results back to DataHub ===")

    print("\n1. Setting structured properties on upstream entities...")
    write_structured_properties(report)

    print("\n2. Saving incident report document...")
    write_incident_report(report)

    print("\n=== Write-back complete ===")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Write audit results back to DataHub")
    parser.add_argument(
        "--report-json",
        type=str,
        help="Path to a JSON file containing a ModelAuditReport",
    )
    args = parser.parse_args()

    if args.report_json:
        with open(args.report_json) as f:
            data = json.load(f)
        report = ModelAuditReport(
            model_urn=data["model_urn"],
            timestamp=data["timestamp"],
            feature_results=[FeatureRiskResult(
                feature_name=fr["feature_name"],
                source_entity_urn=fr["source_entity_urn"],
                psi=fr["psi"],
                ks_pvalue=fr.get("ks_pvalue"),
                risk_level=fr["risk_level"],
                baseline_distribution=fr.get("baseline_distribution", []),
                current_distribution=fr.get("current_distribution", []),
            ) for fr in data["feature_results"]],
            overall_risk=data["overall_risk"],
            top_contributing_feature=data["top_contributing_feature"],
        )
        writeback(report)
    else:
        print("Usage: python agent/writeback.py --report-json <path>")
        print("Or import and call writeback(report) from run_audit.py")
