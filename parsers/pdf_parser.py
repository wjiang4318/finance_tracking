"""
PDF parser: extracts transactions and statement metadata from bank PDFs.

Usage:
    from parsers.pdf_parser import parse_pdf

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
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import pdfplumber

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Transaction:
    date: str
    description: str
    amount: float
    raw_text: str = ""
    source_tier: str = ""


# ---------------------------------------------------------------------------
# Account type detection
# ---------------------------------------------------------------------------

_ACCOUNT_SIGNALS = {
    "credit": [
        re.compile(r"minimum\s+payment\s+due",         re.I),
        re.compile(r"credit\s+limit",                  re.I),
        re.compile(r"available\s+credit",              re.I),
        re.compile(r"payments.{0,10}credits.{0,10}adjustments", re.I),
        re.compile(r"statement\s+balance",             re.I),
        re.compile(r"cash\s+advance",                  re.I),
        re.compile(r"purchase\s+apr",                  re.I),
        re.compile(r"rewards?\s+points?",              re.I),
    ],
    "checking": [
        re.compile(r"deposits?\s+and\s+additions",     re.I),
        re.compile(r"checks?\s+paid",                  re.I),
        re.compile(r"direct\s+deposit",                re.I),
        re.compile(r"\boverdraft\b",                   re.I),
        re.compile(r"debit\s+card\s+purchases?",       re.I),
        re.compile(r"atm\s+withdrawal",                re.I),
        re.compile(r"checking\s+account",              re.I),
    ],
    "savings": [
        re.compile(r"interest\s+earned",               re.I),
        re.compile(r"annual\s+percentage\s+yield",     re.I),
        re.compile(r"\bapy\b",                         re.I),
        re.compile(r"interest\s+(paid|credited)",      re.I),
        re.compile(r"online\s+savings",                re.I),
        re.compile(r"high.yield\s+savings",            re.I),
        re.compile(r"savings\s+account",               re.I),
        re.compile(r"money\s+market",                  re.I),
    ],
}


def classify_account_type(text: str) -> str | None:
    """Classify account type by scoring regex signal hits across the full statement text."""
    scores = {account_type: 0 for account_type in _ACCOUNT_SIGNALS}
    for account_type, patterns in _ACCOUNT_SIGNALS.items():
        for pattern in patterns:
            if pattern.search(text):
                scores[account_type] += 1

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
# Statement period extraction
# ---------------------------------------------------------------------------

_DATE_PAT = (
    r'\d{1,2}/\d{1,2}/\d{2,4}'
    r'|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?'
    r'|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
    r'\s+\d{1,2},?\s+\d{4}'
)

_PERIOD_RE = re.compile(rf'({_DATE_PAT})\s*(?:through|to|[-–])\s*({_DATE_PAT})', re.I)


def extract_statement_period(text: str) -> dict:
    """Return {'period_start': 'YYYY-MM-DD', 'period_end': 'YYYY-MM-DD'} or Nones."""
    m = _PERIOD_RE.search(text[:3000])
    if m:
        try:
            return {
                "period_start": pd.to_datetime(m.group(1)).strftime("%Y-%m-%d"),
                "period_end":   pd.to_datetime(m.group(2)).strftime("%Y-%m-%d"),
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

_NEGATIVE_SECTION_KEYWORDS = ["PAYMENTS, CREDITS AND ADJUSTMENTS"]

_CC_PAYMENT_PATTERN = re.compile(
    r'\b(autopay|pymt|payment|ach\s+transfer)\b',
    re.I,
)


def extract_transactions(bank_text: str) -> pd.DataFrame:
    """Parse transaction rows from extracted PDF text into a DataFrame."""
    transactions = []
    is_negative_section = False

    for line in bank_text.splitlines():
        line = " ".join(line.split())
        if not line:
            continue

        if any(keyword in line.upper() for keyword in _NEGATIVE_SECTION_KEYWORDS):
            is_negative_section = True
            continue
        elif "TRANSACTIONS" in line.upper():
            is_negative_section = False
            continue

        match = _TRANSACTION_ROW.match(line)
        if match:
            trans_date, post_date, description, amount1, amount2 = match.groups()
            description = description.strip()

            # Skip CC payment rows - these are transfers, not expenses
            if is_negative_section and _CC_PAYMENT_PATTERN.search(description):
                continue

            amount1_num = float(amount1.replace("$", "").replace(",", ""))
            amount2_num = float(amount2.replace("$", "").replace(",", "")) if amount2 else None

            if is_negative_section:
                amount1_num = -abs(amount1_num)
                if amount2_num is not None:
                    amount2_num = -abs(amount2_num)

            transactions.append({
                "trans_date":  trans_date,
                "post_date":   post_date,
                "description": description,
                "amount1":     amount1_num,
                "amount2":     amount2_num,
            })

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

    logger.info(
        "Parsed %s: %d transactions, period %s → %s, account_type %s",
        Path(pdf_path).name,
        len(df),
        period["period_start"],
        period["period_end"],
        account_type,
    )

    return {
        "period_start": period["period_start"],
        "period_end":   period["period_end"],
        "account_type": account_type,
        "transactions": df,
    }
