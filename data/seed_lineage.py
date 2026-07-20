import os
from datahub.emitter.mcp import MetadataChangeProposalWrapper
from datahub.emitter.rest_emitter import DatahubRestEmitter
from datahub.metadata.schema_classes import (
    DatasetPropertiesClass,
    UpstreamLineageClass,
    UpstreamClass,
    AuditStampClass,
    MLModelPropertiesClass,
    DataJobInputOutputClass,
    DataJobInfoClass,
    DataFlowInfoClass
)
import datahub.emitter.mce_builder as builder

def main():
    # GMS URL and Token
    gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
    gms_token = os.environ.get("DATAHUB_GMS_TOKEN")
    
    emitter = DatahubRestEmitter(gms_server=gms_url, token=gms_token)
    
    # Define URNs
    raw_transactions = builder.make_dataset_urn('custom', 'raw_transactions', 'PROD')
    raw_customer_profile = builder.make_dataset_urn('custom', 'raw_customer_profile', 'PROD')
    raw_support_tickets = builder.make_dataset_urn('custom', 'raw_support_tickets', 'PROD')
    churn_features = builder.make_dataset_urn('custom', 'churn_features', 'PROD')
    
    # Genuine mlModel URN
    churn_model = builder.make_ml_model_urn('custom', 'churn_model', 'PROD')
    
    # Define DataFlow and DataJob URNs for the training job
    training_flow = builder.make_data_flow_urn('custom', 'churn_training_pipeline', 'PROD')
    training_job = builder.make_data_job_urn('custom', 'churn_training_pipeline', 'train_model', 'PROD')
    
    # 1. Create Datasets with basic properties
    for urn in [raw_transactions, raw_customer_profile, raw_support_tickets, churn_features]:
        mcp = MetadataChangeProposalWrapper(
            entityUrn=urn,
            aspect=DatasetPropertiesClass(
                name=urn.split(",")[1]
            )
        )
        emitter.emit(mcp)
        
    # 2. Add Lineage: raw tables -> churn_features
    upstream_lineage_features = UpstreamLineageClass(
        upstreams=[
            UpstreamClass(
                dataset=raw_transactions,
                type="TRANSFORMED",
                auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")
            ),
            UpstreamClass(
                dataset=raw_customer_profile,
                type="TRANSFORMED",
                auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")
            ),
            UpstreamClass(
                dataset=raw_support_tickets,
                type="TRANSFORMED",
                auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")
            )
        ]
    )
    
    mcp_lineage_features = MetadataChangeProposalWrapper(
        entityUrn=churn_features,
        aspect=upstream_lineage_features
    )
    emitter.emit(mcp_lineage_features)
    
    # 3. Create Training Pipeline (DataFlow and DataJob)
    # DataFlow Info
    mcp_flow_info = MetadataChangeProposalWrapper(
        entityUrn=training_flow,
        aspect=DataFlowInfoClass(name="Churn Training Pipeline", customProperties={})
    )
    emitter.emit(mcp_flow_info)
    
    # DataJob Info
    mcp_job_info = MetadataChangeProposalWrapper(
        entityUrn=training_job,
        aspect=DataJobInfoClass(name="Train Churn Model", type="COMMAND", customProperties={})
    )
    emitter.emit(mcp_job_info)
    
    # DataJob Input (churn_features)
    mcp_job_io = MetadataChangeProposalWrapper(
        entityUrn=training_job,
        aspect=DataJobInputOutputClass(
            inputDatasets=[churn_features],
            outputDatasets=[] # We don't output a dataset, we output an ML model (linked below)
        )
    )
    emitter.emit(mcp_job_io)
    
    # 4. Create ML Model and link to Training Job
    mcp_model = MetadataChangeProposalWrapper(
        entityUrn=churn_model,
        aspect=MLModelPropertiesClass(
            date=0,
            trainingJobs=[training_job],
            description="ML Model for predicting customer churn"
        )
    )
    emitter.emit(mcp_model)
    
    print("Successfully seeded lineage graph with MLModel and DataJob!")

if __name__ == "__main__":
    main()
