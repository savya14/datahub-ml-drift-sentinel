"""
Phase 1 checkpoint tests (see docs/BUILD_SPEC.md).

Run: pytest drift_engine/tests/ -v

These must pass on the actual generated synthetic data before moving to
Phase 2. If refund_rate doesn't come out HIGH or avg_resolution_time doesn't
stay LOW, tune the generator's means/stds in data/generate_synthetic_data.py
-- don't weaken these assertions to make them pass.
"""

import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from drift_engine.psi import psi_numeric, psi_categorical
from drift_engine.ks_test import ks_test

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


@pytest.fixture(scope="module")
def baseline_df():
    path = os.path.join(DATA_DIR, "baseline_features.csv")
    if not os.path.exists(path):
        pytest.skip("Run `python data/generate_synthetic_data.py` first")
    return pd.read_csv(path)


@pytest.fixture(scope="module")
def current_df():
    path = os.path.join(DATA_DIR, "current_features.csv")
    if not os.path.exists(path):
        pytest.skip("Run `python data/generate_synthetic_data.py` first")
    return pd.read_csv(path)


def test_refund_rate_flags_high_risk(baseline_df, current_df):
    result = psi_numeric(baseline_df["refund_rate"], current_df["refund_rate"], "refund_rate")
    assert result.psi >= 0.25, f"Expected HIGH risk (PSI >= 0.25), got PSI={result.psi:.3f}"
    assert result.risk_level == "HIGH"


def test_signup_channel_flags_risk(baseline_df, current_df):
    result = psi_categorical(baseline_df["signup_channel"], current_df["signup_channel"], "signup_channel")
    assert result.risk_level in ("MEDIUM", "HIGH"), f"Expected drift flagged, got {result.risk_level} (PSI={result.psi:.3f})"


def test_resolution_time_stays_low_risk(baseline_df, current_df):
    """Negative control -- proves the detector discriminates instead of alarming on everything."""
    result = psi_numeric(baseline_df["avg_resolution_time"], current_df["avg_resolution_time"], "avg_resolution_time")
    assert result.psi < 0.10, f"Expected LOW risk (PSI < 0.10), got PSI={result.psi:.3f} -- generator drifted this by accident"
    assert result.risk_level == "LOW"


def test_ks_agrees_with_psi_on_refund_rate(baseline_df, current_df):
    result = ks_test(baseline_df["refund_rate"], current_df["refund_rate"], "refund_rate")
    assert result.drift_detected, f"KS-test should also detect drift on refund_rate (p={result.p_value:.4f})"


def test_ks_agrees_with_psi_on_resolution_time(baseline_df, current_df):
    result = ks_test(baseline_df["avg_resolution_time"], current_df["avg_resolution_time"], "avg_resolution_time")
    assert not result.drift_detected, f"KS-test should NOT flag the negative control (p={result.p_value:.4f})"
