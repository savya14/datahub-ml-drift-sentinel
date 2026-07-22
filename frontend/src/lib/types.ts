export type RiskLevel = "low" | "medium" | "high";

export interface LineageNode {
  id: string;
  name: string;
  nodeType: "table" | "feature_table" | "model";
  riskLevel?: RiskLevel;
}

export interface LineageEdge {
  source: string;
  target: string;
}

export interface FeatureDrift {
  featureName: string;
  featureType: "numeric" | "categorical";
  psi: number;
  ksStatistic?: number;
  ksPValue?: number;
  riskLevel: RiskLevel;
  sourceTable: string;
  baselineDistribution: number[];
  currentDistribution: number[];
  nullRate?: number;
  recommendation?: string;
}

export interface WriteBackState {
  status: "not_started" | "review" | "writing" | "written";
  structuredProperties?: Record<string, string | number>;
  incidentReportPreview?: string;
  entityUrl?: string;
}

export interface ModelAudit {
  modelId: string;
  modelName: string;
  modelUrn: string;
  overallRisk: RiskLevel;
  lastChecked: string;
  lineage: { nodes: LineageNode[]; edges: LineageEdge[] };
  featureDrifts: FeatureDrift[];
  rootCause: string;
  writeBack: WriteBackState;
}

export function riskFromPsi(psi: number): RiskLevel {
  if (psi < 0.1) return "low";
  if (psi <= 0.25) return "medium";
  return "high";
}
