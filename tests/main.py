import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from database.connector import upload_transactions

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# PDF_PATH = "data/Capital_One_102025_2952.pdf"
PDF_PATH = "data/Chase_Sapphire_20251217-1333.pdf"
PDF_PATH = "data/Chase_College_20260325-8585.pdf"
USER_ID  = "184cc8ea-2430-43d6-8111-1f6297096658"

result = upload_transactions(PDF_PATH, USER_ID)
print(result)