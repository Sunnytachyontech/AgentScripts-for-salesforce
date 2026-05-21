import { useState, useRef, useEffect, useCallback } from "react";

const apiUrl = import.meta.env.VITE_API_URL;

export default function AgentChat() {
const [isOpen, setIsOpen] = useState(false);
const [messages, setMessages] = useState([]);
const [input, setInput] = useState("");
const [isLoading, setIsLoading] = useState(false);
const [sessionId, setSessionId] = useState(null);
const [sequenceId, setSequenceId] = useState(1);
const [error, setError] = useState(null);
const messagesEndRef = useRef(null);
const inputRef = useRef(null);

// Auto-scroll to bottom when messages change
useEffect(() => {
messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);

// Focus input when chat opens
useEffect(() => {
if (isOpen && inputRef.current) {
    inputRef.current.focus();
}
}, [isOpen]);

// Start a session when chat opens for the first time
const startSession = useCallback(async () => {
try {
    setError(null);
    const response = await fetch(`${apiUrl}/api/agent/session`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({}),
});

    if (!response.ok) {
    throw new Error("Failed to connect to agent");
    }

    const data = await response.json();
    setSessionId(data.sessionId);
    setSequenceId(1);
    setMessages([
    {
        role: "agent",
        text: "Hi! I'm your assistant. Ask me about our menu, hours, specials, or anything else!",
    },
    ]);
} catch (err) {
    console.error("Session start error:", err);
    setError("Could not connect to the assistant. Please try again.");
    setMessages([]);
}
}, []);

const handleOpen = useCallback(() => {
setIsOpen(true);
if (!sessionId) {
    startSession();
}
}, [sessionId, startSession]);

const handleClose = useCallback(async () => {
setIsOpen(false);
// Optionally end the session when closing
// Uncomment below if you want a fresh session each time:
// if (sessionId) {
//   try {
//     await fetch(`${apiUrl}/api/agent/end`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ sessionId }),
//     });
//   } catch (e) { /* ignore */ }
//   setSessionId(null);
//   setMessages([]);
//   setSequenceId(1);
// }
}, []);

const sendMessage = useCallback(
async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || !sessionId) return;

    const userMsg = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
    const response = await fetch(`${apiUrl}/api/agent/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        sessionId,
        message: trimmed,
        sequenceId,
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to get response");
    }

    const data = await response.json();
    setSequenceId((prev) => prev + 1);

    setMessages((prev) => [
        ...prev,
        { role: "agent", text: data.reply },
    ]);
    } catch (err) {
    console.error("Send message error:", err);
    setMessages((prev) => [
        ...prev,
        {
        role: "agent",
        text: "Sorry, I had trouble processing that. Please try again.",
        isError: true,
        },
    ]);
    } finally {
    setIsLoading(false);
    }
},
[input, isLoading, sessionId, sequenceId],
);

const handleNewSession = useCallback(async () => {
if (sessionId) {
    try {
    await fetch(`${apiUrl}/api/agent/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
    });
    } catch (e) {
    /* ignore */
    }
}
setSessionId(null);
setMessages([]);
setSequenceId(1);
setError(null);
startSession();
}, [sessionId, startSession]);

return (
<>
    {/* Floating chat button */}
    {!isOpen && (
    <button
        className="agent-chat-fab"
        onClick={handleOpen}
        aria-label="Open chat assistant"
    >
        💬
    </button>
    )}

    {/* Chat panel */}
    {isOpen && (
    <div className="agent-chat-panel">
        <div className="agent-chat-header">
        <div className="agent-chat-header-info">
            <span className="agent-chat-avatar">🍕</span>
            <div>
            <h3>Padre Gino's Assistant</h3>
            <span className="agent-chat-status">
                {sessionId ? "● Online" : "○ Connecting..."}
            </span>
            </div>
        </div>
        <div className="agent-chat-header-actions">
            <button
            className="agent-chat-reset"
            onClick={handleNewSession}
            title="New conversation"
            aria-label="Start new conversation"
            >
            ↻
            </button>
            <button
            className="agent-chat-close"
            onClick={handleClose}
            aria-label="Close chat"
            >
            ✕
            </button>
        </div>
        </div>

        <div className="agent-chat-messages">
        {error && (
            <div className="agent-chat-error">
            <p>{error}</p>
            <button onClick={startSession}>Retry</button>
            </div>
        )}

        {messages.map((msg, i) => (
            <div
            key={i}
            className={`agent-chat-msg agent-chat-msg-${msg.role}${msg.isError ? " agent-chat-msg-error" : ""}`}
            >
            {msg.role === "agent" && (
                <span className="agent-chat-msg-avatar">🍕</span>
            )}
            <div className="agent-chat-msg-bubble">
                <p>{msg.text}</p>
            </div>
            </div>
        ))}

        {isLoading && (
            <div className="agent-chat-msg agent-chat-msg-agent">
            <span className="agent-chat-msg-avatar">🍕</span>
            <div className="agent-chat-msg-bubble agent-chat-typing">
                <span></span>
                <span></span>
                <span></span>
            </div>
            </div>
        )}

        <div ref={messagesEndRef} />
        </div>

        <div className="agent-chat-input-area">
        <form onSubmit={sendMessage}>
            <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
                sessionId
                ? "Ask about our menu, hours, specials..."
                : "Connecting..."
            }
            disabled={!sessionId || isLoading}
            />
            <button
            type="submit"
            disabled={!input.trim() || !sessionId || isLoading}
            aria-label="Send message"
            >
            ➤
            </button>
        </form>
        </div>
    </div>
    )}
</>
);
}