"""
Claude-based transaction categorizer with Supabase cache.

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
import anthropic

from database.connector import (
    get_cached_categories_bulk,
    cache_categories_bulk,
    get_user_category_overrides_bulk,
)

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
{chr(10).join(f"- {category}" for category in CATEGORIES)}

Rules (apply in priority order — first matching rule wins):

CREDIT CARD PAYMENT — payments made to pay off a credit card balance. Includes bank-issued payment confirmations with no merchant name.
Examples: "CHASE CREDIT CRD AUTOPAY", "Payment Thank You-Mobile" (Chase), "BA ELECTRONIC PAYMENT" (Bank of America), "CAPITAL ONE ONLINE PAYMENT", "AMEX AUTOPAY", "CITI AUTOPAY", "DISCOVER PAYMENT", any description with a card issuer name + PAYMENT/AUTOPAY/PYMT, or any generic bank electronic payment with no merchant context.

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


# Deterministic rules applied before cache/LLM — covers payment descriptions that
# don't carry a card-issuer name (Chase "Payment Thank You", BofA "BA ELECTRONIC PAYMENT")
# and shorthands that are unambiguous (AUTOPAY, PYMT).
_LOCAL_RULES: list[tuple[re.Pattern, str]] = [
    (
        re.compile(
            r'\b(autopay|pymt)\b'       # Capital One: "CAPITAL ONE AUTOPAY PYMT"
            r'|electronic\s+payment'    # BofA:  "BA ELECTRONIC PAYMENT"
            r'|payment\s+thank\s+you',  # Chase: "Payment Thank You-Mobile"
            re.I,
        ),
        "Credit Card Payment",
    ),
]


def _apply_local_rules(desc: str) -> str | None:
    for pattern, category in _LOCAL_RULES:
        if pattern.search(desc):
            return category
    return None


_anthropic_client: anthropic.Anthropic | None = None

def _get_client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _anthropic_client


def _normalize(result: str) -> str:
    for category in CATEGORIES:
        if category.lower() in result.lower():
            return category
    logger.warning("Unrecognized category from Claude: %r — defaulting to 'Uncategorized'", result)
    return "Uncategorized"


def _batch_categorize(descriptions: list[str], client: anthropic.Anthropic) -> list[str]:
    """Send all descriptions in one API call and return a category per description."""
    user_message = "\n".join(f"{i+1}. {desc}" for i, desc in enumerate(descriptions))

    try:
        response = client.messages.create(
            model="claude-haiku-4-5",
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            temperature=0,
            max_tokens=40 * len(descriptions),
        )
    except anthropic.APIError as exc:
        logger.error("Claude API call failed (%s) — defaulting %d items to 'Uncategorized'", exc, len(descriptions))
        return ["Uncategorized"] * len(descriptions)

    raw_text = "".join(block.text for block in response.content if block.type == "text")
    raw_lines = raw_text.strip().splitlines()

    # Parse "N. Category" lines into a dict keyed by index
    parsed: dict[int, str] = {}
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        if ". " in line:
            num_part, category_text = line.split(". ", 1)
            if num_part.isdigit():
                parsed[int(num_part)] = _normalize(category_text.strip())

    # Build results in order; fill any missing index with "Personal"
    missing = [i for i in range(1, len(descriptions) + 1) if i not in parsed]
    if missing:
        logger.warning(
            "Batch response missing %d/%d categories (indices: %s); defaulting to 'Uncategorized'",
            len(missing), len(descriptions), missing,
        )
    results = [parsed.get(i, "Uncategorized") for i in range(1, len(descriptions) + 1)]
    for i, (desc, category) in enumerate(zip(descriptions, results), 1):
        logger.info("  %d. %s --> %s", i, desc, category)
    return results


def categorize_dataframe(df: pd.DataFrame, user_id: str | None = None) -> pd.DataFrame:
    """
    Add a 'category' column to a transactions DataFrame.

    1. Apply deterministic local rules (CC payments, etc.) — no API needed.
    2. User-specific overrides from user_category_overrides table (1 query, if user_id given).
    3. Bulk shared cache lookup for remaining descriptions (1 Supabase query).
    4. Batch Claude API call for anything still uncached.
    5. Merge all results back in original order.
    """
    start_time = time.time()

    descriptions = df["description"].tolist()
    cleaned = [_clean_description(d) for d in descriptions]

    # --- Step 1: deterministic local rules (no cache/API needed) ---
    pre_assigned: dict[int, str] = {}
    for i, cleaned_desc in enumerate(cleaned):
        matched_category = _apply_local_rules(cleaned_desc)
        if matched_category is not None:
            pre_assigned[i] = matched_category

    needs_lookup_indices = [i for i in range(len(cleaned)) if i not in pre_assigned]
    unique_for_lookup = list(dict.fromkeys(cleaned[i] for i in needs_lookup_indices))

    user_overrides: dict[str, str] = {}
    cache_results: dict[str, str] = {}

    if unique_for_lookup:
        # --- Step 2: user-specific overrides (1 Supabase query) ---
        if user_id:
            user_overrides = get_user_category_overrides_bulk(user_id, unique_for_lookup)

        still_needed = [d for d in unique_for_lookup if d not in user_overrides]

        if still_needed:
            # --- Step 3: bulk shared cache lookup (1 Supabase query) ---
            cache_results = get_cached_categories_bulk(still_needed)
            uncached_descs = [d for d in still_needed if d not in cache_results]

            cache_hits = sum(1 for i in needs_lookup_indices if cleaned[i] in cache_results)
            logger.info(
                "%d transactions → %d unique | %d local rules, %d user overrides, %d cached, %d need API",
                len(descriptions), len(dict.fromkeys(cleaned)),
                len(pre_assigned), len(user_overrides), cache_hits, len(uncached_descs),
            )

            # --- Step 4: batch API call for uncached descriptions (chunks of 20) ---
            if uncached_descs:
                client = _get_client()
                chunk_size = 20
                chunks = [uncached_descs[i:i+chunk_size] for i in range(0, len(uncached_descs), chunk_size)]
                logger.info("%d descriptions → %d API call(s)", len(uncached_descs), len(chunks))

                for i, chunk in enumerate(chunks, 1):
                    batch = _batch_categorize(chunk, client)
                    new_mappings = dict(zip(chunk, batch))
                    cache_results.update(new_mappings)
                    cache_categories_bulk(new_mappings)
                    logger.info("Cached batch %d/%d", i, len(chunks))
                logger.info("Added %d new descriptions to cache", len(uncached_descs))
        else:
            logger.info(
                "%d transactions → all resolved by local rules + user overrides",
                len(descriptions),
            )
    else:
        logger.info("%d transactions → all %d matched local rules", len(descriptions), len(pre_assigned))

    # --- Step 5: assemble final categories in original order ---
    categories = []
    for i in range(len(cleaned)):
        if i in pre_assigned:
            categories.append(pre_assigned[i])
        elif cleaned[i] in user_overrides:
            categories.append(user_overrides[cleaned[i]])
        else:
            categories.append(cache_results.get(cleaned[i], "Uncategorized"))

    elapsed = time.time() - start_time
    logger.info("Categorization finished in %.1fs", elapsed)

    df = df.copy()
    df["cleaned_description"] = cleaned
    df["category"] = categories
    return df
