from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import tempfile, os, logging
from database.connector import upload_transactions, upsert_user_category_override
from pipeline.categorizer import _clean_description

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # local dev frontend only
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return RedirectResponse(url="/docs")

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...), user_id: str = Form(...)):
    contents = await file.read()

    # parse_pdf() needs a real file path, not raw bytes — write the upload to disk
    # so the pipeline can open it. delete=False since it's still needed below;
    # cleanup happens explicitly in `finally`, not automatically on close.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = upload_transactions(tmp_path, user_id)
        return result
    finally:
        os.remove(tmp_path)  # always clean up, even if the pipeline raised


@app.post("/set-override")
async def set_override(user_id: str = Form(...), description: str = Form(...), category: str = Form(...)):
    """Store a user's permanent category preference for a merchant description."""
    cleaned = _clean_description(description)
    upsert_user_category_override(user_id, cleaned, category)
    return {"cleaned_description": cleaned, "category": category}
