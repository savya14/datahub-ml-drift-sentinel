#!/usr/bin/env python3
"""
reset_demo_state.py — Clean-slate reset for demo rehearsals.

Performs three steps:
  1. Re-runs seed_lineage.py to overwrite structured properties on both
     models with their original values (MCP emit = UPSERT, no duplicates).
  2. Deletes any previously-written incident report documents so they
     don't show up in DataHub during the next demo run.
  3. Clears drift-related structured properties from upstream dataset
     entities (churn_features, fraud_features, raw_* tables) that were
     written by a prior writeback, restoring them to seed-only state.

Safe to run repeatedly — every operation is idempotent.

Usage:
    source venv/bin/activate
    python scripts/reset_demo_state.py
"""

import hashlib
import os
import sys

# Add project root to path so we can import seed_lineage
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from datahub.emitter.mcp import MetadataChangeProposalWrapper
from datahub.emitter.rest_emitter import DatahubRestEmitter
from datahub.ingestion.graph.client import DataHubGraph, DataHubGraphConfig
from datahub.metadata.schema_classes import (
    StructuredPropertiesClass,
    StructuredPropertyValueAssignmentClass,
)
import datahub.emitter.mce_builder as builder


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GMS_URL = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
GMS_TOKEN = os.environ.get("DATAHUB_GMS_TOKEN")

# Incident report title prefix (must match writeback.py)
INCIDENT_TITLE_PREFIX = "Drift Incident Report"

# Model names
MODEL_NAMES = ["churn_model", "fraud_model", "pricing_model"]

# Dataset entities that may have drift-writeback structured properties
DATASET_ENTITIES = [
    builder.make_dataset_urn("custom", name, "PROD")
    for name in [
        "churn_features",
        "fraud_features",
        "pricing_features",
        "raw_transactions",
        "raw_customer_profile",
        "raw_support_tickets",
        "raw_payments",
        "raw_user_devices",
        "raw_ip_blacklist",
        "raw_product_catalog",
        "raw_competitor_prices",
        "raw_sales_history",
    ]
]

# Drift-writeback structured property URNs (written by agent/writeback.py)
DRIFT_PROPS = [
    "urn:li:structuredProperty:drift_psi_score",
    "urn:li:structuredProperty:drift_risk_level",
    "urn:li:structuredProperty:last_checked_timestamp",
]


def _doc_urn_for_model(model_name: str) -> str:
    """Reproduce the deterministic document URN from writeback.py."""
    title = f"{INCIDENT_TITLE_PREFIX} — {model_name}"
    doc_id = hashlib.md5(title.encode()).hexdigest()[:16]
    return f"urn:li:document:drift-sentinel-{doc_id}"


def step1_reseed():
    """Re-run seed_lineage.py to overwrite all model structured properties."""
    print("\n[1/3] Re-seeding DataHub entities (seed_lineage.py)...")
    # Import and call main() directly so it uses the same env vars
    seed_path = os.path.join(PROJECT_ROOT, "data", "seed_lineage.py")
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed_lineage", seed_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.main()
    print("  ✓ Seed complete — structured properties freshly overwritten.")


def step2_delete_incident_docs():
    """Delete previously-written incident report documents."""
    print("\n[2/3] Removing prior incident report documents...")
    from datahub.metadata.schema_classes import DocumentInfoClass

    graph = DataHubGraph(DataHubGraphConfig(server=GMS_URL, token=GMS_TOKEN or ""))

    for model_name in MODEL_NAMES:
        doc_urn = _doc_urn_for_model(model_name)
        try:
            existing = graph.get_aspect(doc_urn, DocumentInfoClass)
            if existing is not None:
                graph.delete_entity(doc_urn, hard=True)
                print(f"  ✓ Deleted incident document: {doc_urn}")
            else:
                print(f"  · No existing document for {model_name} — skipping.")
        except Exception as e:
            # Entity doesn't exist or other transient issue — safe to continue
            print(f"  · Could not delete document for {model_name}: {e}")


