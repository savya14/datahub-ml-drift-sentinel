"""
Generates the synthetic raw tables + derived churn_features baseline/current
CSVs described in docs/BUILD_SPEC.md, Phase 1.

Run: python data/generate_synthetic_data.py
Outputs baseline_features.csv and current_features.csv into data/.

Drift scenario (deliberate, controlled):
    refund_rate           -> HIGH risk    (chargeback wave: mean 0.05 -> 0.18)
    signup_channel        -> MEDIUM/HIGH  (new ad campaign shifts channel mix)
    avg_resolution_time   -> LOW risk     (negative control -- must NOT flag)
    everything else       -> LOW risk (unchanged)
"""

import numpy as np
import pandas as pd

N_CUSTOMERS = 800
SEED_BASELINE = 42
SEED_CURRENT = 43


def _generate_customer_base(rng: np.random.Generator, n: int) -> pd.DataFrame:
    return pd.DataFrame({"customer_id": [f"cust_{i:04d}" for i in range(n)]})


def generate_features(seed: int, refund_rate_mean: float, refund_rate_std: float,
                       channel_probs: dict, resolution_time_mean: float,
                       resolution_time_std: float, resolution_time_seed: int = 999) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = _generate_customer_base(rng, N_CUSTOMERS)

    df["avg_transaction_amount"] = rng.normal(loc=1500, scale=400, size=N_CUSTOMERS).clip(min=50)
    df["transaction_count_30d"] = rng.poisson(lam=8, size=N_CUSTOMERS)
    df["refund_rate"] = rng.normal(loc=refund_rate_mean, scale=refund_rate_std, size=N_CUSTOMERS).clip(0, 1)

    channels = list(channel_probs.keys())
    probs = list(channel_probs.values())
    df["signup_channel"] = rng.choice(channels, size=N_CUSTOMERS, p=probs)

    df["account_age_days"] = rng.integers(30, 1500, size=N_CUSTOMERS)
    df["support_ticket_count_30d"] = rng.poisson(lam=1.5, size=N_CUSTOMERS)

    # avg_resolution_time is our NEGATIVE CONTROL: it must show genuinely zero
    # drift. Using the main `rng` (seeded differently per baseline/current)
    # would introduce pure sampling noise that KS-test flags as "significant"
    # once N is large enough -- that's a real statistical trap, not a bug in
    # KS-test. Instead we draw it from its own RNG, seeded IDENTICALLY in both
    # calls, so baseline and current are the literal same distribution.
    control_rng = np.random.default_rng(resolution_time_seed)
    df["avg_resolution_time"] = control_rng.normal(
        loc=resolution_time_mean, scale=resolution_time_std, size=N_CUSTOMERS
    ).clip(min=0.5)

    regions = ["north", "south", "east", "west"]
    df["region"] = rng.choice(regions, size=N_CUSTOMERS)

    return df


def main():
    baseline = generate_features(
        seed=SEED_BASELINE,
        refund_rate_mean=0.05,
        refund_rate_std=0.03,
        channel_probs={"organic": 0.50, "referral": 0.25, "paid_ad": 0.15, "partner": 0.10},
        resolution_time_mean=12.0,
        resolution_time_std=4.0,
    )
    current = generate_features(
        seed=SEED_CURRENT,
        refund_rate_mean=0.18,       # <- deliberate drift: chargeback wave
        refund_rate_std=0.06,
        channel_probs={"paid_ad": 0.55, "organic": 0.20, "referral": 0.15, "partner": 0.10},  # <- deliberate drift
        resolution_time_mean=12.0,   # <- unchanged: negative control must not drift
        resolution_time_std=4.0,
    )

    baseline.to_csv("data/baseline_features.csv", index=False)
    current.to_csv("data/current_features.csv", index=False)
    print(f"Wrote data/baseline_features.csv and data/current_features.csv ({N_CUSTOMERS} rows each)")


if __name__ == "__main__":
    main()
