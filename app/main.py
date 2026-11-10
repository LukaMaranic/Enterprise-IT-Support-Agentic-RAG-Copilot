from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import BASE_DIR, get_settings
from app.core.logger import log_config as configure_logging
from app.services.audit import init_db

configure_logging()
settings = get_settings()
init_db()

app = FastAPI(title=settings.app_name, version="1.0.0")
app.include_router(router)

frontend_dist = BASE_DIR / "frontend" / "dist"
frontend_index = frontend_dist / "index.html"
assets_dir = frontend_dist / "assets"

if assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    if not frontend_index.is_file():
        raise HTTPException(status_code=503, detail="Frontend is not built; use Vite on port 5173 for development.")
    return FileResponse(frontend_index)


@app.get("/{client_path:path}", include_in_schema=False)
def spa_fallback(client_path: str) -> FileResponse:
    """Serve generated files directly and React's entry point for client routes."""
    requested = (frontend_dist / client_path).resolve()
    if frontend_dist.resolve() in requested.parents and requested.is_file():
        return FileResponse(requested)
    if frontend_index.is_file():
        return FileResponse(frontend_index)
    raise HTTPException(status_code=404, detail="Frontend is not built")
