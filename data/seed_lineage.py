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
    DataFlowInfoClass,
    StructuredPropertyDefinitionClass,
    StructuredPropertiesClass,
    StructuredPropertyValueAssignmentClass
)
import datahub.emitter.mce_builder as builder

def main():
    # GMS URL and Token
    gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")
    gms_token = os.environ.get("DATAHUB_GMS_TOKEN")
    
    emitter = DatahubRestEmitter(gms_server=gms_url, token=gms_token)
    
    # Define URNs
    # Define URNs for churn_model
    raw_transactions = builder.make_dataset_urn('custom', 'raw_transactions', 'PROD')
    raw_customer_profile = builder.make_dataset_urn('custom', 'raw_customer_profile', 'PROD')
    raw_support_tickets = builder.make_dataset_urn('custom', 'raw_support_tickets', 'PROD')
    churn_features = builder.make_dataset_urn('custom', 'churn_features', 'PROD')
    churn_model = builder.make_ml_model_urn('custom', 'churn_model', 'PROD')
    training_flow = builder.make_data_flow_urn('custom', 'churn_training_pipeline', 'PROD')
    training_job = builder.make_data_job_urn('custom', 'churn_training_pipeline', 'train_model', 'PROD')

    # Define URNs for fraud_model
    raw_payments = builder.make_dataset_urn('custom', 'raw_payments', 'PROD')
    raw_user_devices = builder.make_dataset_urn('custom', 'raw_user_devices', 'PROD')
    raw_ip_blacklist = builder.make_dataset_urn('custom', 'raw_ip_blacklist', 'PROD')
    fraud_features = builder.make_dataset_urn('custom', 'fraud_features', 'PROD')
    fraud_model = builder.make_ml_model_urn('custom', 'fraud_model', 'PROD')
    fraud_training_flow = builder.make_data_flow_urn('custom', 'fraud_training_pipeline', 'PROD')
    fraud_training_job = builder.make_data_job_urn('custom', 'fraud_training_pipeline', 'train_fraud_model', 'PROD')
    
    # 1. Create Datasets with basic properties
    all_datasets = [
        raw_transactions, raw_customer_profile, raw_support_tickets, churn_features,
        raw_payments, raw_user_devices, raw_ip_blacklist, fraud_features
    ]
    for urn in all_datasets:
        mcp = MetadataChangeProposalWrapper(
            entityUrn=urn,
            aspect=DatasetPropertiesClass(
                name=urn.split(",")[1]
            )
        )
        emitter.emit(mcp)
        
    # 1b. Define Structured Properties for ML Model
    prop_defs = [
        ("ml_model_owner", "Owner", "Owner of the ML Model", "urn:li:dataType:datahub.string"),
        ("ml_model_version", "Version", "Version of the ML Model", "urn:li:dataType:datahub.string"),
        ("ml_model_training_date", "Training Date", "Training Date", "urn:li:dataType:datahub.string"),
        ("ml_model_deployment_env", "Deployment Environment", "Deployment Environment", "urn:li:dataType:datahub.string"),
        ("ml_model_framework", "Framework", "ML Framework", "urn:li:dataType:datahub.string"),
        ("ml_model_baseline_accuracy", "Baseline Accuracy", "Baseline Accuracy", "urn:li:dataType:datahub.number"),
        ("ml_model_business_domain", "Business Domain", "Business Domain", "urn:li:dataType:datahub.string"),
        ("ml_model_predictions_per_day", "Predictions per day", "Predictions per day", "urn:li:dataType:datahub.number"),
        ("ml_model_status", "Model Status", "Health status of the model", "urn:li:dataType:datahub.string"),
    ]

    for qname, dname, desc, vtype in prop_defs:
        emitter.emit(MetadataChangeProposalWrapper(
            entityUrn=f"urn:li:structuredProperty:{qname}",
            aspect=StructuredPropertyDefinitionClass(
                qualifiedName=qname,
                displayName=dname,
                description=desc,
                valueType=vtype,
                entityTypes=["urn:li:entityType:datahub.mlModel"],
                cardinality="SINGLE"
            )
        ))

        
    # 2. Add Lineage: raw tables -> feature tables
    # churn_features lineage
    upstream_lineage_churn = UpstreamLineageClass(
        upstreams=[
            UpstreamClass(dataset=raw_transactions, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")),
            UpstreamClass(dataset=raw_customer_profile, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")),
            UpstreamClass(dataset=raw_support_tickets, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub"))
        ]
    )
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=churn_features, aspect=upstream_lineage_churn))

    # fraud_features lineage
    upstream_lineage_fraud = UpstreamLineageClass(
        upstreams=[
            UpstreamClass(dataset=raw_payments, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")),
            UpstreamClass(dataset=raw_user_devices, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub")),
            UpstreamClass(dataset=raw_ip_blacklist, type="TRANSFORMED", auditStamp=AuditStampClass(time=0, actor="urn:li:corpuser:datahub"))
        ]
    )
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=fraud_features, aspect=upstream_lineage_fraud))
    
    # 3. Create Training Pipelines (DataFlow and DataJob)
    # Churn pipeline
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=training_flow, aspect=DataFlowInfoClass(name="Churn Training Pipeline", customProperties={})))
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=training_job, aspect=DataJobInfoClass(name="Train Churn Model", type="COMMAND", customProperties={})))
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=training_job, aspect=DataJobInputOutputClass(inputDatasets=[churn_features], outputDatasets=[])))
    
    # Fraud pipeline
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=fraud_training_flow, aspect=DataFlowInfoClass(name="Fraud Training Pipeline", customProperties={})))
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=fraud_training_job, aspect=DataJobInfoClass(name="Train Fraud Model", type="COMMAND", customProperties={})))
    emitter.emit(MetadataChangeProposalWrapper(entityUrn=fraud_training_job, aspect=DataJobInputOutputClass(inputDatasets=[fraud_features], outputDatasets=[])))

    # 4. Create ML Models and link to Training Jobs
    # Churn model
    emitter.emit(MetadataChangeProposalWrapper(
        entityUrn=churn_model,
        aspect=MLModelPropertiesClass(date=0, trainingJobs=[training_job], description="ML Model for predicting customer churn", customProperties={})
    ))
    emitter.emit(MetadataChangeProposalWrapper(
        entityUrn=churn_model,
        aspect=StructuredPropertiesClass(
            properties=[
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_owner", values=["ml-platform-team"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_version", values=["v2.3.1"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_training_date", values=["2023-10-25"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_deployment_env", values=["production-us-east-1"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_framework", values=["scikit-learn 1.4"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_baseline_accuracy", values=["0.85"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_business_domain", values=["Customer Retention"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_predictions_per_day", values=["150000"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_status", values=["Healthy"]),
            ]
        )
    ))

    # Fraud model
    emitter.emit(MetadataChangeProposalWrapper(
        entityUrn=fraud_model,
        aspect=MLModelPropertiesClass(date=0, trainingJobs=[fraud_training_job], description="ML Model for real-time transaction fraud detection", customProperties={})
    ))
    emitter.emit(MetadataChangeProposalWrapper(
        entityUrn=fraud_model,
        aspect=StructuredPropertiesClass(
            properties=[
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_owner", values=["risk-analytics-team"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_version", values=["v1.1.0"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_training_date", values=["2024-02-15"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_deployment_env", values=["production-eu-west-1"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_framework", values=["xgboost 2.0"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_baseline_accuracy", values=["0.96"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_business_domain", values=["Fraud Prevention"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_predictions_per_day", values=["500000"]),
                StructuredPropertyValueAssignmentClass(propertyUrn="urn:li:structuredProperty:ml_model_status", values=["Healthy"]),
            ]
        )
    ))
    
    print("Successfully seeded lineage graph with churn_model and fraud_model!")

if __name__ == "__main__":
    main()

