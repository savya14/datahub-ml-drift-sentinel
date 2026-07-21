import os
import sys
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.run_audit import run_audit
from agent.writeback import writeback
from agent.run_audit import ModelAuditReport as AgentModelAuditReport
from agent.run_audit import FeatureRiskResult as AgentFeatureRiskResult

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DataHub ML Drift Sentinel API")

# Allow CORS for Next.js frontend (local dev + deployed Vercel origin)
# Set ALLOWED_ORIGINS as a comma-separated list in production,
# e.g. "https://datahub-ml-drift-sentinel.vercel.app,http://localhost:3000"
_allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "*"
)
cors_origins = (
    ["*"] if _allowed_origins == "*"
    else [o.strip() for o in _allowed_origins.split(",")]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],

)

# ---------------------------------------------------------------------------
# Pydantic models for API
# ---------------------------------------------------------------------------

class FeatureRiskResult(BaseModel):
    feature_name: str
    source_entity_urn: str
    psi: float
    ks_pvalue: Optional[float] = None
    risk_level: str

class ModelAuditReport(BaseModel):
    model_urn: str
    timestamp: str
    feature_results: List[FeatureRiskResult]
    overall_risk: str
    top_contributing_feature: str
    upstream_entities: List[str] = []

class ModelOption(BaseModel):
    urn: str
    name: str

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/models", response_model=List[ModelOption])
def get_models():
    """Fetch all ML Models from DataHub."""
    try:
        from datahub.ingestion.graph.client import DataHubGraph, DataHubGraphConfig
        gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
        gms_token = os.environ.get("DATAHUB_GMS_TOKEN", "")
        graph = DataHubGraph(DataHubGraphConfig(server=gms_url, token=gms_token))
        
        # We can search for all mlModels
        results = graph.execute_graphql('''
            query search($input: SearchInput!) {
              search(input: $input) {
                searchResults {
                  entity {
                    urn
                    ... on MLModel {
                      properties {
                        name
                      }
                    }
                  }
                }
              }
            }
        ''', {'input': {'type': 'MLMODEL', 'query': '*', 'start': 0, 'count': 50}})
        
        models = []
        search_results = results.get("search", {}).get("searchResults", [])
        for res in search_results:
            entity = res.get("entity", {})
            urn = entity.get("urn")
            props = entity.get("properties") or {}
            
            # fallback to extracting name from URN if properties missing
            name = props.get("name")
            if not name and urn:
                parts = urn.split(",")
                if len(parts) >= 2:
                    name = parts[1]
                else:
                    name = urn
            
            if urn and name:
                models.append(ModelOption(urn=urn, name=name))
                
        return models
        
    except Exception as e:
        logger.error(f"Error fetching models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/audit/{model_urn:path}", response_model=ModelAuditReport)
def run_audit_endpoint(model_urn: str):
    """Run drift audit for a specific model."""
    try:
        logger.info(f"Running audit for {model_urn}")
        
        # extract model_name from URN
        # e.g. urn:li:mlModel:(urn:li:dataPlatform:custom,churn_model,PROD)
        parts = model_urn.split(",")
        if len(parts) < 2:
            raise ValueError(f"Invalid model URN format: {model_urn}")
            
        model_name = parts[1]
        
        # run the actual agent
        agent_report = run_audit(model_name)
        
        # The agent returns a dataclass. We can return it directly, FastAPI handles dataclasses natively,
        # but to be totally safe we map it to our Pydantic model.
        return agent_report
        
    except Exception as e:
        logger.error(f"Error running audit: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/writeback/{model_urn:path}")
def writeback_endpoint(model_urn: str, report: ModelAuditReport):
    """Write audit results back to DataHub."""
    try:
        logger.info(f"Writing back results for {model_urn}")
        
        # map Pydantic model back to Agent dataclasses
        agent_report = AgentModelAuditReport(
            model_urn=report.model_urn,
            timestamp=report.timestamp,
            feature_results=[
                AgentFeatureRiskResult(
                    feature_name=f.feature_name,
                    source_entity_urn=f.source_entity_urn,
                    psi=f.psi,
                    ks_pvalue=f.ks_pvalue,
                    risk_level=f.risk_level
                ) for f in report.feature_results
            ],
            overall_risk=report.overall_risk,
            top_contributing_feature=report.top_contributing_feature,
            upstream_entities=report.upstream_entities
        )
        
        # execute writeback
        writeback(agent_report)
        return {"status": "success", "message": f"Write-back complete for {model_urn}"}
        
    except Exception as e:
        logger.error(f"Error in writeback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
