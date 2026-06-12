"""FastAPI app entry point."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db.database import engine, Base
from routes import chat, skills

# Create tables
Base.metadata.create_all(bind=engine)

# Ensure avatars directory exists
AVATARS_DIR = Path(__file__).parent / "avatars"
AVATARS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Virtual Companion")

# Allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve avatar images
app.mount("/avatars", StaticFiles(directory=str(AVATARS_DIR)), name="avatars")

app.include_router(chat.router)
app.include_router(skills.router)


@app.get("/")
def root():
    return {"message": "Virtual Companion API is running"}