def step3_clear_drift_props():
    """
    Clear drift-related structured properties from dataset entities.
    
    We re-emit StructuredPropertiesClass without the drift properties.
    For datasets that have no other structured properties, this effectively
    clears the aspect. We read existing properties first and filter out
    the drift ones to preserve any non-drift properties.
    """
    print("\n[3/3] Clearing drift writeback properties from dataset entities...")
    graph = DataHubGraph(DataHubGraphConfig(server=GMS_URL, token=GMS_TOKEN or ""))
    emitter = DatahubRestEmitter(gms_server=GMS_URL, token=GMS_TOKEN)

    drift_prop_set = set(DRIFT_PROPS)

    for entity_urn in DATASET_ENTITIES:
        try:
            existing = graph.get_aspect(entity_urn, StructuredPropertiesClass)
            if existing is None:
                continue

            # Filter out drift properties, keep everything else
            kept = [
                p for p in existing.properties
                if p.propertyUrn not in drift_prop_set
            ]

            if len(kept) == len(existing.properties):
                # No drift properties were present — nothing to do
                continue

            entity_name = entity_urn.split(",")[1] if "," in entity_urn else entity_urn

            if kept:
                # Re-emit with only non-drift properties preserved
                mcp = MetadataChangeProposalWrapper(
                    entityUrn=entity_urn,
                    aspect=StructuredPropertiesClass(properties=kept),
                )
                emitter.emit(mcp)
                print(f"  ✓ Cleared drift properties from {entity_name} (kept {len(kept)} other props)")
            else:
                # All properties were drift-related — emit empty list
                mcp = MetadataChangeProposalWrapper(
                    entityUrn=entity_urn,
                    aspect=StructuredPropertiesClass(properties=[]),
                )
                emitter.emit(mcp)
                print(f"  ✓ Cleared all drift properties from {entity_name}")

        except Exception as e:
            entity_name = entity_urn.split(",")[1] if "," in entity_urn else entity_urn
            print(f"  · Could not clear props on {entity_name}: {e}")


def verify_no_duplicates():
    """Verify that both models have exactly one entry per structured property."""
    print("\n[✓] Verifying no duplicate structured properties...")
    graph = DataHubGraph(DataHubGraphConfig(server=GMS_URL, token=GMS_TOKEN or ""))

    all_ok = True
    for model_name in MODEL_NAMES:
        model_urn = builder.make_ml_model_urn("custom", model_name, "PROD")
        aspect = graph.get_aspect(model_urn, StructuredPropertiesClass)
        if aspect is None:
            print(f"  ✗ {model_name}: no StructuredPropertiesClass found!")
            all_ok = False
            continue

        # Count occurrences of each property URN
        counts: dict[str, int] = {}
        for prop in aspect.properties:
            counts[prop.propertyUrn] = counts.get(prop.propertyUrn, 0) + 1

        duplicated = {k: v for k, v in counts.items() if v > 1}
        if duplicated:
            print(f"  ✗ {model_name}: DUPLICATES FOUND:")
            for prop_urn, count in duplicated.items():
                prop_name = prop_urn.split(":")[-1]
                print(f"      {prop_name} appears {count} times")
            all_ok = False
        else:
            print(f"  ✓ {model_name}: {len(counts)} properties, all unique ✓")

    return all_ok


def main():
    print("=" * 60)
    print("  DataHub ML Drift Sentinel — Demo State Reset")
    print("=" * 60)

    step1_reseed()
    step2_delete_incident_docs()
    step3_clear_drift_props()

    ok = verify_no_duplicates()

    print("\n" + "=" * 60)
    if ok:
        print("  ✓ Demo state reset complete — ready for rehearsal.")
    else:
        print("  ⚠ Reset completed with warnings — check output above.")
    print("=" * 60 + "\n")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
