"""
PDF parser: extracts transactions and statement metadata from bank PDFs.

Usage:
    from pipeline.pdf_parser import parse_pdf

    result = parse_pdf("data/samples/Capital_One_Statement_102025_2952.pdf")
    # result = {
    #     "period_start": "2025-09-20",
    #     "period_end":   "2025-10-20",
    #     "account_type": "credit",
    #     "transactions": DataFrame,
    # }
"""

import re
import logging
from pathlib import Path
import pandas as pd
import pdfplumber

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Account type detection
# ---------------------------------------------------------------------------

# Each entry is (pattern, weight). Weight 3 = near-exclusive to this type,
# 2 = strong indicator, 1 = weaker / can appear across account types.
_ACCOUNT_SIGNALS: dict[str, list[tuple[re.Pattern, int]]] = {
    "credit": [
        (re.compile(r"minimum\s+payment\s+due",                  re.I), 3),
        (re.compile(r"credit\s+limit",                           re.I), 3),
        (re.compile(r"available\s+credit",                       re.I), 3),
        (re.compile(r"cash\s+advance",                           re.I), 3),
        (re.compile(r"purchase\s+apr",                           re.I), 3),
        (re.compile(r"payments.{0,10}credits.{0,10}adjustments", re.I), 2),
        (re.compile(r"rewards?\s+points?",                       re.I), 2),
        (re.compile(r"statement\s+balance",                      re.I), 1),
    ],
    "checking": [
        (re.compile(r"checks?\s+paid",                           re.I), 3),
        (re.compile(r"checking\s+account",                       re.I), 3),
        (re.compile(r"debit\s+card\s+purchases?",                re.I), 2),
        (re.compile(r"\boverdraft\b",                            re.I), 2),
        (re.compile(r"deposits?\s+and\s+additions",              re.I), 2),
        (re.compile(r"atm\s+withdrawal",                         re.I), 1),
        (re.compile(r"direct\s+deposit",                         re.I), 1),
    ],
    "savings": [
        (re.compile(r"online\s+savings",                         re.I), 3),
        (re.compile(r"high.yield\s+savings",                     re.I), 3),
        (re.compile(r"savings\s+account",                        re.I), 3),
        (re.compile(r"annual\s+percentage\s+yield",              re.I), 2),
        (re.compile(r"money\s+market",                           re.I), 2),
        (re.compile(r"interest\s+earned",                        re.I), 1),
        (re.compile(r"interest\s+(paid|credited)",               re.I), 1),
    ],
}


def classify_account_type(text: str) -> str | None:
    """Classify account type by scoring weighted regex signal hits across the full statement text."""
    scores = {account_type: 0 for account_type in _ACCOUNT_SIGNALS}
    for account_type, signals in _ACCOUNT_SIGNALS.items():
        for pattern, weight in signals:
            if pattern.search(text):
                scores[account_type] += weight

    best_type, best_score = max(scores.items(), key=lambda x: x[1])
    return best_type if best_score > 0 else None

# ---------------------------------------------------------------------------
# Text extraction from PDF
# ---------------------------------------------------------------------------

def extract_text(pdf_path: str) -> str:
    """Extract all text from a PDF using pdfplumber."""
    pages_text = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)
    return "\n".join(pages_text)


# ---------------------------------------------------------------------------
# Last-four account digit extraction
# ---------------------------------------------------------------------------

_LAST_FOUR_RE = re.compile(
    r'(?:'
    r'ending\s+in\s+(\d{4})'                                     # "ending in 1234"
    r'|account\s*(?:number|no\.?|#)[:\s]+[ \d*xX-]*?(\d{4})\b'  # "Account Number: XXXX XXXX XXXX 1234" or "AccountNumber 300065199279"
    r'|\*{2,}(\d{4})\b'                                          # "****1234"
    r'|[xX]{2,}(\d{4})\b'                                        # "xxxx1234"
    r'|(?:checking|savings)\s+\d*(\d{4})\b'                      # "Chase College Checking 000000538918585"
    r')',
    re.I,
)


