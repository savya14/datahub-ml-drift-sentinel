import numpy as np
import pandas as pd

N_ITEMS = 800
SEED_BASELINE = 42
SEED_CURRENT = 43

def _generate_item_base(rng: np.random.Generator, n: int) -> pd.DataFrame:
    return pd.DataFrame({"item_id": [f"item_{i:04d}" for i in range(n)]})

def generate_features(seed: int, discount_depth_mean: float, demand_mean: float) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = _generate_item_base(rng, N_ITEMS)

    # NO DRIFT: Competitor price ratio
    control_rng1 = np.random.default_rng(100)
    df["competitor_price_ratio"] = control_rng1.normal(loc=1.05, scale=0.1, size=N_ITEMS).clip(0.5, 2.0)

    # NO DRIFT: Historical sales volume
    control_rng2 = np.random.default_rng(101)
    df["historical_sales_volume"] = control_rng2.poisson(lam=50, size=N_ITEMS)

    # NO DRIFT: Product category
    categories = ["electronics", "apparel", "home", "toys"]
    control_rng3 = np.random.default_rng(102)
    df["product_category"] = control_rng3.choice(categories, size=N_ITEMS, p=[0.4, 0.3, 0.2, 0.1])

    # MEDIUM DRIFT target: discount_depth (continuous)
    df["discount_depth"] = rng.normal(loc=discount_depth_mean, scale=0.05, size=N_ITEMS).clip(0, 0.5)

    # NO DRIFT target: demand_seasonality (continuous)
    control_rng4 = np.random.default_rng(103)
    df["demand_seasonality"] = control_rng4.normal(loc=demand_mean, scale=0.2, size=N_ITEMS).clip(0, 2.0)

    return df

def main():
    baseline = generate_features(
        seed=SEED_BASELINE,
        discount_depth_mean=0.15,
        demand_mean=1.0,
    )
    current = generate_features(
        seed=SEED_CURRENT,
        discount_depth_mean=0.165, # shifted slightly
        demand_mean=1.0, # no shift
    )

    baseline.to_csv("data/pricing_baseline_features.csv", index=False)
    current.to_csv("data/pricing_current_features.csv", index=False)
    print(f"Wrote data/pricing_baseline_features.csv and data/pricing_current_features.csv ({N_ITEMS} rows each)")

if __name__ == "__main__":
    main()
