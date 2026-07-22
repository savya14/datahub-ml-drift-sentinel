import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DriftTable } from '../DriftTable'
import type { FeatureDrift } from '@/lib/types'

describe('DriftTable', () => {
  it('renders gracefully when ksPValue and nullRate are null or undefined', () => {
    const mockFeatures: FeatureDrift[] = [
      {
        featureName: 'null_ks_feature',
        featureType: 'categorical',
        psi: 0.15,
        ksPValue: undefined,
        nullRate: undefined,
        riskLevel: 'medium',
        sourceTable: 'raw_users',
        baselineDistribution: [1, 2, 3],
        currentDistribution: [1, 2, 3]
      }
    ]
    
    // Should not crash when rendering
    render(<DriftTable features={mockFeatures} />)
    
    // Should render "—" or "N/A" for the null values
    // DriftTable uses "—" for null ksPValue and nullRate
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('null_ks_feature')).toBeInTheDocument()
  })
})