def extract_last_four(text: str) -> str | None:
    """Return the last 4 digits of the account number from the statement header, or None."""
    account_match = _LAST_FOUR_RE.search(text[:3000])
    if account_match:
        return next(capture for capture in account_match.groups() if capture is not None)
    return None


# ---------------------------------------------------------------------------
# Card / account product name extraction
# ---------------------------------------------------------------------------

_MARCUS_ACCOUNT_RE = re.compile(r'AccountName\s+([A-Za-z]+)', re.I)

# More specific patterns must come before general ones — on a position tie,
# first entry in the list wins (strict < means equal positions don't override).
_CARD_NAME_SIGNALS: list[tuple[re.Pattern, str]] = [
    # Chase credit
    (re.compile(r'sapphire\s+reserve',          re.I), "Chase Sapphire Reserve"),
    (re.compile(r'sapphire\s+preferred',        re.I), "Chase Sapphire Preferred"),
    (re.compile(r'sapphire',                    re.I), "Chase Sapphire"),
    (re.compile(r'freedom\s+unlimited',         re.I), "Chase Freedom Unlimited"),
    (re.compile(r'freedom\s+flex',              re.I), "Chase Freedom Flex"),
    (re.compile(r'freedom\s+rise',              re.I), "Chase Freedom Rise"),
    (re.compile(r'freedom',                     re.I), "Chase Freedom"),
    # Chase checking
    (re.compile(r'college\s+checking',          re.I), "Chase College Checking"),
    (re.compile(r'sapphire\s+checking',         re.I), "Chase Sapphire Checking"),
    (re.compile(r'premier\s+plus\s+checking',   re.I), "Chase Premier Plus Checking"),
    (re.compile(r'total\s+checking',            re.I), "Chase Total Checking"),
    # Capital One
    (re.compile(r'venture\s*one',               re.I), "Capital One VentureOne"),
    (re.compile(r'venture\s*x',                 re.I), "Capital One Venture X"),
    (re.compile(r'venture',                     re.I), "Capital One Venture"),
    (re.compile(r'quicksilver\s*one',           re.I), "Capital One QuicksilverOne"),
    (re.compile(r'quicksilver',                 re.I), "Capital One Quicksilver"),
    (re.compile(r'savor\s*one',                 re.I), "Capital One SavorOne"),
    (re.compile(r'savor',                       re.I), "Capital One Savor"),
    (re.compile(r'spark',                       re.I), "Capital One Spark"),
    # Bank of America
    (re.compile(r'customized\s+cash\s+rewards', re.I), "Bank of America Customized Cash Rewards"),
    (re.compile(r'unlimited\s+cash\s+rewards',  re.I), "Bank of America Unlimited Cash Rewards"),
    (re.compile(r'premium\s+rewards',           re.I), "Bank of America Premium Rewards"),
    (re.compile(r'travel\s+rewards',            re.I), "Bank of America Travel Rewards"),
    (re.compile(r'cash\s+rewards',              re.I), "Bank of America Cash Rewards"),
    (re.compile(r'visa\s+signature',            re.I), "Bank of America Visa Signature"),
    # Wells Fargo
    (re.compile(r'active\s+cash',               re.I), "Wells Fargo Active Cash"),
    (re.compile(r'autograph',                   re.I), "Wells Fargo Autograph"),
    (re.compile(r'reflect',                     re.I), "Wells Fargo Reflect"),
    # American Express
    (re.compile(r'platinum\s+card',             re.I), "Amex Platinum"),
    (re.compile(r'gold\s+card',                 re.I), "Amex Gold"),
    (re.compile(r'blue\s+cash\s+preferred',     re.I), "Amex Blue Cash Preferred"),
    (re.compile(r'blue\s+cash\s+everyday',      re.I), "Amex Blue Cash Everyday"),
    # Citi
    (re.compile(r'double\s+cash',               re.I), "Citi Double Cash"),
    (re.compile(r'custom\s+cash',               re.I), "Citi Custom Cash"),
    (re.compile(r'strata\s+premier',            re.I), "Citi Strata Premier"),
    # Discover
    (re.compile(r'discover\s+it',               re.I), "Discover It"),
]


