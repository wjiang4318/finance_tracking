import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from pipeline.pdf_parser import parse_pdf
# from pipeline.categorizer import categorize

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


result = parse_pdf("data/Capital_One_102025_2952.pdf")
#result_df = parse_pdf("data/Capital_One_102025_2952.pdf")['transactions']
print("Period:", result["period_start"], "->", result["period_end"])
print("Transactions:", len(result["transactions"]))
print(result["transactions"].head(10).to_string())

# result_df["category"] = result_df["description"].apply(categorize)
# print(result_df)

# python tests/test_parsers.py