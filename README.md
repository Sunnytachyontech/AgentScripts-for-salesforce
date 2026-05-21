# Padre Gino's Pizza × Salesforce Agentforce Agent API

An integration that connects a React pizza ordering website to a Salesforce Agentforce agent through the Agent API — enabling customers to chat with an AI agent directly from an external website, not built within Salesforce.

![Chat Widget Demo](docs/chat-demo.png)

## What This Project Demonstrates

The Salesforce **Agent API** is a REST API that lets external applications start sessions, send messages, and receive responses from Agentforce agents. This project shows how to:

- Embed a chat widget in a **React website** (built with Vite + TanStack Router)
- Authenticate with Salesforce using the **OAuth 2.0 Client Credentials Flow**
- Proxy all Agent API calls through a **Fastify backend** to keep credentials secure
- Handle the full conversation lifecycle: **session start → messages → session end**
- Optionally use **Server-Sent Events (SSE)** for streaming responses

The agent used here (`Loan_Status_Agent`) was built using **Agent Script** in Agentforce Studio — but this integration works with any Agentforce agent exposed via the Agent API.

---

## Architecture

```
┌─────────────────────┐       ┌─────────────────────┐       ┌──────────────────────────┐
│   React Frontend    │       │   Fastify Proxy      │       │   Salesforce Org          │
│   (localhost:5173)  │       │   (localhost:3000)    │       │                          │
│                     │       │                       │       │                          │
│  AgentChat.jsx      │──────▶│  /api/agent/session   │──────▶│  OAuth Token Endpoint    │
│  (fetch calls)      │       │  /api/agent/message   │──────▶│  api.salesforce.com      │
│                     │◀──────│  /api/agent/end       │◀──────│  Agent API v1            │
│                     │       │  /api/agent/stream    │       │  Agentforce Agent        │
│                     │       │  /api/agent/feedback  │       │  (Agent Script)          │
└─────────────────────┘       └─────────────────────┘       └──────────────────────────┘
        Browser                     Your Server                   Salesforce Cloud
```

**Why a proxy server?** The OAuth consumer key and secret must never be exposed to the browser. The Fastify server handles all authentication and API calls server-side, while the React frontend only talks to your own backend.

---

## Project Structure

This project is based on Brian Holt's [Complete Intro to React, v9](https://github.com/btholt/citr-v9-project) course project (step `18-deploying`).

```
18-deploying/
├── pizza-client-app/               # React frontend (Vite)
│   ├── public/
│   │   ├── style.css               # Original pizza site styles
│   │   └── agent-chat.css          # ✨ NEW — Chat widget styles (347 lines)
│   ├── src/
│   │   ├── AgentChat.jsx           # ✨ NEW — Chat widget component (260 lines)
│   │   ├── App.jsx                 # Entry point (unchanged)
│   │   ├── Header.jsx              # Site header (unchanged)
│   │   ├── Pizza.jsx               # Pizza card (unchanged)
│   │   ├── Cart.jsx                # Shopping cart (unchanged)
│   │   ├── PizzaOfTheDay.jsx       # Daily special (unchanged)
│   │   ├── Modal.jsx               # Modal component (unchanged)
│   │   ├── contexts.jsx            # React contexts (unchanged)
│   │   └── routes/
│   │       ├── __root.jsx          # 📝 MODIFIED — Added AgentChat import + mount
│   │       ├── index.lazy.jsx      # Home page (unchanged)
│   │       ├── order.lazy.jsx      # Order page (unchanged)
│   │       ├── contact.lazy.jsx    # Contact page (unchanged)
│   │       └── past.lazy.jsx       # Past orders (unchanged)
│   ├── index.html                  # 📝 MODIFIED — Added agent-chat.css link
│   ├── .env.development            # 📝 MODIFIED — Set VITE_API_URL
│   └── package.json
│
└── pizza-server-app/               # Fastify backend
    ├── server.js                   # 📝 MODIFIED — Added Agent API proxy routes
    ├── pizza.sqlite                # Pizza menu database
    └── package.json
```

---

## What Was Changed and Where

### New Files

| File | Location | Lines | Purpose |
|------|----------|-------|---------|
| `AgentChat.jsx` | `pizza-client-app/src/` | 260 | React chat widget component — manages session lifecycle, message sending, UI state |
| `agent-chat.css` | `pizza-client-app/public/` | 347 | Complete styling for the chat widget — floating button, chat panel, message bubbles, typing indicator, responsive design |

### Modified Files

| File | What Changed | Lines |
|------|-------------|-------|
| `server.js` | Added Agentforce proxy routes | **Line 290 onwards** — all code from the `// Agentforce Agent API Proxy Routes` comment through line 594 is new (~305 lines) |
| `__root.jsx` | Added AgentChat import and component | **Line 7** — `import AgentChat from "../AgentChat";` and **Line 21** — `<AgentChat />` |
| `index.html` | Added CSS link | **Line 8** — `<link rel="stylesheet" href="/agent-chat.css" />` |
| `.env.development` | Set API URL | `VITE_API_URL="http://localhost:3000"` |

---

## Salesforce Setup (Required)

