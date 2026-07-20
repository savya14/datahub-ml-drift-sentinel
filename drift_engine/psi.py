"""
Population Stability Index (PSI) drift detection.

Works for both numeric (binned into deciles using baseline's bin edges)
and categorical (bins = categories) features.

Thresholds (standard industry convention):
    PSI < 0.10          -> LOW risk (no significant shift)
    0.10 <= PSI < 0.25   -> MEDIUM risk (moderate shift, worth watching)
    PSI >= 0.25          -> HIGH risk (significant shift)
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

LOW_THRESHOLD = 0.10
HIGH_THRESHOLD = 0.25


@dataclass
class PSIResult:
    feature_name: str
    psi: float
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH"


def _classify(psi_value: float) -> str:
    if psi_value < LOW_THRESHOLD:
        return "LOW"
    elif psi_value < HIGH_THRESHOLD:
        return "MEDIUM"
    else:
        return "HIGH"


def _psi_from_percentages(baseline_pct: np.ndarray, current_pct: np.ndarray, epsilon: float = 1e-4) -> float:
    """Core PSI formula. Clips to avoid log(0) / div-by-zero on empty bins."""
    baseline_pct = np.clip(baseline_pct, epsilon, None)
    current_pct = np.clip(current_pct, epsilon, None)
    return float(np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct)))


def psi_numeric(baseline: pd.Series, current: pd.Series, feature_name: str, n_bins: int = 10) -> PSIResult:
    """
    PSI for a continuous numeric feature.
    Bin edges are computed from the BASELINE distribution (deciles) and
    reused for the current distribution -- this is important: comparing
    against a shared reference, not each sample's own quantiles.
    """
    bin_edges = np.quantile(baseline, np.linspace(0, 1, n_bins + 1))
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf
    bin_edges = np.unique(bin_edges)  # guard against degenerate/duplicate edges

    baseline_counts, _ = np.histogram(baseline, bins=bin_edges)
    current_counts, _ = np.histogram(current, bins=bin_edges)

    baseline_pct = baseline_counts / max(baseline_counts.sum(), 1)
    current_pct = current_counts / max(current_counts.sum(), 1)

    psi_value = _psi_from_percentages(baseline_pct, current_pct)
    return PSIResult(feature_name=feature_name, psi=psi_value, risk_level=_classify(psi_value))


def psi_categorical(baseline: pd.Series, current: pd.Series, feature_name: str) -> PSIResult:
    """PSI for a categorical feature. Bins = union of categories seen in either sample."""
    categories = sorted(set(baseline.unique()) | set(current.unique()))

    baseline_counts = baseline.value_counts().reindex(categories, fill_value=0)
    current_counts = current.value_counts().reindex(categories, fill_value=0)

    baseline_pct = (baseline_counts / max(baseline_counts.sum(), 1)).to_numpy()
    current_pct = (current_counts / max(current_counts.sum(), 1)).to_numpy()

    psi_value = _psi_from_percentages(baseline_pct, current_pct)
    return PSIResult(feature_name=feature_name, psi=psi_value, risk_level=_classify(psi_value))
