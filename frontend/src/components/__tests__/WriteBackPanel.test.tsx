import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WriteBackPanel } from "../WriteBackPanel";
import type { ModelAudit } from "@/lib/types";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  writebackModel: vi.fn().mockResolvedValue(undefined)
}));

const mockModel: ModelAudit = {
  modelId: "churn_model",
  modelName: "churn_model",
  modelUrn: "urn:li:mlModel:(urn:li:dataPlatform:custom,churn_model,PROD)",
  overallRisk: "high",
  lastChecked: "2026-07-22T00:00:00.000Z",
  featureDrifts: [
    {
      featureName: "refund_rate",
      featureType: "numeric",
      psi: 4.5068,
      ksPValue: 0.0,
      riskLevel: "high",
      sourceTable: "urn:li:dataset:(urn:li:dataPlatform:custom,churn_features,PROD)",
      baselineDistribution: [0.1, 0.1],
      currentDistribution: [0.0, 1.0],
      recommendation: "High drift detected"
    }
  ],
  lineage: {
    nodes: [
      { id: "churn_model", label: "churn_model", nodeType: "model" },
      { id: "churn_features", label: "churn_features", nodeType: "dataset" }
    ],
    edges: []
  },
  writeBack: { status: "not_started" }
};

describe("WriteBackPanel Two-Step Flow", () => {
  it("renders initial state and enters review mode on click without calling writeback API", () => {
    render(<WriteBackPanel model={mockModel} />);
    
    // Initial state
    const writeBtn = screen.getByRole("button", { name: /Write to DataHub/i });
    expect(writeBtn).toBeDefined();

    // Click "Write to DataHub" -> enters review mode
    fireEvent.click(writeBtn);

    // Review panel should appear
    expect(screen.getByText(/Review DataHub Governance Evidence Payload/i)).toBeDefined();
    expect(screen.getByText(/Confirm & Write to DataHub/i)).toBeDefined();
    expect(screen.getByText("Cancel")).toBeDefined();

    // API should NOT have been called yet
    expect(api.writebackModel).not.toHaveBeenCalled();
  });

  it("resets state when Cancel is clicked without calling API", () => {
    render(<WriteBackPanel model={mockModel} />);
    
    // Enter review
    fireEvent.click(screen.getByRole("button", { name: /Write to DataHub/i }));
    expect(screen.getByText(/Review DataHub Governance Evidence Payload/i)).toBeDefined();

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));

    // Back to initial state
    expect(screen.queryByText(/Review DataHub Governance Evidence Payload/i)).toBeNull();
    expect(api.writebackModel).not.toHaveBeenCalled();
  });

  it("calls writebackModel API when Confirm & Write to DataHub is clicked", async () => {
    render(<WriteBackPanel model={mockModel} />);
    
    // Enter review
    fireEvent.click(screen.getByRole("button", { name: /Write to DataHub/i }));

    // Click Confirm
    const confirmBtn = screen.getByRole("button", { name: /Confirm & Write to DataHub/i });
    fireEvent.click(confirmBtn);

    // API should be called with model URN and payload
    expect(api.writebackModel).toHaveBeenCalledWith(
      mockModel.modelUrn,
      expect.objectContaining({
        model_urn: mockModel.modelUrn,
        overall_risk: "HIGH",
        top_contributing_feature: "refund_rate"
      })
    );
  });
});
