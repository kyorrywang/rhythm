# Rhythm
The General Agent Orchestrator for Content Creation. Think of it as "Cursor/Claude Code for Writers & Planners".

## Architecture
This project is structured as a modern Desktop + Local API B/S architecture:
- `core/`: The absolute engine. Contains the Multi-Agent orchestration logic (PrimaryAgent vs SubAgent) and Capabilities (like the Workflow SOP engine). It is completely stateless.
- `apps/api/`: The FastAPI backend. Exposes `core/` to the frontend. It manages connections, config hierarchies, and streams events.
- `apps/desktop/`: The React + Tauri desktop application. Provides an industrial-grade interface with sidebars, chat timelines, and inline modular artifacts.

## Data Philosophy
Rhythm maintains strict boundaries between System and User Space:
- **Global Config**: Saved in your user home `~/.rhythm/settings.json`.
- **Workspace Data**: All project-specific data (chat history, running workflows, local settings) is created seamlessly inside the `.rhythm/` folder within the directory you choose as your workspace. The codebase itself remains pristine.

## Setup & Development
The project requires Python 3.11+ and Node.js.

### 1. Python Environment
Create a new virtual environment and install the backend:
```bash
python -m venv .venv
# Activate on Windows:
.\.venv\Scripts\activate
# Or Mac/Linux:
source .venv/bin/activate

# Install dependencies (from core and api)
pip install fastapi uvicorn openai pyyaml pydantic httpx
```

### 2. Run the API Server
```bash
.\scripts\run_api.ps1
# API will run on http://localhost:8000
```

### 3. Run the Desktop App
Open a new terminal:
```bash
cd apps/desktop
npm install
npm run tauri dev
```