Before running the project, you need to configure three things in your Salesforce org:

### 1. Get Your Agent ID

Your agent must be built in **Agentforce Studio** (the new builder, not legacy). Run this SOQL query in Developer Console (Setup → Developer Console → Query Editor):

```sql
SELECT Id, DeveloperName, Label FROM BotDefinition
```

Copy the `Id` value for your agent (e.g., `0XxdM000003ovarSAA`).

> **Note:** The Agent API does NOT support agents of type "Agentforce (Default)" — you need a custom agent.

### 2. Create an External Client App

1. In Setup, search for **External Client Apps Manager** → click **New External Client App**
2. Fill in:
   - **App Name:** e.g., "Pizza Agent"
   - **Contact Email:** your email
   - **Callback URL:** `https://login.salesforce.com/services/oauth2/callback`
3. Add these **OAuth Scopes:**
   - `Manage user data via APIs (api)`
   - `Perform requests at any time (refresh_token, offline_access)`
   - `Access chatbot services (chatbot_api)`
   - `Access the Salesforce API Platform (sfap_api)`
4. On the **Settings** tab:
   - Under **Flow Enablement**, check **Enable Client Credentials Flow**
   - Under **Security**, check **Issue JSON Web Token (JWT)-based access tokens for named users**
   - Uncheck all three "Require secret/PKCE" options
5. On the **Policies** tab:
   - Under **OAuth Flows and External Client App Enhancements**, check **Enable Client Credentials Flow**
   - Set **Run As (Username)** to your admin user's email
   - Change **IP Relaxation** to **Relax IP restrictions** (for development)
6. Save both tabs
7. Go back to **Settings** tab → click **Consumer Key and Secret** → copy both values

### 3. Verify Your My Domain URL

In Setup, search for **My Domain**. Copy the **Current My Domain URL** (e.g., `https://orgfarm-79c4e23d89-dev-ed.develop.my.salesforce.com`).

---

## Getting Started

### Prerequisites

- **Node.js 20** (LTS recommended — Node 24 may cause `sqlite3` build issues on Windows)
- A **Salesforce org** with Agentforce enabled and an agent built in Agentforce Studio
- The Salesforce setup completed (see above)

If you're on Windows and need to manage Node versions, install [nvm-windows](https://github.com/coreybutler/nvm-windows):

```powershell
nvm install 20
nvm use 20
```

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/padre-ginos-agentforce.git
cd padre-ginos-agentforce/18-deploying

# Install server dependencies
cd pizza-server-app
npm install

# Install client dependencies
cd ../pizza-client-app
npm install
```

### Running the App

**Terminal 1 — Start the server with Salesforce credentials:**

```bash
# Linux / macOS
export SF_MY_DOMAIN_URL="https://your-domain.my.salesforce.com"
export SF_AGENT_ID="your_agent_id"
export SF_CONSUMER_KEY="your_consumer_key"
export SF_CONSUMER_SECRET="your_consumer_secret"

# Windows PowerShell
$env:SF_MY_DOMAIN_URL="https://your-domain.my.salesforce.com"
$env:SF_AGENT_ID="your_agent_id"
$env:SF_CONSUMER_KEY="your_consumer_key"
$env:SF_CONSUMER_SECRET="your_consumer_secret"

# Start the server
cd pizza-server-app
npm run dev
```

**Terminal 2 — Start the client:**

```bash
cd pizza-client-app
npm run dev
```

Open `http://localhost:5173` in your browser. Click the red 💬 button in the bottom-right corner to start chatting with your agent.

---

## How It Works — Detailed Flow

### Step 1: User Opens the Chat

When the user clicks the 💬 button, `AgentChat.jsx` calls `startSession()`:

```javascript
const response = await fetch(`${apiUrl}/api/agent/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
```

### Step 2: Server Authenticates with Salesforce

The proxy server's `/api/agent/session` handler first mints an OAuth token:

```javascript
// getSalesforceToken() in server.js (line ~310)
const tokenUrl = `${SF_MY_DOMAIN_URL}/services/oauth2/token`;
const params = new URLSearchParams({
  grant_type: "client_credentials",
  client_id: SF_CONSUMER_KEY,
  client_secret: SF_CONSUMER_SECRET,
});
// POST → Salesforce returns { access_token: "eyJ0..." }
```

The token is a JWT containing your scopes (`sfap_api chatbot_api api`), the Run As user identity, and your org's instance URL. It's cached in memory for ~2 hours.

### Step 3: Server Creates an Agent Session

Using the token, the server calls the Agent API:

```javascript
// startAgentSession() in server.js (line ~340)
const agentUrl = `https://api.salesforce.com/einstein/ai-agent/v1/agents/${SF_AGENT_ID}/sessions`;

