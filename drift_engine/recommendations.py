from typing import Optional

def get_recommendation(psi: float, ks_pvalue: Optional[float], null_rate: float) -> str:
    """
    Returns a deterministic recommendation based on drift statistics.
    Rules:
    - PSI > 0.25 -> "High drift detected — retrain model recommended"
    - 0.1 <= PSI <= 0.25 -> "Moderate drift — monitor closely"
    - KS p-value < 0.05 -> "Statistically significant distribution shift confirmed"
    - null_rate > 0.05 -> "Check upstream ETL — possible data quality issue"
    """
    recommendations = []
    
    if psi > 0.25:
        recommendations.append("High drift detected — retrain model recommended")
    elif psi >= 0.1:
        recommendations.append("Moderate drift — monitor closely")
        
    if ks_pvalue is not None and ks_pvalue < 0.05:
        recommendations.append("Statistically significant distribution shift confirmed")
        
    if null_rate > 0.05:
        recommendations.append("Check upstream ETL — possible data quality issue")
        
    if not recommendations:
        return "No action required"
        
    return " | ".join(recommendations)
