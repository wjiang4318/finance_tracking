"""
Groq-based transaction categorizer with Supabase cache.

Usage:
    from pipeline.categorizer import categorize_dataframe

    df = categorize_dataframe(df)   # adds/updates a "category" column
"""

import os
import re
import time
import logging

import pandas as pd
from dotenv import load_dotenv
from groq import Groq

from database.connector import get_cached_categories_bulk, cache_categories_bulk

load_dotenv()

logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

CATEGORIES = [
    "Food & Drink",
    "Bills & Utilities",
    "Travel",
    "Groceries",
    "Health and Wellness",
    "Entertainment",
    "Shopping",
    "Personal",
]

_SYSTEM_PROMPT = f"""You are a transaction categorizer. Given a numbered list of transaction descriptions, respond with the number and category for each, one per line, in the format "N. Category". Use only categories from this list:
{chr(10).join(f"- {c}" for c in CATEGORIES)}

Rules (apply in priority order — first matching rule wins):

FOOD & DRINK — restaurants, cafes, bars, fast food chains, takeout, food courts, canteens, bubble tea shops, coffee shops. The merchant must be a place where you consume food/drink on-site or get it delivered/takeaway. This includes non-English restaurant words: "Restauracja" (Polish), "Ristorante" (Italian), "Restaurante" (Spanish/Portuguese), "Restoran", etc.
Examples: McDonald's, Starbucks, Pret A Manger, Wendy's, Chick-fil-A, Chiptole, Nando's, Wagamama, Itsu, Shake Shack, Deliveroo, Uber Eats, Just Eat, any restaurant or café name.

GROCERIES — supermarkets, food markets, grocery stores, Asian food stores, convenience stores. The merchant primarily sells unprepared food/household goods for home use.
Examples: Tesco, Sainsbury's, Waitrose, Lidl, Aldi, Whole Foods, Costco, Trader Joes, H-mart, and any market selling raw/packaged food.

TRAVEL — transportation and accommodation only. Flights, trains, buses, tubes, taxis, Uber (ride, not Eats), ferries, car rental, hotels, hostels, parking.
Examples: TfL, National Rail, Trainline, British Airways, easyJet, Uber (rides), Airbnb (accommodation), NCP parking, Delta Airlines,
NOT travel: activity/tour bookings, Amazon, general retail even if the name mentions a city.

ENTERTAINMENT — leisure activities, experiences, tours, ticketed events, activity booking platforms, cinemas, theatres, museums, streaming subscriptions, gaming.
Examples: GetYourGuide, Viator, Klook, Ticketmaster, Eventbrite, Vue Cinema, Netflix, Spotify, Steam, any tour or experience booking.

HEALTH AND WELLNESS — medical, dental, pharmacy, fitness, gym, yoga, mental health, personal care services (haircut, spa).
Examples: Boots (pharmacy products), GP surgery, dentist, gym membership, therapist, physical rehab

BILLS & UTILITIES — recurring service charges: internet, mobile phone plan, insurance, electricity, gas, water, council tax, streaming if it's a monthly subscription.
Examples: T-mobile, internet bills, council tax, Lycamobile (phone top-up/plan), utility providers.

SHOPPING — retail purchases of physical goods online or in-store, when not covered by Groceries, Health, or Entertainment.
Examples: Amazon, ASOS, H&M, Zara, Apple Store, electronics retailers. Default to Shopping when a merchant sells general goods and doesn't fit a more specific category. Amazon (including "AMAZON*" with order codes) is always Shopping unless the description explicitly says "Fresh" or "Pantry".

PERSONAL — financial transactions only: credit card payments, bank transfers, ATM withdrawals, direct debits to financial accounts.

Important notes:
- Ignore location suffixes in merchant names (e.g., "LONDON", "LONDONLND", "W1D", phone numbers, alphanumeric order IDs) — they are not categories.
- The same brand/merchant must always get the same category regardless of the suffix or transaction ID appended.
- When a merchant name is ambiguous, consider what the business primarily does.

Respond with ONLY numbered category lines, nothing else. Example output:
1. Food & Drink
2. Shopping
3. Travel
Every input number must appear exactly once."""


