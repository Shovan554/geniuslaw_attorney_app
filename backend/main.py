import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import app_version as app_version_router
from routers import attorneys as attorneys_router
from routers import auth as auth_router
from routers import calls as calls_router
from routers import cases as cases_router
from routers import clients as clients_router
from routers import messages as messages_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Genius Law Attorney API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ASSETS_DIR = Path(__file__).parent / "assets"
if _ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(app_version_router.router)
app.include_router(auth_router.router)
app.include_router(attorneys_router.router)
app.include_router(cases_router.router)
app.include_router(clients_router.router)
app.include_router(messages_router.router)
app.include_router(calls_router.router)
