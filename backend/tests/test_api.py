from fastapi.testclient import TestClient
from backend.main import app, ModelAuditReport

client = TestClient(app)

def test_audit_endpoint_schema():
    # We will POST to the audit endpoint and ensure the schema matches
    response = client.post("/audit/urn:li:mlModel:(urn:li:dataPlatform:custom,churn_model,PROD)")
    assert response.status_code == 200
    
    data = response.json()
    
    # Validate the response strictly against the Pydantic schema
    report = ModelAuditReport(**data)
    
    # Verify core fields
    assert report.model_urn == "urn:li:mlModel:(urn:li:dataPlatform:custom,churn_model,PROD)"
    assert report.timestamp is not None
    assert report.overall_risk in ["LOW", "MEDIUM", "HIGH"]
    
    # Check feature results
    assert isinstance(report.feature_results, list)
    assert len(report.feature_results) > 0
    
    # Ensure new fields (null_rate, recommendation) are present and validated
    for f in report.feature_results:
        assert hasattr(f, "null_rate")
        assert hasattr(f, "recommendation")
