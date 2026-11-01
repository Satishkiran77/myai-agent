# BENZ — Personal AI Assistant

BENZ is a local-first personal AI assistant built with Node.js, Express, HTML, CSS, JavaScript, and Ollama. Its current foundation keeps conversations and personal memory on your computer.

## Current features

- Chat with a local Ollama model (Llama 3.2 by default).
- Keep the latest 20 messages in each conversation.
- Save conversations and personal memory in local JSON files.
- Restore chat history after a browser refresh or backend restart.
- View, edit, and delete saved personal memories.
- Configure the model, Ollama address, server port, and request timeout.
- Limit request size and message length; handle unavailable Ollama service gracefully.

## Project structure

```text
myai-agent/
├── backend/
│   ├── config/settings.js
│   ├── memory/
│   │   ├── conversation.store.js
│   │   ├── profile.store.js
│   │   └── index.js
│   ├── routes/
│   │   ├── chat.routes.js
│   │   ├── health.routes.js
│   │   ├── history.routes.js
│   │   └── memory.routes.js
│   ├── services/ollama.service.js
│   ├── data/                 # Local-only; ignored by Git
│   ├── package.json
│   └── server.js
├── frontend/index.html
├── .gitignore
└── README.md
```

## Requirements and setup

- Node.js 18 or later (Node.js 20+ recommended).
- Ollama installed and running.
- Download the model if needed: `ollama pull llama3.2`.
- In `backend`, install dependencies with `npm install`, then start with `npm start`.
- Open http://localhost:5000.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd start` if script execution policy blocks `npm`.

## Configuration

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Local bind address |
| `PORT` | `5000` | Backend port |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama address |
| `OLLAMA_MODEL` | `llama3.2` | Model name |
| `OLLAMA_TIMEOUT_MS` | `120000` | Maximum model response wait |
| `JSON_BODY_LIMIT` | `1mb` | Maximum JSON request size |

The backend binds to localhost by default, so it is not exposed to your local network.

## Local data and privacy

Chat messages are stored in `backend/data/conversations.json`; profile facts are stored in `backend/data/profile.json`. The backend creates these files automatically. The `backend/data/` folder is ignored by Git, so personal chat and profile data are not pushed to GitHub. Back up these files before moving computers.

The app recognizes explicit memory instructions such as `Remember this: My favorite color is blue` and a small set of preference phrases. Do not save passwords, OTPs, financial credentials, or other secrets.

## API

- `GET /api/health` — backend status.
- `GET /api/history/:conversationId` — load saved messages.
- `POST /api/chat` — send a message and receive an AI response.
- `GET /api/memory` — read saved profile memory.
- `PUT /api/memory/:key` — update a saved memory.
- `DELETE /api/memory/:key` — delete a saved memory.

Chat request:

```json
{ "message": "What is artificial intelligence?", "conversationId": "a-unique-conversation-id" }
```

## Roadmap

The next phases will add an intelligent task planner, stronger memory retrieval, voice, web research, permission-based computer assistance, coding tools, and a lightweight 3D BENZ command-center interface. Sensitive actions will require user approval.
