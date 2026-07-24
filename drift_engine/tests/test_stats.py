import numpy as np
import pandas as pd
from drift_engine.psi import psi_numeric, psi_categorical
from drift_engine.ks_test import ks_test

def test_psi_numeric_no_drift():
    # Identical distributions should yield PSI near 0
    np.random.seed(42)
    baseline = pd.Series(np.random.normal(0, 1, 1000))
    current = pd.Series(np.random.normal(0, 1, 1000))
    res = psi_numeric(baseline, current, "test_feat")
    assert res.psi < 0.1
    assert res.risk_level == "LOW"

def test_psi_numeric_clear_drift():
    # Shifted distributions should yield PSI above high-risk threshold
    np.random.seed(42)
    baseline = pd.Series(np.random.normal(0, 1, 1000))
    current = pd.Series(np.random.normal(5, 1, 1000))
    res = psi_numeric(baseline, current, "test_feat")
    assert res.psi >= 0.25
    assert res.risk_level == "HIGH"

def test_ks_test_no_drift():
    np.random.seed(42)
    baseline = pd.Series(np.random.normal(0, 1, 1000))
    current = pd.Series(np.random.normal(0, 1, 1000))
    res = ks_test(baseline, current, "test_feat")
    assert res.p_value > 0.05
    assert not res.drift_detected

def test_ks_test_clear_drift():
    np.random.seed(42)
    baseline = pd.Series(np.random.normal(0, 1, 1000))
    current = pd.Series(np.random.normal(5, 1, 1000))
    res = ks_test(baseline, current, "test_feat")
    assert res.p_value < 0.05
    assert res.drift_detected

def test_psi_categorical_with_nulls():
    # Nulls in categorical features shouldn't crash the calculation
    baseline = pd.Series(["A", "B", "A", None, "C", "A"])
    current = pd.Series(["A", "B", "B", pd.NA, "C", None])
    # Converting NA to string 'nan' inside the function typically handles this,
    # or dropna depending on implementation. Main check: it doesn't crash.
    res = psi_categorical(baseline, current, "cat_feat")
    assert res.psi is not None
    assert isinstance(res.psi, float)
