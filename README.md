# Rhythm

Rhythm 是一个高性能、模块化的桌面 AI Agent 控制台，基于 **Tauri 2.0**、**Rust** 和 **React 19** 构建。它旨在提供一个深植于本地系统的智能体环境，支持流式交互、沙盒级工具执行以及多模型动态切换。

## 🌟 核心特性

-   **全异步流式架构**：基于 Tauri 2.0 的双向 IPC Channel，实现极低延迟的文本与工具状态流。
-   **多模型厂商适配**：原生支持 ChatGPT (OpenAI) 与 Claude (Anthropic) 协议，支持自定义 Base URL。
-   **系统级工具链 (Agent Tools)**：
    -   **Shell 执行器**：支持在本地终端执行跨平台命令（Windows CMD/Linux Shell）。
    -   **文件系统操控**：支持读取、递归写入以及目录分析，赋予 Agent 真实的代码操作能力。
-   **现代化前端体验**：使用 React 19 + Vite 构建，采用 Feature-Sliced Design (FSD) 架构，保证代码的高度可维护性。
-   **状态驱动交互**：集成 Zustand 管理会话状态，支持思维链 (CoT) 实时展示与工具执行日志流。

## 🛠️ 技术栈

### 前端 (Frontend)
-   **React 19**
-   **Vite**
-   **Tailwind CSS 4.0**
-   **Zustand** (状态管理)
-   **Lucide React** (图标库)
-   **Framer Motion** (交互动画)

### 后端 (Backend / Rust)
-   **Tauri 2.0**
-   **Tokio** (异步运行时)
-   **reqwest** (网络请求)
-   **sqlx** (SQLite 数据库支持)
-   **serde** (强类型序列化/反序列化)

## 🚀 快速开始

### 前置条件
-   安装 [Rust](https://www.rust-lang.org/) 环境。
-   安装 [Node.js](https://nodejs.org/) (建议 v18+)。

### 安装与启动
1.  **克隆仓库**
    ```bash
    git clone https://github.com/your-username/rhythm.git
    cd rhythm
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **配置 API 密钥**
    应用启动后会自动在您的用户家目录下创建配置文件：`~/.rhythm/settings.json`。
    请编辑该文件填入您的 API Key：
    ```json
    {
      "llm": {
        "provider": "openai",
        "api_key": "your-openai-api-key",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o"
      }
    }
    ```

4.  **启动开发环境**
    ```bash
    npm run tauri dev
    ```

## 📜 许可证

[MIT License](LICENSE)
