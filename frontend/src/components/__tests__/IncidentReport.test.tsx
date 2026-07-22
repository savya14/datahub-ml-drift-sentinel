import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IncidentReport } from '../IncidentReport'
import type { ModelAudit } from '@/lib/types'

describe('IncidentReport', () => {
  it('renders gracefully with null ksPValue in feature drifts', () => {
    const mockModel: ModelAudit = {
      modelId: 'test_model',
      modelName: 'Test Model',
      modelUrn: 'urn:li:mlModel:test',
      overallRisk: 'high',
      lastChecked: '2023-01-01T00:00:00Z',
      rootCause: 'test',
      writeBack: { status: 'not_started' },
      lineage: { nodes: [], edges: [] },
      featureDrifts: [
        {
          featureName: 'cat_feature',
          featureType: 'categorical',
          psi: 0.3,
          ksPValue: undefined, // Explicit null test
          nullRate: undefined, // Explicit null test
          riskLevel: 'high',
          sourceTable: 'raw_table',
          baselineDistribution: [1],
          currentDistribution: [1]
        }
      ]
    }

    render(<IncidentReport model={mockModel} />)
    
    // Check that it didn't crash and rendered the feature
    expect(screen.getAllByText(/cat_feature/i).length).toBeGreaterThan(0)
  })
})
