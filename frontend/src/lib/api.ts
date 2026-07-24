import type { ModelAudit, WriteBackState } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function listModels(): Promise<ModelAudit[]> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error("Failed to fetch models from backend");
  const data = await res.json();
  
  // Backend returns: [{ urn, name }]
  // Check localStorage to see if an audit has been run for each model.
  // If yes, query getModel() to get the real current risk level.
  const models = await Promise.all(data.map(async (m: any) => {
    const isAudited = localStorage.getItem(`audited_${m.urn}`) === 'true';
    if (isAudited) {
      try {
        const fullModel = await getModel(m.urn);
        if (fullModel) return fullModel;
      } catch (e) {
        console.error("Error fetching audited model", m.urn, e);
      }
    }

    return {
      modelId: m.urn,
      modelName: m.name,
      modelUrn: m.urn,
      overallRisk: "low",
      lastChecked: new Date().toISOString(),
      lineage: { nodes: [], edges: [] },
      featureDrifts: [],
      rootCause: "",
      writeBack: { status: "not_started" } as WriteBackState
    };
  }));
  return models;
}

export async function getModel(modelId: string): Promise<ModelAudit | undefined> {
  // Backend requires a POST to run the audit dynamically
  const res = await fetch(`${API_BASE}/audit/${encodeURIComponent(modelId)}`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to run model audit");
  
  const data = await res.json();
  
  // Backend ModelAuditReport mapping to Frontend ModelAudit
  const featureDrifts = data.feature_results.map((f: any) => ({
    featureName: f.feature_name,
    featureType: "numeric",
    psi: f.psi,
    ksStatistic: undefined,
    ksPValue: f.ks_pvalue,
    riskLevel: f.risk_level.toLowerCase(),
    sourceTable: f.source_entity_urn,
    // We map the backend distributions (which are float percentages, e.g. 0.25)
    // to integer arrays (e.g. 25) for the mini bar charts.
    baselineDistribution: f.baseline_distribution ? f.baseline_distribution.map((x: number) => Math.round(x * 100)) : [],
    currentDistribution: f.current_distribution ? f.current_distribution.map((x: number) => Math.round(x * 100)) : [],
    nullRate: f.null_rate,
    recommendation: f.recommendation
  }));

  // Mismatched: Backend doesn't return full graph nodes/edges, just a flat list of upstream entities
  const nodes = data.upstream_entities.map((urn: string, i: number) => ({
    id: urn,
    name: urn.split(",").length > 1 ? urn.split(",")[1] : urn,
    nodeType: "table"
  }));
  // Mock edges for simple linear display if needed
  const edges = nodes.slice(1).map((n: any, i: number) => ({
    source: nodes[i].id,
    target: n.id
  }));

  // Add the model node itself
  nodes.push({
    id: data.model_urn,
    name: data.model_urn.split(",").length > 1 ? data.model_urn.split(",")[1] : data.model_urn,
    nodeType: "model"
  });
  if (nodes.length > 1) {
    edges.push({
      source: nodes[nodes.length - 2].id,
      target: data.model_urn
    });
  }

  return {
    modelId: data.model_urn,
    modelName: data.model_urn.split(",").length > 1 ? data.model_urn.split(",")[1] : data.model_urn,
    modelUrn: data.model_urn,
    overallRisk: data.overall_risk.toLowerCase(),
    lastChecked: data.timestamp,
    lineage: { nodes, edges },
    featureDrifts,
    rootCause: `Primary drift detected in ${data.top_contributing_feature}.`,
    writeBack: { status: "not_started" }
  };
}

// Writeback API
export async function writebackModel(modelUrn: string, payload: any): Promise<void> {
  const res = await fetch(`${API_BASE}/writeback/${encodeURIComponent(modelUrn)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to writeback to DataHub");
}

export function getModelSync(modelId: string): ModelAudit | undefined {
  return undefined; // Deprecated, we don't have sync models anymore
}

export function listModelsSync(): ModelAudit[] {
  return []; // Deprecated
}
