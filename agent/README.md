# Logfire Docs chatbot

## Usage

Make sure you have `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` set in your environment variables.

Run the agent backend + pre-packaged frontend:

```bash
cd agent
uv sync
uv pip install -r requirements.txt
uv run uvicorn chatbot.server:app
```

Then open your browser to `http://localhost:8000`.

### Frontend development

Optionally run the frontend in dev mode, which will connect to the running agent backend:

```bash
npm install
npm run dev
```

Then open your browser to `http://localhost:5173`.

#below running cmd

### Both backend and FE should run 
cd ai-chat-ui-main
cd agent
.venv\Scripts\activate

Backend run --> uv run uvicorn chatbot.server:app --host 0.0.0.0 --port 38001 --env-file .env 
cd ai-chat-ui-main

Frontend run --- > pnpm run dev --host 0.0.0.0 # if not working run above cmd