import pytest
from drift_engine.recommendations import get_recommendation

def test_recommendation_no_action():
    # Low PSI, non-significant KS p-value, low null rate
    rec = get_recommendation(psi=0.03, ks_pvalue=0.45, null_rate=0.01)
    assert rec == "No action required"

def test_recommendation_moderate_drift():
    # PSI in moderate range (0.1 <= PSI <= 0.25)
    rec = get_recommendation(psi=0.15, ks_pvalue=0.20, null_rate=0.01)
    assert "Moderate drift — monitor closely" in rec
    assert "High drift" not in rec

def test_recommendation_high_drift():
    # PSI in high range (> 0.25)
    rec = get_recommendation(psi=0.35, ks_pvalue=0.20, null_rate=0.01)
    assert "High drift detected — retrain model recommended" in rec
    assert "Moderate drift" not in rec

def test_recommendation_statistically_significant_ks():
    # KS p-value < 0.05
    rec = get_recommendation(psi=0.04, ks_pvalue=0.01, null_rate=0.01)
    assert "Statistically significant distribution shift confirmed" in rec

def test_recommendation_high_null_rate():
    # Null rate > 0.05
    rec = get_recommendation(psi=0.02, ks_pvalue=0.50, null_rate=0.08)
    assert "Check upstream ETL — possible data quality issue" in rec

def test_recommendation_multiple_rules_combination():
    # High PSI, low KS p-value, and high null rate combined
    rec = get_recommendation(psi=0.40, ks_pvalue=0.001, null_rate=0.10)
    assert "High drift detected — retrain model recommended" in rec
    assert "Statistically significant distribution shift confirmed" in rec
    assert "Check upstream ETL — possible data quality issue" in rec
    assert rec.count(" | ") == 2

def test_recommendation_categorical_none_ks():
    # Categorical features pass None for ks_pvalue
    rec_low = get_recommendation(psi=0.05, ks_pvalue=None, null_rate=0.01)
    assert rec_low == "No action required"

    rec_high = get_recommendation(psi=0.30, ks_pvalue=None, null_rate=0.02)
    assert "High drift detected — retrain model recommended" in rec_high
