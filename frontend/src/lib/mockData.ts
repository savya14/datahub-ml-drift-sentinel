import type { ModelAudit } from "./types";

const now = new Date();
const iso = (minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString();

const stableBaseline = [12, 22, 30, 22, 14];
const stableCurrent = [13, 21, 29, 23, 14];

export const mockModels: ModelAudit[] = [
  {
    modelId: "churn_model",
    modelName: "churn_model",
    modelUrn: "urn:li:mlModel:(urn:li:dataPlatform:mlflow,churn_model,PROD)",
    overallRisk: "high",
    lastChecked: iso(7),
    lineage: {
      nodes: [
        { id: "urn:li:dataset:raw_transactions", name: "raw_transactions", nodeType: "table", riskLevel: "low" },
        { id: "urn:li:dataset:raw_customer_profile", name: "raw_customer_profile", nodeType: "table", riskLevel: "high" },
        { id: "urn:li:dataset:raw_support_tickets", name: "raw_support_tickets", nodeType: "table", riskLevel: "medium" },
        { id: "urn:li:dataset:churn_features", name: "churn_features", nodeType: "feature_table", riskLevel: "high" },
        { id: "urn:li:mlModel:churn_model", name: "churn_model", nodeType: "model", riskLevel: "high" },
      ],
      edges: [
        { source: "urn:li:dataset:raw_transactions", target: "urn:li:dataset:churn_features" },
        { source: "urn:li:dataset:raw_customer_profile", target: "urn:li:dataset:churn_features" },
        { source: "urn:li:dataset:raw_support_tickets", target: "urn:li:dataset:churn_features" },
        { source: "urn:li:dataset:churn_features", target: "urn:li:mlModel:churn_model" },
      ],
    },
    featureDrifts: [
      {
        featureName: "customer_tenure_days",
        featureType: "numeric",
        psi: 0.31,
        ksStatistic: 0.24,
        ksPValue: 0.002,
        riskLevel: "high",
        sourceTable: "raw_customer_profile",
        baselineDistribution: [8, 18, 32, 26, 16],
        currentDistribution: [22, 28, 22, 16, 12],
      },
      {
        featureName: "support_ticket_category",
        featureType: "categorical",
        psi: 0.18,
        riskLevel: "medium",
        sourceTable: "raw_support_tickets",
        baselineDistribution: [40, 30, 20, 10],
        currentDistribution: [28, 34, 22, 16],
      },
      { featureName: "avg_transaction_amount", featureType: "numeric", psi: 0.04, ksStatistic: 0.05, ksPValue: 0.41, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "transaction_count_30d", featureType: "numeric", psi: 0.03, ksStatistic: 0.04, ksPValue: 0.55, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "days_since_signup", featureType: "numeric", psi: 0.02, ksStatistic: 0.03, ksPValue: 0.72, riskLevel: "low", sourceTable: "raw_customer_profile", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "is_premium_tier", featureType: "categorical", psi: 0.01, riskLevel: "low", sourceTable: "raw_customer_profile", baselineDistribution: [70, 30], currentDistribution: [71, 29] },
      { featureName: "ticket_count_30d", featureType: "numeric", psi: 0.04, ksStatistic: 0.05, ksPValue: 0.38, riskLevel: "low", sourceTable: "raw_support_tickets", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
    ],
    rootCause:
      "customer_tenure_days from raw_customer_profile is the dominant drift signal (PSI 0.31). support_ticket_category from raw_support_tickets is a secondary, lower-severity contributor.",
    writeBack: {
      status: "written",
      structuredProperties: {
        drift_psi_score: 0.31,
        drift_risk_level: "high",
        last_checked_timestamp: iso(7),
      },
      incidentReportPreview:
        "customer_tenure_days shows PSI of 0.31 (high risk), sourced from raw_customer_profile. Distribution has shifted toward shorter-tenure customers since the baseline window.",
      entityUrl: `${import.meta.env.VITE_DATAHUB_URL || "http://localhost:9002"}/dataset/urn:li:mlModel:churn_model`,
    },
  },
  {
    modelId: "ltv_model",
    modelName: "ltv_model",
    modelUrn: "urn:li:mlModel:(urn:li:dataPlatform:mlflow,ltv_model,PROD)",
    overallRisk: "low",
    lastChecked: iso(19),
    lineage: {
      nodes: [
        { id: "urn:li:dataset:raw_transactions", name: "raw_transactions", nodeType: "table", riskLevel: "low" },
        { id: "urn:li:dataset:raw_billing_events", name: "raw_billing_events", nodeType: "table", riskLevel: "low" },
        { id: "urn:li:dataset:ltv_features", name: "ltv_features", nodeType: "feature_table", riskLevel: "low" },
        { id: "urn:li:mlModel:ltv_model", name: "ltv_model", nodeType: "model", riskLevel: "low" },
      ],
      edges: [
        { source: "urn:li:dataset:raw_transactions", target: "urn:li:dataset:ltv_features" },
        { source: "urn:li:dataset:raw_billing_events", target: "urn:li:dataset:ltv_features" },
        { source: "urn:li:dataset:ltv_features", target: "urn:li:mlModel:ltv_model" },
      ],
    },
    featureDrifts: [
      { featureName: "monthly_revenue_avg", featureType: "numeric", psi: 0.02, ksStatistic: 0.03, ksPValue: 0.68, riskLevel: "low", sourceTable: "raw_billing_events", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "billing_cycle_length", featureType: "numeric", psi: 0.03, ksStatistic: 0.04, ksPValue: 0.51, riskLevel: "low", sourceTable: "raw_billing_events", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "transaction_count_90d", featureType: "numeric", psi: 0.04, ksStatistic: 0.04, ksPValue: 0.44, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "avg_order_value", featureType: "numeric", psi: 0.03, ksStatistic: 0.03, ksPValue: 0.60, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "refund_ratio", featureType: "numeric", psi: 0.02, ksStatistic: 0.03, ksPValue: 0.71, riskLevel: "low", sourceTable: "raw_billing_events", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
    ],
    rootCause: "No drifted features detected as of the last audit.",
    writeBack: {
      status: "written",
      structuredProperties: {
        drift_psi_score: 0.03,
        drift_risk_level: "low",
        last_checked_timestamp: iso(19),
      },
      incidentReportPreview:
        "No drifted features detected across 5 monitored inputs. No action needed.",
      entityUrl: `${import.meta.env.VITE_DATAHUB_URL || "http://localhost:9002"}/dataset/urn:li:mlModel:ltv_model`,
    },
  },
  {
    modelId: "fraud_score_model",
    modelName: "fraud_score_model",
    modelUrn: "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fraud_score_model,PROD)",
    overallRisk: "medium",
    lastChecked: iso(3),
    lineage: {
      nodes: [
        { id: "urn:li:dataset:raw_transactions", name: "raw_transactions", nodeType: "table", riskLevel: "low" },
        { id: "urn:li:dataset:raw_device_signals", name: "raw_device_signals", nodeType: "table", riskLevel: "medium" },
        { id: "urn:li:dataset:fraud_features", name: "fraud_features", nodeType: "feature_table", riskLevel: "medium" },
        { id: "urn:li:mlModel:fraud_score_model", name: "fraud_score_model", nodeType: "model", riskLevel: "medium" },
      ],
      edges: [
        { source: "urn:li:dataset:raw_transactions", target: "urn:li:dataset:fraud_features" },
        { source: "urn:li:dataset:raw_device_signals", target: "urn:li:dataset:fraud_features" },
        { source: "urn:li:dataset:fraud_features", target: "urn:li:mlModel:fraud_score_model" },
      ],
    },
    featureDrifts: [
      {
        featureName: "device_fingerprint_entropy",
        featureType: "numeric",
        psi: 0.14,
        ksStatistic: 0.12,
        ksPValue: 0.03,
        riskLevel: "medium",
        sourceTable: "raw_device_signals",
        baselineDistribution: [10, 22, 34, 22, 12],
        currentDistribution: [16, 26, 28, 18, 12],
      },
      { featureName: "transaction_velocity_1h", featureType: "numeric", psi: 0.03, ksStatistic: 0.04, ksPValue: 0.48, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "amount_zscore", featureType: "numeric", psi: 0.04, ksStatistic: 0.04, ksPValue: 0.39, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: stableBaseline, currentDistribution: stableCurrent },
      { featureName: "is_new_device", featureType: "categorical", psi: 0.02, riskLevel: "low", sourceTable: "raw_device_signals", baselineDistribution: [85, 15], currentDistribution: [84, 16] },
      { featureName: "geo_country_code", featureType: "categorical", psi: 0.03, riskLevel: "low", sourceTable: "raw_device_signals", baselineDistribution: [60, 25, 10, 5], currentDistribution: [58, 27, 10, 5] },
      { featureName: "merchant_category", featureType: "categorical", psi: 0.04, riskLevel: "low", sourceTable: "raw_transactions", baselineDistribution: [40, 30, 20, 10], currentDistribution: [39, 31, 20, 10] },
    ],
    rootCause:
      "device_fingerprint_entropy from raw_device_signals is drifting (PSI 0.14). Transaction-side features remain stable.",
    writeBack: {
      status: "written",
      structuredProperties: {
        drift_psi_score: 0.14,
        drift_risk_level: "medium",
        last_checked_timestamp: iso(3),
      },
      incidentReportPreview:
        "device_fingerprint_entropy shows PSI of 0.14 (medium risk), sourced from raw_device_signals. Distribution has shifted toward lower-entropy fingerprints.",
      entityUrl: `${import.meta.env.VITE_DATAHUB_URL || "http://localhost:9002"}/dataset/urn:li:mlModel:fraud_score_model`,
    },
  },
];
