from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from infra.config import load_settings
from routes.chat import router as chat_router
from routes.sessions import router as sessions_router
from routes.artifacts import router as artifacts_router
from routes.health import router as health_router
from routes.workspace import router as workspace_router
from routes.config import router as config_router
from routes.workflows import router as workflows_router

settings = load_settings()
app = FastAPI(title="Rhythm API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(sessions_router)
app.include_router(artifacts_router)
app.include_router(health_router)
app.include_router(workspace_router)
app.include_router(config_router)
app.include_router(workflows_router)


@app.get("/")
def root():
    return {"message": "Rhythm API is running"}
