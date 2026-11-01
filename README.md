# My Personal AI Agent

A simple local AI assistant built with Node.js, Express, HTML, CSS, JavaScript, and Ollama.

## Features

- Chat with the local Llama 3.2 model.
- Keep recent conversation context during the current server session.
- Simple browser-based chat interface.
- Run locally; prompts are sent to your local Ollama service.

## Project Structure

```text
myai-agent/
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
├── frontend/
│   └── index.html
├── .gitignore
└── README.md
```

## Requirements

- Node.js 18 or later (Node.js 24 is supported).
- Ollama installed and running.
- The `llama3.2` model downloaded.

## Setup

1. Clone this repository.
2. Open a terminal in the project folder.
3. Download the model if it is not already installed:

   ```bash
   ollama pull llama3.2
   ```

4. Open the backend folder and install dependencies:

   ```bash
   cd backend
   npm install
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open [http://localhost:5000](http://localhost:5000) in your browser.

## Conversation Memory

The backend keeps the latest 20 chat messages for each conversation in memory. The browser stores a conversation ID in session storage so the same tab can continue its conversation after a page refresh.

**Note:** Conversation history is temporary. Restarting the backend clears stored conversations. Persistent history requires a database.

## API

### Health check

`GET /api/health`

### Chat

`POST /api/chat`

JSON body:

```json
{
  "message": "What is artificial intelligence?",
  "conversationId": "a-unique-conversation-id"
}
```

The API returns a JSON object containing `reply`.

## Technologies

- Node.js
- Express
- CORS
- Ollama
- Llama 3.2
- HTML, CSS, JavaScript