def extract_card_name(text: str) -> str | None:
    """Return the card or account product name from the statement header."""
    header = text[:3000]

    # Marcus: pull the user-defined account name directly from the AccountName field
    m = _MARCUS_ACCOUNT_RE.search(header)
    if m:
        raw = m.group(1)
        name = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', raw)  # CamelCase -> "Emergency Fund"
        return f"Marcus {name}"

    # All others: return the name whose keyword appears earliest in the header
    best_pos, best_name = len(header) + 1, None
    for pattern, name in _CARD_NAME_SIGNALS:
        m = pattern.search(header)
        if m and m.start() < best_pos:
            best_pos, best_name = m.start(), name
    return best_name if best_name is not None else "Unknown Account"


# ---------------------------------------------------------------------------
# Statement period extraction
# ---------------------------------------------------------------------------

_DATE_PAT = (
    r'\d{1,2}/\d{1,2}/\d{2,4}'
    r'|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?'
    r'|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
    r'\s+\d{1,2},?\s+\d{4}'
)

# Month Day without year — for "August 7 - September 6, 2025" 
_DATE_NO_YEAR_PAT = (
    r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?'
    r'|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
    r'\s+\d{1,2},?'
)

_PERIOD_RE = re.compile(rf'({_DATE_PAT})\s*(?:through|to|[-–])\s*({_DATE_PAT})', re.I)
_PERIOD_SHARED_YEAR_RE = re.compile(rf'({_DATE_NO_YEAR_PAT})\s*[-–]\s*({_DATE_PAT})', re.I)


def extract_statement_period(text: str) -> dict:
    """Return {'period_start': 'YYYY-MM-DD', 'period_end': 'YYYY-MM-DD'} or Nones."""
    period_match = _PERIOD_RE.search(text[:3000])
    if period_match:
        try:
            return {
                "period_start": pd.to_datetime(period_match.group(1)).strftime("%Y-%m-%d"),
                "period_end":   pd.to_datetime(period_match.group(2)).strftime("%Y-%m-%d"),
            }
        except Exception:
            pass

    # Fallback: "Month Day - Month Day, Year" where year only appears on the end date (BofA)
    shared_year_match = _PERIOD_SHARED_YEAR_RE.search(text[:3000])
    if shared_year_match:
        try:
            end_date = pd.to_datetime(shared_year_match.group(2))
            start_date = pd.to_datetime(f"{shared_year_match.group(1)} {end_date.year}")
            if start_date > end_date:
                start_date = start_date.replace(year=end_date.year - 1)
            return {
                "period_start": start_date.strftime("%Y-%m-%d"),
                "period_end":   end_date.strftime("%Y-%m-%d"),
            }
        except Exception:
            pass

    return {"period_start": None, "period_end": None}


# ---------------------------------------------------------------------------
# Transaction row parsing
# ---------------------------------------------------------------------------

_DATE_PATTERN = (
    r'\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b|'
    r'\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|'
    r'May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|'
    r'Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b'
)
_AMOUNT_PATTERN = r'-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?'

_TRANSACTION_ROW = re.compile(
    rf'^\s*({_DATE_PATTERN})'
    rf'(?:\s+({_DATE_PATTERN}))?'
    rf'\s+(.*?)'
    rf'\s+({_AMOUNT_PATTERN})'
    rf'(?:\s+({_AMOUNT_PATTERN}))?'
    rf'\s*$',
    re.I,
)

# Detects "payments … credits" section headers for amount-negation only (not for filtering).
_NEGATIVE_SECTION_RE = re.compile(
    r'\bpayments?\b.*\bcredits?\b|\bcredits?\b.*\bpayments?\b',
    re.I,
)

