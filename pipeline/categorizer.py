"""
Groq-based transaction categorizer 

Usage:
    from functions.categorizer import categorize_df
    
"""
import os, json, logging
import pandas as pd
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


CATEGORIES = [
    "Food & Drink", "Groceries", "Travel", "Entertainment",
    "Health and Wellness", "Bills & Utilities", "Shopping", "Personal",
]

SYSTEM_PROMPT = f"""You are a bank transaction categorizer. Given a JSON array of raw transaction descriptions, respond with ONLY a JSON array of objects — one per input, in the same order. Each object must have:
- "merchant": normalized merchant name (e.g. "Whole Foods", "Netflix", "TFL")
- "category": exactly one of these categories:
{", ".join(f'"{c}"' for c in CATEGORIES)}

Rules:
- Any place where you eat or drink, including restaurants, cafes, bars, and takeout → "Food & Drink"
- Food bought for home, including supermarkets, food markets, and grocery delivery → "Groceries"
- Any form of transportation or accommodation, including public transit, rideshare, flights, hotels, and parking → "Travel"
- Leisure and entertainment, including streaming subscriptions, ticketed events, and recreational services → "Entertainment"
- Physical or mental wellbeing, including medical, fitness, pharmacy, and personal care → "Health and Wellness"
- Recurring charges for services like internet, phone, insurance, or household utilities → "Bills & Utilities"
- Any retail purchase of goods, whether online or in-store → "Shopping"
- Financial transactions like credit card payments, bank transfers, ATM withdrawals, and financial services → "Personal"

Return ONLY a JSON array, no extra text. Example for 2 inputs:
[{{"merchant": "Whole Foods", "category": "Groceries"}}, {{"merchant": "Netflix", "category": "Entertainment"}}]"""

CACHE_FILE = Path("../data/category_cache.json")
_cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}

def _save_cache():
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(_cache, indent=2))

def _call_groq_batch(descriptions: list[str]) -> list[tuple[str, str]] | None:
    """Send a batch of descriptions in one Groq call. Returns list of (merchant, category) or None on failure."""
    try:
        resp = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": json.dumps(descriptions)},
            ],
            temperature=0,
            max_tokens=50 * len(descriptions),
        )
        data = json.loads(resp.choices[0].message.content.strip())
        if not isinstance(data, list) or len(data) != len(descriptions):
            logger.error("Batch response length mismatch: expected %d, got %d", len(descriptions), len(data))
            return None
        results = []
        for desc, item in zip(descriptions, data):
            merchant = item.get("merchant", desc[:40]).strip()
            category = item.get("category", "Personal").strip()
            if category not in CATEGORIES:
                logger.warning("Unexpected category %r for %r — using 'Personal'", category, desc)
                category = "Personal"
            results.append((merchant, category))
        return results
    except json.JSONDecodeError as e:
        logger.error("Batch returned non-JSON: %s", e)
        return None
    except Exception as e:
        logger.error("Batch call failed: %s", e)
        return None


def categorize(description: str) -> tuple[str, str]:
    """Single-description lookup — checks cache first, then calls Groq as a batch of 1."""
    if description in _cache:
        return _cache[description]["merchant"], _cache[description]["category"]
    result = _call_groq_batch([description])
    if result is None:
        return description[:40], "Personal"
    merchant, category = result[0]
    _cache[description] = {"merchant": merchant, "category": category}
    _save_cache()
    return merchant, category


def categorize_df(df: pd.DataFrame, batch_size: int = 20) -> pd.DataFrame:
    """Categorize all transactions. Skips cached rows, batches the rest into Groq calls."""
    descriptions = df["description"].tolist()
    uncached = [d for d in descriptions if d not in _cache]

    total_batches = -(-len(uncached) // batch_size)  # ceiling division
    for i in range(0, len(uncached), batch_size):
        batch = uncached[i:i + batch_size]
        logger.info("Groq batch %d/%d — %d descriptions", i // batch_size + 1, total_batches, len(batch))
        results = _call_groq_batch(batch)
        if results is None:
            logger.warning("Batch failed — falling back to individual calls for this batch")
            for desc in batch:
                merchant, category = categorize(desc)  # already saves to cache
        else:
            for desc, (merchant, category) in zip(batch, results):
                _cache[desc] = {"merchant": merchant, "category": category}

    if uncached:
        _save_cache()

    return df.assign(
        merchant=[_cache[d]["merchant"] for d in descriptions],
        category=[_cache[d]["category"] for d in descriptions],
    )