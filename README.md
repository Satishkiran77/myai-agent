# My Personal AI Agent

A local AI assistant built with Node.js, Express, HTML, CSS, JavaScript, and Ollama.

## Features

- Chat with the local Llama 3.2 model.
- Keep the latest 20 messages in each conversation.
- Save conversations permanently in a local JSON file.
- Restore previous chat messages after a browser refresh.
- Restore conversation memory after restarting the backend.
- Keep chat data out of Git using .gitignore.

## Project Structure

```text
myai-agent/
├── backend/
│   ├── data/                 # Created automatically; local chat memory
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
├── frontend/
│   └── index.html
├── .gitignore
└── README.md
```

## Requirements

- Node.js 18 or later.
- Ollama installed and running.
- The llama3.2 model downloaded.

## Setup

1. Clone this repository.
2. Open a terminal in the project folder.
3. Download the model if needed:

   ```bash
   ollama pull llama3.2
   ```

4. Install backend dependencies:

   ```bash
   cd backend
   npm install
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open http://localhost:5000 in your browser.

## Permanent Memory

Chat messages are stored locally in `backend/data/conversations.json`. The backend creates this folder and file automatically when a conversation is saved.

The latest 20 messages are kept for each conversation. The browser stores the conversation ID in session storage, allowing the same browser tab to restore its chat after a refresh or backend restart.

The `backend/data/` folder is ignored by Git, so personal chat history is not pushed to GitHub. Keep a backup of this file if you want to preserve your conversations when moving to another computer.

## API

- `GET /api/health` - Check whether the server is running.
- `GET /api/history/:conversationId` - Load saved messages for a conversation.
- `POST /api/chat` - Send a message and receive an AI response.

Chat request JSON:

```json
{
  "message": "What is artificial intelligence?",
  "conversationId": "a-unique-conversation-id"
}
```

## Technologies

- Node.js
- Express
- CORS
- Ollama
- Llama 3.2
- HTML, CSS, JavaScript
- Local JSON file storage
