"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import MarkdownContent from "@/components/MarkdownContent";
import {
  ApiError,
  Chat,
  Message,
  User,
  clearAccessToken,
  createChat,
  deleteChat,
  getAccessToken,
  getChats,
  getMe,
  getMessages,
  isUnauthorizedStatus,
  renameChat,
  sendMessage,
  regenerateMessage,
  uploadFile,
  sendImageMessage,
  getUploadedFiles,
} from "@/lib/api";

const SUGGESTIONS = [
  { icon: "💡", title: "Explain a concept", prompt: "Explain artificial intelligence simply" },
  { icon: "💻", title: "Write code", prompt: "Create a simple Python program" },
  { icon: "🧠", title: "Brainstorm", prompt: "Give me 10 interesting software project ideas" },
  { icon: "📚", title: "Study assistant", prompt: "Help me understand machine learning" },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{id: number; original_name: string; mime_type: string; file_size: number}>>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const visibleChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => chat.title.toLowerCase().includes(query));
  }, [chats, search]);

  useEffect(() => {
    async function loadApp() {
      const token = getAccessToken();
      if (!token) {
        window.location.replace("/login");
        return;
      }

      try {
        const currentUser = await getMe();
        setUser(currentUser);

        const userChats = await getChats();
        setChats(userChats);

        if (userChats.length > 0) {
          setActiveChat(userChats[0]);
        }
      } catch (err) {
        if (err instanceof ApiError && isUnauthorizedStatus(err.status)) {
          window.location.replace("/login");
        } else {
          setError("Failed to load app");
        }
      } finally {
        setLoading(false);
      }
    }

    loadApp();
  }, []);

  useEffect(() => {
    if (!activeChat) return;

    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const chatMessages = await getMessages((activeChat as Chat).id);
        setMessages(chatMessages);
        
        // Load uploaded files for this chat
        const files = await getUploadedFiles((activeChat as Chat).id);
        setUploadedFiles(files || []);
      } catch (err) {
        if (err instanceof ApiError && !isUnauthorizedStatus(err.status)) {
          setError("Failed to load messages");
        }
      } finally {
        setLoadingMessages(false);
      }
    }

    loadMessages();
  }, [activeChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
  }, [message]);

  async function handleCreateChat() {
    try {
      const newChat = await createChat();
      setChats([newChat, ...chats]);
      setActiveChat(newChat);
    } catch (err) {
      setError("Failed to create chat");
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim() && !attachedFile) return;
    if (!activeChat) return;

    setSending(true);
    setError("");

    try {
      let result;

      // If there's an attached image file, use the image endpoint
      if (attachedFile && attachedFile.type.startsWith("image/")) {
        setUploadingFile(true);
        result = await sendImageMessage(activeChat.id, attachedFile, message);
        setUploadingFile(false);
      } else if (attachedFile) {
        // For non-image files (PDF, TXT, etc), upload first then send message
        setUploadingFile(true);
        const uploadRes = await uploadFile(activeChat.id, attachedFile);
        setUploadingFile(false);
        result = await sendMessage(activeChat.id, message);
      } else {
        // Regular text message
        result = await sendMessage(activeChat.id, message);
      }

      setMessages([...messages, result.user_message, result.assistant_message]);
      setMessage("");
      setAttachedFile(null);
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
      }

      const files = await getUploadedFiles(activeChat.id);
      setUploadedFiles(files || []);
    } catch (err) {
      if (!(err instanceof ApiError && isUnauthorizedStatus(err.status))) {
        setError(err instanceof ApiError ? err.message : "Failed to send message");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleRenameChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameValue.trim() || !activeChat) return;

    try {
      const updated = await renameChat(activeChat.id, renameValue);
      setChats(chats.map((c) => (c.id === activeChat.id ? updated : c)));
      setActiveChat(updated);
      setRenameOpen(false);
    } catch (err) {
      setError("Failed to rename chat");
    }
  }

  async function handleDeleteChat() {
    if (!activeChat) return;

    try {
      await deleteChat(activeChat.id);
      const remaining = chats.filter((c) => c.id !== activeChat.id);
      setChats(remaining);
      setActiveChat(remaining[0] || null);
      setDeleteOpen(false);
    } catch (err) {
      setError("Failed to delete chat");
    }
  }

  async function copyMessage(text: string, id: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Failed to copy");
    }
  }

  async function handleRegenerateMessage(messageId: number) {
    if (!activeChat) return;

    setRegeneratingId(messageId);
    try {
      const newMessage = await regenerateMessage(activeChat.id, messageId);
      setMessages(
        messages.map((m) => (m.id === messageId ? newMessage : m))
      );
    } catch (err) {
      setError("Failed to regenerate message");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleLogout() {
    clearAccessToken();
    window.location.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="mb-4 text-4xl">✨</div>
          <p className="text-zinc-400">Loading Nova AI...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <style>{`
      :root {
        --bg-primary: #0a0e17;
        --bg-secondary: #11151f;
        --bg-tertiary: #1a1f2e;
        --bg-hover: #252d3d;
        --border-color: #2a3142;
        --accent-purple: #7c3aed;
        --accent-purple-light: #a78bfa;
        --accent-glow: rgba(124, 58, 237, 0.15);
        --text-primary: #f5f7fa;
        --text-secondary: #a1aab9;
        --text-tertiary: #6b7280;
      }

      body {
        background: var(--bg-primary);
        color: var(--text-primary);
      }

      ::-webkit-scrollbar {
        width: 8px;
      }

      ::-webkit-scrollbar-track {
        background: transparent;
      }

      ::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--accent-purple);
      }

      .nova-container {
        display: flex;
        height: 100vh;
        background: var(--bg-primary);
      }

      .nova-sidebar {
        width: 280px;
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        padding: 20px;
        overflow-y: auto;
      }

      .nova-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 28px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--border-color);
      }

      .nova-logo {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-purple-light) 100%);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 20px;
        box-shadow: 0 8px 16px var(--accent-glow);
      }

      .nova-title {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }

      .nova-subtitle {
        font-size: 11px;
        color: var(--text-secondary);
        margin-top: 2px;
      }

      .nova-btn-new {
        background: linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%);
        border: none;
        color: white;
        padding: 14px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.3s ease;
        box-shadow: 0 8px 24px var(--accent-glow);
      }

      .nova-btn-new:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(124, 58, 237, 0.3);
      }

      .nova-search {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 10px 14px;
        color: var(--text-primary);
        font-size: 13px;
        margin-bottom: 20px;
        transition: all 0.3s ease;
        width: 100%;
      }

      .nova-search:focus {
        outline: none;
        border-color: var(--accent-purple);
        box-shadow: 0 0 12px var(--accent-glow);
      }

      .nova-search::placeholder {
        color: var(--text-tertiary);
      }

      .nova-chats-title {
        font-size: 12px;
        text-transform: uppercase;
        color: var(--text-secondary);
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        margin-top: 8px;
      }

      .nova-chat-list {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 20px;
      }

      .nova-chat-item {
        padding: 12px 14px;
        border-radius: 10px;
        cursor: pointer;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--text-secondary);
        transition: all 0.2s ease;
        border: 1px solid transparent;
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
      }

      .nova-chat-item:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-color);
      }

      .nova-chat-item.active {
        background: var(--accent-glow);
        border-color: var(--accent-purple);
        color: var(--accent-purple-light);
        font-weight: 600;
      }

      .nova-chat-text {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nova-profile {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: auto;
      }

      .nova-avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 16px;
        flex-shrink: 0;
      }

      .nova-user-name {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 2px;
      }

      .nova-user-email {
        font-size: 11px;
        color: var(--text-secondary);
      }

      .nova-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
      }

      .nova-top-bar {
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        padding: 16px 28px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .nova-top-title {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .nova-top-subtitle {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .nova-top-actions {
        display: flex;
        gap: 12px;
      }

      .nova-action-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .nova-action-btn:hover {
        background: var(--bg-hover);
        border-color: var(--accent-purple);
        color: var(--accent-purple-light);
      }

      .nova-chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 40px 60px;
        align-items: center;
        justify-content: flex-start;
      }

      .nova-welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin-bottom: 40px;
        margin-top: 20px;
        text-align: center;
      }

      .nova-welcome-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .nova-welcome-title {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 12px;
        background: linear-gradient(135deg, var(--text-primary), var(--accent-purple-light));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .nova-welcome-text {
        color: var(--text-secondary);
        font-size: 14px;
        margin-bottom: 32px;
      }

      .nova-suggestions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        width: 100%;
        max-width: 600px;
        margin-bottom: 40px;
      }

      .nova-suggestion {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .nova-suggestion:hover {
        border-color: var(--accent-purple);
        background: var(--accent-glow);
        transform: translateY(-4px);
        box-shadow: 0 12px 24px var(--accent-glow);
      }

      .nova-suggestion-icon {
        font-size: 24px;
      }

      .nova-suggestion-title {
        font-size: 14px;
        font-weight: 600;
      }

      .nova-suggestion-desc {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .nova-messages {
        width: 100%;
        max-width: 800px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .nova-message {
        display: flex;
        gap: 12px;
        animation: slideIn 0.4s ease;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .nova-message.user {
        justify-content: flex-end;
      }

      .nova-message-bubble {
        max-width: 70%;
        padding: 14px 18px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.6;
        word-wrap: break-word;
      }

      .nova-message.user .nova-message-bubble {
        background: linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%);
        color: white;
      }

      .nova-message.assistant .nova-message-bubble {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
      }

      .nova-message-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .nova-message.assistant:hover .nova-message-actions {
        opacity: 1;
      }

      .nova-msg-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .nova-msg-btn:hover {
        background: var(--bg-hover);
        color: var(--accent-purple-light);
        border-color: var(--accent-purple);
      }

      .nova-composer-section {
        width: 100%;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-color);
        padding: 20px 28px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .nova-file-preview {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 12px;
      }

      .nova-file-close {
        margin-left: auto;
        cursor: pointer;
        color: var(--text-secondary);
        transition: color 0.2s ease;
      }

      .nova-file-close:hover {
        color: var(--text-primary);
      }

      .nova-composer {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 12px;
        transition: all 0.3s ease;
      }

      .nova-composer:focus-within {
        border-color: var(--accent-purple);
        box-shadow: 0 0 12px var(--accent-glow);
      }

      .nova-composer-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 18px;
        transition: all 0.2s ease;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .nova-composer-btn:hover {
        color: var(--accent-purple-light);
        background: var(--bg-hover);
      }

      .nova-textarea {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-primary);
        font-size: 14px;
        outline: none;
        resize: none;
        max-height: 120px;
        font-family: inherit;
        padding: 8px 0;
      }

      .nova-textarea::placeholder {
        color: var(--text-tertiary);
      }

      .nova-send-btn {
        background: linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%);
        border: none;
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 600;
        flex-shrink: 0;
      }

      .nova-send-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px var(--accent-glow);
      }

      .nova-send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nova-files-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .nova-file-card {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 11px;
        display: inline-block;
      }

      .nova-modal {
        position: fixed;
        inset: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        padding: 16px;
      }

      .nova-modal-content {
        width: 100%;
        max-width: 428px;
        border-radius: 12px;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        padding: 24px;
      }

      .nova-modal-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 16px;
      }

      .nova-modal-input {
        width: 100%;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 12px 14px;
        border-radius: 10px;
        font-size: 14px;
        margin-bottom: 20px;
      }

      .nova-modal-input:focus {
        outline: none;
        border-color: var(--accent-purple);
        box-shadow: 0 0 12px var(--accent-glow);
      }

      .nova-modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .nova-modal-btn {
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .nova-modal-cancel {
        background: transparent;
        color: var(--text-secondary);
      }

      .nova-modal-cancel:hover {
        background: var(--bg-hover);
      }

      .nova-modal-save {
        background: linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%);
        color: white;
        font-weight: 600;
      }

      .nova-modal-save:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px var(--accent-glow);
      }

      .nova-modal-delete {
        background: #dc2626;
        color: white;
        font-weight: 600;
      }

      .nova-modal-delete:hover {
        background: #b91c1c;
      }

      .nova-thinking {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 14px 18px;
        font-size: 14px;
        color: var(--text-secondary);
      }

      .nova-image-thumb {
        width: 80px;
        height: 80px;
        border-radius: 8px;
        object-fit: cover;
        margin-top: 8px;
      }

      .nova-error {
        background: #7f1d1d;
        border: 1px solid #dc2626;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 12px;
        font-size: 13px;
        color: #fca5a5;
      }
    `}</style>
    <div className="nova-container">
      {/* SIDEBAR */}
      <div className="nova-sidebar">
        {/* Header */}
        <div className="nova-header">
          <div className="nova-logo">✨</div>
          <div>
            <div className="nova-title">Nova AI</div>
            <div className="nova-subtitle">Premium Assistant</div>
          </div>
        </div>

        {/* New Chat Button */}
        <button className="nova-btn-new" onClick={handleCreateChat}>
          <span>+</span> New Chat
        </button>

        {/* Search */}
        <input
          type="text"
          className="nova-search"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Chats Section */}
        <div>
          <div className="nova-chats-title">Recent</div>
          <div className="nova-chat-list">
            {visibleChats.map((chat) => (
              <div
                key={chat.id}
                className={`nova-chat-item ${activeChat?.id === chat.id ? "active" : ""}`}
                onClick={() => setActiveChat(chat)}
              >
                <span>💬</span>
                <span className="nova-chat-text">{chat.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User Profile */}
        {user && (
          <div className="nova-profile">
            <div className="nova-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div className="nova-user-name">{user.name}</div>
              <div className="nova-user-email">{user.email}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "14px",
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="Logout"
            >
              <span>🚪</span>
              <span style={{ fontSize: "11px" }}>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="nova-main">
        {/* Top Header */}
        {activeChat && (
          <div className="nova-top-bar">
            <div>
              <div className="nova-top-title">{activeChat.title}</div>
              <div className="nova-top-subtitle">Gemini AI</div>
            </div>
            <div className="nova-top-actions">
              <button
                className="nova-action-btn"
                onClick={() => {
                  setRenameValue(activeChat.title);
                  setRenameOpen(true);
                }}
              >
                📝 Rename
              </button>
              <button
                className="nova-action-btn"
                onClick={() => setDeleteOpen(true)}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="nova-chat-area">
          <div className="nova-messages">
            {/* Show welcome on new chat */}
            {messages.length === 0 && !loadingMessages && (
              <div className="nova-welcome">
                <div className="nova-welcome-icon">✨</div>
                <h2 className="nova-welcome-title">How can I help you today?</h2>
                <p className="nova-welcome-text">Ask me anything, or choose a suggestion below</p>

                <div className="nova-suggestions">
                  {SUGGESTIONS.map((suggestion, index) => (
                    <div
                      key={index}
                      className="nova-suggestion"
                      onClick={() => setMessage(suggestion.prompt)}
                    >
                      <span className="nova-suggestion-icon">{suggestion.icon}</span>
                      <h4 className="nova-suggestion-title">{suggestion.title}</h4>
                      <p className="nova-suggestion-desc">
                        {suggestion.prompt.substring(0, 30)}...
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Display Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  📎 Uploaded Files
                </div>
                <div className="nova-files-grid">
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="nova-file-card">
                      {file.original_name} ({(file.file_size / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`nova-message ${msg.role === "user" ? "user" : "assistant"}`}
              >
                {msg.role === "assistant" ? (
                  <div style={{ width: "100%" }}>
                    <div className="nova-message-bubble">
                      <MarkdownContent content={msg.content} />
                    </div>
                    <div className="nova-message-actions">
                      <button
                        className="nova-msg-btn"
                        onClick={() => copyMessage(msg.content, msg.id)}
                      >
                        {copiedId === msg.id ? "Copied ✓" : "📋 Copy"}
                      </button>
                      <button
                        className="nova-msg-btn"
                        disabled={regeneratingId === msg.id}
                        onClick={() => handleRegenerateMessage(msg.id)}
                      >
                        {regeneratingId === msg.id ? "Regenerating..." : "🔄 Regenerate"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="nova-message-bubble">{msg.content}</div>
                    {uploadedFiles.length > 0 && (
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {uploadedFiles.map((file) => {
                          if (file.mime_type.startsWith("image/")) {
                            return (
                              <img
                                key={file.id}
                                src={`http://127.0.0.1:8000/api/files/${file.id}`}
                                alt={file.original_name}
                                style={{
                                  maxWidth: "200px",
                                  borderRadius: "8px",
                                  border: "1px solid var(--border-color)",
                                }}
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="nova-message assistant">
                <div className="nova-thinking">Nova AI is thinking...</div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer Section */}
        <div className="nova-composer-section">
          {error && <div className="nova-error">❌ {error}</div>}

          <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {attachedFile && (
              <div className="nova-file-preview">
                <span>📎</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filePreviewUrl && attachedFile.type.startsWith("image/") && (
                    <img
                      src={filePreviewUrl}
                      alt="preview"
                      className="nova-image-thumb"
                    />
                  )}
                  <span>
                    {attachedFile.name} ({(attachedFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <span
                  className="nova-file-close"
                  onClick={() => {
                    setAttachedFile(null);
                    if (filePreviewUrl) {
                      URL.revokeObjectURL(filePreviewUrl);
                      setFilePreviewUrl(null);
                    }
                  }}
                >
                  ✕
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <div className="nova-composer">
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="nova-composer-btn"
                  onClick={() => document.getElementById("file-input")?.click()}
                  disabled={sending || uploadingFile}
                  title="Attach file"
                >
                  📎
                </button>
                <button
                  type="button"
                  className="nova-composer-btn"
                  onClick={() =>
                    document.getElementById("image-input")?.click()
                  }
                  disabled={sending || uploadingFile}
                  title="Upload image"
                >
                  🖼️
                </button>
              </div>

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e as unknown as FormEvent<HTMLFormElement>);
                  }
                }}
                placeholder="Ask Nova AI anything..."
                className="nova-textarea"
                rows={1}
                disabled={sending || regeneratingId !== null || uploadingFile}
              />

              <button
                type="submit"
                className="nova-send-btn"
                disabled={(!message.trim() && !attachedFile) || sending || uploadingFile}
              >
                {sending || uploadingFile ? "..." : "↑"}
              </button>
              </div>
            </div>

            <input
              type="file"
              id="file-input"
              accept=".pdf,.txt,.csv,.docx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) {
                  setAttachedFile(file);
                  if (file.type.startsWith("image/")) {
                    const url = URL.createObjectURL(file);
                    setFilePreviewUrl(url);
                  } else {
                    setFilePreviewUrl(null);
                  }
                }
              }}
              style={{ display: "none" }}
            />

            <input
              type="file"
              id="image-input"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) {
                  setAttachedFile(file);
                  const url = URL.createObjectURL(file);
                  setFilePreviewUrl(url);
                }
              }}
              style={{ display: "none" }}
            />

            <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-tertiary)", marginTop: "8px" }}>
              AI can make mistakes. Check important information.
            </p>
          </form>
        </div>
      </div>

      {/* Rename Modal */}
      {renameOpen && activeChat && (
        <div className="nova-modal">
          <form
            onSubmit={handleRenameChat}
            className="nova-modal-content"
          >
            <div className="nova-modal-title">Rename chat</div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="nova-modal-input"
            />
            <div className="nova-modal-buttons">
              <button
                type="button"
                className="nova-modal-btn nova-modal-cancel"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="nova-modal-btn nova-modal-save">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Modal */}
      {deleteOpen && activeChat && (
        <div className="nova-modal">
          <div className="nova-modal-content">
            <div className="nova-modal-title">Delete chat</div>
            <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
              Delete "{activeChat.title}"? This cannot be undone.
            </p>
            <div className="nova-modal-buttons">
              <button
                className="nova-modal-btn nova-modal-cancel"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="nova-modal-btn nova-modal-delete"
                onClick={() => handleDeleteChat()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