_PHONE_RE        = re.compile(r'\b\d{3}[.\-\s]\d{3}[.\-\s]\d{4}\b')
_DOMAIN_RE       = re.compile(r'\.(?:COM|NET|ORG|IO)\b', re.I)
_STATE_NUM_RE    = re.compile(r'\b[A-Z]{2}\s+\d+\b')
_ORDER_CODE_RE   = re.compile(r'\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,}\b')
_TRAILING_NUM_RE = re.compile(r'(\s+\d+)+$')


def _clean_description(desc: str) -> str:
    desc = desc.replace('*', ' ')
    desc = _PHONE_RE.sub('', desc)
    desc = _DOMAIN_RE.sub('', desc)
    desc = _STATE_NUM_RE.sub('', desc)
    desc = _ORDER_CODE_RE.sub('', desc)
    desc = _TRAILING_NUM_RE.sub('', desc)
    return ' '.join(desc.split())


_groq_client: Groq | None = None

def _get_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq_client


def _normalize(result: str) -> str:
    for cat in CATEGORIES:
        if cat.lower() in result.lower():
            return cat
    logger.warning("Unrecognized category from Groq: %r — defaulting to 'Personal'", result)
    return "Personal"


def _batch_categorize(descriptions: list[str], client: Groq) -> list[str]:
    """Send all descriptions in one API call and return a category per description."""
    user_message = "\n".join(f"{i+1}. {desc}" for i, desc in enumerate(descriptions))

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            temperature=0,
            max_tokens=20 * len(descriptions),
        )
    except Exception as exc:
        logger.error("Groq API call failed (%s) — defaulting %d items to 'Personal'", exc, len(descriptions))
        return ["Personal"] * len(descriptions)

    raw_lines = response.choices[0].message.content.strip().splitlines()

    # Parse "N. Category" lines into a dict keyed by index
    parsed: dict[int, str] = {}
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        if ". " in line:
            num_part, cat_part = line.split(". ", 1)
            if num_part.isdigit():
                parsed[int(num_part)] = _normalize(cat_part.strip())

    # Build results in order; fill any missing index with "Personal"
    missing = [i for i in range(1, len(descriptions) + 1) if i not in parsed]
    if missing:
        logger.warning(
            "Batch response missing %d/%d categories (indices: %s); defaulting to 'Personal'",
            len(missing), len(descriptions), missing,
        )
    results = [parsed.get(i, "Personal") for i in range(1, len(descriptions) + 1)]
    for i, (desc, cat) in enumerate(zip(descriptions, results), 1):
        logger.info("  %d. %s --> %s", i, desc, cat)
    return results


def categorize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add a 'category' column to a transactions DataFrame.

    1. Check each description against the cache.
    2. Send all uncached descriptions in a single batched API call.
    3. Cache the new results and merge everything back in order.
    """
    start_time = time.time()

    descriptions = df["description"].tolist()
    cleaned = [_clean_description(d) for d in descriptions]

    # --- Step 1: bulk cache lookup (1 Supabase query) ---
    unique_cleaned = list(dict.fromkeys(cleaned))
    cache_results = get_cached_categories_bulk(unique_cleaned)
    uncached_descs = [d for d in unique_cleaned if d not in cache_results]

    cache_hits = sum(1 for d in cleaned if d in cache_results)
    logger.info(
        "%d transactions → %d unique | %d cached, %d need API",
        len(descriptions), len(unique_cleaned), cache_hits, len(uncached_descs),
    )

    # --- Step 2: batch API call for uncached descriptions (chunks of 20) ---
    if uncached_descs:
        client = _get_client()
        chunk_size = 20
        chunks = [uncached_descs[i:i+chunk_size] for i in range(0, len(uncached_descs), chunk_size)]
        logger.info("%d descriptions → %d API call(s)", len(uncached_descs), len(chunks))

        new_categories = []
        for i, chunk in enumerate(chunks, 1):
            batch = _batch_categorize(chunk, client)
            new_categories.extend(batch)
            new_mappings = dict(zip(chunk, batch))
            cache_results.update(new_mappings)
            cache_categories_bulk(new_mappings)
            logger.info("  Cached batch %d/%d", i, len(chunks))
        logger.info("Added %d new descriptions to cache", len(new_categories))

    # --- Step 3: assemble final categories in original order ---
    categories = [cache_results[c] for c in cleaned]

    elapsed = time.time() - start_time
    logger.info("Categorization finished in %.1fs", elapsed)

    df = df.copy()
    df["cleaned_description"] = cleaned
    df["category"] = categories
    return df
