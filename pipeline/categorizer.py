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
    "Investment",
    "Internal Transfers",
    "Credit Card Payment",
    "Income",
    "Uncategorized",
]

_SYSTEM_PROMPT = f"""You are a transaction categorizer. Given a numbered list of transaction descriptions, respond with the number and category for each, one per line, in the format "N. Category". Use only categories from this list:
{chr(10).join(f"- {c}" for c in CATEGORIES)}

Rules (apply in priority order — first matching rule wins):

CREDIT CARD PAYMENT — payments made to pay off a credit card balance. Look for card issuer names combined with payment-related keywords.
Examples: "CHASE CREDIT CRD AUTOPAY", "CAPITAL ONE ONLINE PAYMENT", "AMEX AUTOPAY", "CITI AUTOPAY", "DISCOVER PAYMENT", any description containing a card issuer name + PAYMENT/AUTOPAY/PMT.

INVESTMENT — transactions to/from investment platforms, brokerages, or cryptocurrency exchanges.
Examples: Robinhood, Fidelity, Vanguard, Charles Schwab, E*Trade, TD Ameritrade, Betterment, Wealthfront, Acorns, Coinbase, Binance, Webull, any named brokerage or crypto exchange.

INCOME — money deposited from an employer or government only. Payroll direct deposits, ACH credits from a named employer, tax refunds, cashback/rewards credits. Also includes "InterestPaid" or "Interest Earned" on savings accounts (bank interest is real income).
Examples: "Direct Deposit", "Payroll", "ADP", "Gusto", "Paychex", "ACH Credit [Employer]", "Tax Refund IRS", "InterestPaid", "Interest Earned", "Rewards Credit".
NOT income: Zelle, Venmo, Cash App, PayPal person-to-person transfers — those are Internal Transfers.
NOT income: ACH deposits or internet transfers originating from a bank (Chase, JPMorgan, Bank of America, Wells Fargo, Citi, Goldman Sachs, Marcus, etc.) — those are Internal Transfers between your own accounts, regardless of the direction or which account the statement belongs to.

INTERNAL TRANSFERS — person-to-person transfers and bank-to-bank transfers between personal accounts.
Examples: "Zelle Payment From [Name]", "Zelle Payment To [Name]", Venmo transfers, Cash App personal transfers, PayPal friends-and-family, ACH transfers between your own bank accounts.
CRITICAL: Any ACH deposit or internet transfer that mentions a bank name as the source (e.g., "ACHDepositInternettransferfromJPMORGANCHASEBANK", "ACH Transfer from Chase", "ACH Deposit Goldman Sachs") is an Internal Transfer, NOT income — it is money moving between your own accounts.
NOT internal transfers: Zelle/PayPal from a business (that's Income); PayPal for a purchase (that's Shopping).

FOOD & DRINK — restaurants, cafes, bars, fast food, takeout, food delivery, coffee shops, bubble tea.
Examples: McDonald's, Starbucks, Chick-fil-A, Chipotle, Shake Shack, Deliveroo, Uber Eats, any restaurant or café name.

GROCERIES — supermarkets, grocery stores, food markets, Asian food stores, convenience stores.
Examples: Whole Foods, Costco, Trader Joe's, H-Mart, Aldi, Walmart Grocery, any store primarily selling unprepared food.

TRAVEL — transportation and accommodation only. Flights, trains, buses, taxis, Uber rides, car rental, hotels, parking.
Examples: Delta, United, Amtrak, MTA, Uber (ride), Lyft, Airbnb, Marriott, NCP parking.
NOT travel: activity/tour bookings, Amazon, general retail.

ENTERTAINMENT — leisure, experiences, tours, ticketed events, cinemas, theatres, museums, streaming, gaming.
Examples: Netflix, Spotify, Steam, Ticketmaster, AMC Theatres, GetYourGuide, Eventbrite.

HEALTH AND WELLNESS — medical, dental, pharmacy, fitness, gym, yoga, mental health, personal care.
Examples: CVS Pharmacy, Walgreens, gym membership, dentist, therapist, spa, haircut.

BILLS & UTILITIES — recurring service charges: internet, phone plan, insurance, electricity, gas, water, subscriptions.
Examples: AT&T, Verizon, T-Mobile, internet provider, insurance companies, utility providers.

SHOPPING — retail purchases of physical goods not covered by other categories.
Examples: Amazon, ASOS, H&M, Zara, Apple Store, Target, Best Buy. Amazon is always Shopping unless description says "Fresh" or "Pantry".

UNCATEGORIZED — use ONLY when the description is truly unrecognizable and no other category applies. Last resort.

Important notes:
- Ignore location suffixes, phone numbers, and alphanumeric order IDs in merchant names.
- The same merchant always gets the same category regardless of suffix or transaction ID.

Respond with ONLY numbered category lines, nothing else. Example output:
1. Food & Drink
2. Shopping
3. Investment
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
    logger.warning("Unrecognized category from Groq: %r — defaulting to 'Uncategorized'", result)
    return "Uncategorized"


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
        return ["Uncategorized"] * len(descriptions)

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
    results = [parsed.get(i, "Uncategorized") for i in range(1, len(descriptions) + 1)]
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
            logger.info("Cached batch %d/%d", i, len(chunks))
        logger.info("Added %d new descriptions to cache", len(new_categories))

    # --- Step 3: assemble final categories in original order ---
    categories = [cache_results[c] for c in cleaned]

    elapsed = time.time() - start_time
    logger.info("Categorization finished in %.1fs", elapsed)

    df = df.copy()
    df["cleaned_description"] = cleaned
    df["category"] = categories
    return df