# Applied globally to every parsed row — these phrases never appear in real merchant names.
# Filters CC payment confirmations regardless of which PDF section they came from.
_CC_PAYMENT_FILTER = re.compile(
    r'payment\s+thank\s+you'    # Chase:        "Payment Thank You-Mobile"
    r'|electronic\s+payment'    # BofA:         "BA ELECTRONIC PAYMENT"
    r'|\bpymt\b'                # Capital One:  "CAPITAL ONE AUTOPAY PYMT"
    r'|\bautopay\b',            # Capital One / others: "AUTOPAY"
    re.I,
)

# Balance snapshots printed as rows inside the transaction table (Marcus: "BeginningBalance
# $7,666.01", "EndingBalance $160.06") — not real money movements, just the account balance
# at the edges of the statement period. Structurally identical to a real one-amount
# transaction row, so the description text is the only thing that tells them apart.
_BALANCE_SNAPSHOT_FILTER = re.compile(
    r'^(?:beginning|ending|previous|opening|closing)\s*balance$',
    re.I,
)

# Looser than _TRANSACTION_ROW — flags lines with a date + decimal amount that still
# failed to parse, so a parsing gap logs a warning instead of silently vanishing.
_LOOKS_LIKE_TRANSACTION_RE = re.compile(rf'(?:{_DATE_PATTERN}).*?\d+\.\d{{2}}\b', re.I)


def extract_transactions(bank_text: str) -> pd.DataFrame:
    """Parse transaction rows from extracted PDF text into a DataFrame."""
    transactions = []
    is_negative_section = False

    for line in bank_text.splitlines():
        line = " ".join(line.split())
        if not line:
            continue

        if _NEGATIVE_SECTION_RE.search(line) and not _TRANSACTION_ROW.match(line):
            is_negative_section = True
            continue
        elif "TRANSACTIONS" in line.upper() and not _TRANSACTION_ROW.match(line):
            is_negative_section = False
            continue

        match = _TRANSACTION_ROW.match(line)
        if match:
            trans_date, _, description, amount1, amount2 = match.groups()
            description = description.strip()

            if _CC_PAYMENT_FILTER.search(description):
                continue

            if _BALANCE_SNAPSHOT_FILTER.match(description):
                continue

            amount1_num = float(amount1.replace("$", "").replace(",", ""))
            amount2_num = float(amount2.replace("$", "").replace(",", "")) if amount2 else None

            if is_negative_section:
                amount1_num = -abs(amount1_num)
                if amount2_num is not None:
                    amount2_num = -abs(amount2_num)

            transactions.append({
                "trans_date":  trans_date,
                "description": description,
                "amount1":     amount1_num,
                "amount2":     amount2_num,
            })
        elif _LOOKS_LIKE_TRANSACTION_RE.search(line):
            logger.warning("Line looked like a transaction but failed to parse: %r", line)

    return pd.DataFrame(transactions)


# ---------------------------------------------------------------------------
# Parse PDF function
# ---------------------------------------------------------------------------

def parse_pdf(pdf_path: str) -> dict:
    """
    Parse a bank PDF statement into transactions + metadata.

    Returns
    -------
    {
        "period_start": "YYYY-MM-DD" or None,
        "period_end":   "YYYY-MM-DD" or None,
        "account_type": "credit" | "checking" | "savings" | None,
        "transactions": pd.DataFrame,
    }
    """
    text = extract_text(pdf_path)
    df = extract_transactions(text)
    period = extract_statement_period(text)
    account_type = classify_account_type(text)
    last_four = extract_last_four(text)
    card_name = extract_card_name(text)

    logger.info(
        "Parsed %s: %d transactions, period %s → %s, account_type %s, last_four %s, card_name %s",
        Path(pdf_path).name,
        len(df),
        period["period_start"],
        period["period_end"],
        account_type,
        last_four,
        card_name,
    )

    return {
        "period_start": period["period_start"],
        "period_end":   period["period_end"],
        "account_type": account_type,
        "last_four":    last_four,
        "card_name":    card_name,
        "transactions": df,
    }
