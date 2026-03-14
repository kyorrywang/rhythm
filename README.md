# Rhythm

Rhythm is an AI-native desktop application designed for content creators, writers, and knowledge workers. Inspired by the philosophy of code editors like Cursor, Rhythm brings the power of **Multi-Agent Orchestration**, **Standard Operating Procedures (SOPs)**, and **Local Workspaces** into a sleek, unified chat interface.

## 🚀 Vision: "Cursor for Content Creation"

Rhythm is built on the premise that "Chat is the Universal Interface." Instead of juggling multiple browser tabs, prompts, and document editors, Rhythm allows you to orchestrate complex workflows directly through natural language.

Whether you are writing a novel, analyzing market research, or generating weekly reports, you can ask Rhythm to execute predefined workflows (SOPs). It seamlessly delegates tasks to background sub-agents while you continue your creative focus in the foreground.

## 🏗️ Architecture

Rhythm has evolved into a high-performance, **Pure Native Desktop Application**.

- **Frontend (React + Vite + Zustand)**: A highly responsive, sleek UI emphasizing minimalism. Features an interactive Activity Timeline for agent thoughts and tool calls, and a dynamic Artifacts Panel for viewing and editing workflow states and documents.
- **Backend/Core Engine (Rust + Tauri)**: The powerhouse of Rhythm. 
  - **Zero Network Overhead**: Communication between the UI and the Core happens entirely via IPC (Inter-Process Communication).
  - **Memory Safety & Concurrency**: The Multi-Agent ReAct loop and workflow engine are written in Rust (powered by Tokio), ensuring minimal resource footprint and rock-solid stability even when orchestrating dozens of asynchronous agents.
  - **Local First**: All data—chat histories, configurations, and artifacts—are securely stored in your local project workspace (`.rhythm/` folder).

## 🛠️ Key Features

- **Project Workspaces**: Select a local folder, and Rhythm transforms it into an AI workspace, keeping all context neatly isolated.
- **Capability Extensions**: The core is designed as a blank slate. Capabilities (like the Workflow Engine) can be dynamically loaded to grant the Primary Agent new architectural powers.
- **Background Sub-Agents**: Long-running SOPs are executed by dedicated, stateless Sub-Agents running asynchronously. They can pause (`WAITING_FOR_USER`), ask you for input in the main chat, and resume instantly.
- **Dynamic Artifacts Panel**: Click on a generated file or a running workflow instance in the chat, and view its live state or preview its contents in the right-side slide-out drawer.

## 💻 Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri Dependencies](https://tauri.app/v1/guides/getting-started/prerequisites) (Build tools, WebView2 on Windows, etc.)

### Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode (starts both the Vite dev server and the Rust backend):
   ```bash
   npm run tauri dev
   ```

3. Build the production executable:
   ```bash
   npm run tauri build
   ```
