from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import tempfile, os, logging
from database.connector import upload_transactions, upsert_user_category_override
from pipeline.categorizer import _clean_description

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI() #creates the API

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], #telling uvicorn to trust 3000
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return RedirectResponse(url="/docs")

@app.post("/upload") # telling fastapi the instance (app) when someone sends a post request to /upload, run this function
# ie: react app calling: fetch("http://localhost:8000/upload", { method: "POST" })
async def upload_pdf(file: UploadFile = File(...), user_id: str = Form(...)): #async def allows the function to pause and wait without blocking everything else
    contents = await file.read() # await because async, and reads the entire file into memory as bytes

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp: # creates a real file on disk with a random name like like C:\Temp\tmpxyz123.pdf). 
        # My parse_pdf() needs a file path, not raw bytes, so this bridges the gap
        # delete=False → don't auto-delete when closed, because you still need to use it
        # tmp.name → saves the file path for later use
        tmp.write(contents)
        tmp_path = tmp.name

    try: #calls the function with the temp file path
        result = upload_transactions(tmp_path, user_id)
        return result
    finally: # finally → always runs, even if an error occurs
        os.remove(tmp_path) #os.remove() → manually deletes the temp file (cleanup)


@app.post("/set-override")
async def set_override(user_id: str = Form(...), description: str = Form(...), category: str = Form(...)):
    """Store a user's permanent category preference for a merchant description."""
    cleaned = _clean_description(description)
    upsert_user_category_override(user_id, cleaned, category)
    return {"cleaned_description": cleaned, "category": category}
