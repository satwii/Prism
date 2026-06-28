"""
Prism — Reveal the Hidden Intent.
FastAPI Application Entry Point.

Loads the BERT (production1_chat_model, 4-layer distilled BERT) at startup
with model.eval(), initializes ChromaDB, SQLite, and mounts all route modules.
"""
import os
import sys
import torch
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import init_database, FRONTEND_ORIGIN, MODEL_PATH

# Global references
_model = None
_tokenizer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global _model, _tokenizer

    print("=" * 60)
    print("  PRISM — Reveal the Hidden Intent")
    print("  Starting up...")
    print("=" * 60)

    # ── 1. SQLite Database (zero setup — just a file) ──
    print("→ Setting up SQLite database...")
    init_database()

    # ── 2. BERT Model (production1_chat_model — 4-layer distilled BERT) ──
    print(f"→ Loading BERT (production1) from {MODEL_PATH}...")
    from transformers import BertTokenizer, BertForSequenceClassification

    _tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
    _model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
    _model.eval()  # Set to evaluation mode — NEVER reload per request
    print(f"  ✓ Model loaded ({sum(p.numel() for p in _model.parameters()):,} parameters)")

    # ── 3. ChromaDB ──
    print("→ Initializing ChromaDB...")
    from services.chromadb_service import init_chromadb
    init_chromadb(_tokenizer, _model)

    # ── 4. AI Pipeline ──
    print("→ Initializing AI Pipeline...")
    from services.ai_pipeline import init_pipeline
    init_pipeline(_tokenizer, _model)

    print("=" * 60)
    print("  ✓ PRISM is ready. All systems online.")
    print("=" * 60)

    yield  # App is running

    # Shutdown
    print("Prism shutting down...")


# ──────────────────────────────────────────────
# App Instance
# ──────────────────────────────────────────────
app = FastAPI(
    title="Prism API",
    description="AI-powered messaging safety — Reveal the Hidden Intent.",
    version="1.0.0",
    lifespan=lifespan,
)



# CORS — allow all origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler — ensures errors always get proper JSON + CORS headers
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

# ──────────────────────────────────────────────
# Mount Routes
# ──────────────────────────────────────────────
from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.admin import router as admin_router
from routes.organizations import router as org_router
from routes.reports import router as report_router

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(admin_router)
app.include_router(org_router)
app.include_router(report_router)


@app.get("/")
async def root():
    return {
        "name": "Prism API",
        "tagline": "Reveal the Hidden Intent",
        "version": "1.0.0",
        "status": "online",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model_loaded": _model is not None,
        "tokenizer_loaded": _tokenizer is not None,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