const response = await fetch(agentUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-session-key": sessionKey,
  },
  body: JSON.stringify({
    externalSessionKey: sessionKey,
    instanceConfig: { endpoint: SF_MY_DOMAIN_URL },
    streamingCapabilities: { chunkTypes: ["Text"] },
    bypassUser: true,
  }),
});
// Salesforce returns { sessionId: "..." }
```

Key parameters:
- **`instanceConfig.endpoint`** — tells the Agent API which Salesforce org to connect to
- **`streamingCapabilities`** — declares that the client supports text streaming (note: it's **plural** `streamingCapabilities`, not `streamingCapability`)
- **`bypassUser: true`** — since we're using client credentials (no logged-in user), this tells the API to use the Run As user from the External Client App

### Step 4: User Sends a Message

```javascript
// sendAgentMessage() in server.js (line ~390)
const msgUrl = `https://api.salesforce.com/einstein/ai-agent/v1/sessions/${sessionId}/messages`;

const response = await fetch(msgUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    message: {
      sequenceId: sequenceId || 1,  // Must increment with each message
      type: "Text",
      text: message,
    },
  }),
});
```

The response contains an array of message objects. We extract the reply text:

```javascript
let agentReply = "";
if (data.messages && Array.isArray(data.messages)) {
  for (const msg of data.messages) {
    if (msg.type === "Inform" && msg.message) {
      agentReply += msg.message;
    } else if (msg.type === "Text" && msg.text) {
      agentReply += msg.text;
    }
  }
}
```

### Step 5: Session Ends

When the user clicks the reset button (↻) or closes the chat, the server sends a DELETE request:

```javascript
// endAgentSession() in server.js (line ~480)
const endUrl = `https://api.salesforce.com/einstein/ai-agent/v1/sessions/${sessionId}`;
await fetch(endUrl, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## API Endpoints (Proxy Server)

| Method | Endpoint | Purpose | Salesforce API Called |
|--------|----------|---------|---------------------|
| POST | `/api/agent/session` | Start a new conversation | `POST /einstein/ai-agent/v1/agents/{id}/sessions` |
| POST | `/api/agent/message` | Send a message (synchronous) | `POST /einstein/ai-agent/v1/sessions/{id}/messages` |
| POST | `/api/agent/message/stream` | Send a message (SSE streaming) | `POST /einstein/ai-agent/v1/sessions/{id}/messages/stream` |
| POST | `/api/agent/end` | End a conversation | `DELETE /einstein/ai-agent/v1/sessions/{id}` |
| POST | `/api/agent/feedback` | Submit feedback on a response | `POST /einstein/ai-agent/v1/sessions/{id}/feedback` |

All Agent API calls go to `https://api.salesforce.com` (not your My Domain URL). Only the OAuth token endpoint uses your My Domain.

---

## Key Learnings and Gotchas

1. **Token endpoint vs Agent API endpoint** — OAuth tokens are minted from your My Domain URL (`your-domain.my.salesforce.com/services/oauth2/token`), but Agent API calls go to `api.salesforce.com`. Using My Domain for Agent API calls returns "URL No Longer Exists".

2. **`streamingCapabilities` is plural** — The field name in the session start request is `streamingCapabilities` (with an "s"), not `streamingCapability`. The API returns a 400 error with "Unrecognized field" if you use the singular form.

3. **Empty JSON body required** — Fastify rejects POST requests with `Content-Type: application/json` but no body. Even if the endpoint doesn't need request data, send `{}`.

4. **Node.js version matters** — `sqlite3` (used by the pizza server) has prebuilt binaries for Node 20 but may require Visual Studio Build Tools on Windows for Node 24. Use Node 20 LTS to avoid build issues.

5. **`bypassUser: true`** — Required when using client credentials flow since there's no interactive user session. The API uses the Run As user configured in the External Client App policies.

6. **Agent type restriction** — The Agent API doesn't support agents of type "Agentforce (Default)". You need a custom agent built in Agentforce Studio.

7. **IP Relaxation** — For local development, set the External Client App's IP Relaxation to "Relax IP restrictions" or your localhost requests will be blocked.

8. **Agent ID retrieval** — Agents built with the new Agentforce Builder don't show their ID in the URL. You must query the `BotDefinition` object via SOQL to get the ID.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TanStack Router, TanStack React Query |
| Backend | Node.js 20, Fastify 4, SQLite (for pizza data) |
| Salesforce | Agentforce Studio, Agent Script, Agent API v1, OAuth 2.0 Client Credentials |
| Styling | Vanilla CSS with animations |

---

## About the Agent

The agent used in this demo (`Loan_Status_Agent`) was built using **Agent Script** in Agentforce Studio. Agent Script is Salesforce's language for building Agentforce agents — it defines topics, actions, reasoning blocks, and instructions that control how the agent responds.

You can replace this with any Agentforce agent by changing the `SF_AGENT_ID` environment variable. For a pizza-themed experience, you could build an agent with topics like:
- "What pizzas do you have?" → queries the pizza menu from the database
- "What's the pizza of the day?" → returns today's special
- "Where is your restaurant?" → returns location/hours
- "What's the status of my order?" → looks up order by ID

---

## References

- [Salesforce Agent API — Getting Started](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-get-started.html)
- [Agent API — Examples](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-examples.html)
- [Brian Holt's Complete Intro to React, v9](https://github.com/btholt/citr-v9-project)

---

## License

This project is for educational and demonstration purposes. The base pizza app is from Brian Holt's Frontend Masters course. The Agentforce integration code is original.
