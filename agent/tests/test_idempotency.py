import os
import sys
import time
import pytest
from datetime import datetime, timezone
import hashlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from agent.run_audit import run_audit
from agent.writeback import writeback
from datahub.ingestion.graph.client import DataHubGraph, DataHubGraphConfig
from datahub.metadata.schema_classes import StructuredPropertiesClass, DocumentInfoClass

def test_writeback_idempotency():
    # Ensure DataHub is reachable
    gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
    gms_token = os.environ.get("DATAHUB_GMS_TOKEN", "")
    graph = DataHubGraph(DataHubGraphConfig(server=gms_url, token=gms_token))

    # 1. Run audit and get the report
    report1 = run_audit("churn_model")
    report1.timestamp = datetime.now(timezone.utc).isoformat()
    
    # Run writeback once
    writeback(report1)
    
    # 2. Run writeback a second time with same data but different timestamp
    time.sleep(1) # Ensure timestamp differs
    report2 = run_audit("churn_model")
    report2.timestamp = datetime.now(timezone.utc).isoformat()
    
    writeback(report2)
    
    # 3. Assert document URN is identical both times (not a new document)
    # The URN is deterministically generated based on title, but let's confirm
    # we can fetch it exactly and it matches the expected content.
    model_name = "churn_model"
    title = f"Drift Incident Report — {model_name}"
    doc_id = hashlib.md5(title.encode()).hexdigest()[:16]
    doc_urn = f"urn:li:document:drift-sentinel-{doc_id}"
    
    doc_aspect = graph.get_aspect(doc_urn, DocumentInfoClass)
    assert doc_aspect is not None, "Document should exist"
    assert doc_aspect.title == title
    
    # 4. Asserts structured property values are updated in place, not duplicated
    churn_features_urn = "urn:li:dataset:(urn:li:dataPlatform:custom,churn_features,PROD)"
    struct_props = graph.get_aspect(churn_features_urn, StructuredPropertiesClass)
    
    assert struct_props is not None, "Structured properties should exist"
    
    prop_counts = {}
    last_timestamp = None
    
    for prop in struct_props.properties:
        urn = prop.propertyUrn
        prop_counts[urn] = prop_counts.get(urn, 0) + 1
        if urn == "urn:li:structuredProperty:last_checked_timestamp":
            last_timestamp = prop.values[0] if prop.values else None
            
    # Assert exactly one of each
    assert prop_counts.get("urn:li:structuredProperty:drift_psi_score") == 1
    assert prop_counts.get("urn:li:structuredProperty:drift_risk_level") == 1
    assert prop_counts.get("urn:li:structuredProperty:last_checked_timestamp") == 1
    
    # Assert timestamp matches the SECOND run's timestamp
    assert last_timestamp == report2.timestamp, f"Expected timestamp to update to {report2.timestamp}, but got {last_timestamp}"

    print(f"\nIDEMPOTENCY VERIFIED:")
    print(f"Document URN: {doc_urn}")
    print(f"Updated Timestamp on churn_features: {last_timestamp}")
    print(f"Total Property Occurrences: {prop_counts}")
