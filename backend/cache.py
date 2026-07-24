import json
import os

CACHE_FILE = os.path.join(os.path.dirname(__file__), "../data/audit_cache.json")

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

def save_cache(cache_data):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=2)

def clear_cache():
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
