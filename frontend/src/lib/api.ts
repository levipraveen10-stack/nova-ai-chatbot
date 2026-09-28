const TOKEN_KEY = "access_token";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type User = {
  id: number;
  name: string;
  email: string;
};

export type Chat = {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: number;
  chat_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type SendMessageResponse = {
  user_message: Message;
  assistant_message: Message;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isUnauthorizedStatus(status: number) {
  return status === 401 || status === 403;
}

function parseDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "msg" in item &&
          typeof item.msg === "string"
        ) {
          return item.msg;
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (parts.length > 0) {
      return parts.join(". ");
    }
  }

  return null;
}

function messageForStatus(status: number, fallback?: string) {
  if (fallback) {
    return fallback;
  }

  switch (status) {
    case 401:
      return "Invalid email or password";
    case 403:
      return "Your session is no longer valid. Please sign in again.";
    case 404:
      return "The requested item was not found";
    case 409:
      return "Email is already registered";
    case 422:
      return "Please check the information you entered";
    case 500:
      return "The server ran into a problem. Please try again.";
    case 502:
      return "The AI service is unavailable right now. Please try again.";
    default:
      return "Something went wrong";
  }
}

async function readErrorMessage(response: Response) {
  try {
    const data: unknown = await response.json();

    if (typeof data === "object" && data !== null && "detail" in data) {
      return parseDetail(data.detail);
    }
  } catch {
    // Response body was empty or not JSON.
  }

  return null;
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  clearAccessToken();

  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  redirectOnUnauthorized?: boolean;
};

async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    redirectOnUnauthorized = true,
  } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getAccessToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_URL}. Confirm the backend is running.`,
      0
    );
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    const message = messageForStatus(response.status, detail ?? undefined);

    if (auth && redirectOnUnauthorized && isUnauthorizedStatus(response.status)) {
      redirectToLogin();
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiRequest<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
    redirectOnUnauthorized: false,
  });
}

export async function register(name: string, email: string, password: string) {
  return apiRequest<User>("/api/auth/register", {
    method: "POST",
    body: { name, email, password },
    auth: false,
    redirectOnUnauthorized: false,
  });
}

export async function getMe(redirectOnUnauthorized = true) {
  return apiRequest<User>("/api/auth/me", {
    redirectOnUnauthorized,
  });
}

export async function getChats() {
  return apiRequest<Chat[]>("/api/chats");
}

export async function createChat(title = "New Chat") {
  return apiRequest<Chat>("/api/chats", {
    method: "POST",
    body: { title },
  });
}

export async function getMessages(chatId: number) {
  return apiRequest<Message[]>(`/api/chats/${chatId}/messages`);
}

export async function sendMessage(chatId: number, content: string) {
  return apiRequest<SendMessageResponse>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    body: { content },
  });
}

export async function renameChat(chatId: number, title: string) {
  return apiRequest<Chat>(`/api/chats/${chatId}`, {
    method: "PATCH",
    body: { title },
  });
}

export async function deleteChat(chatId: number) {
  return apiRequest<void>(`/api/chats/${chatId}`, {
    method: "DELETE",
  });
}

export async function regenerateMessage(chatId: number, messageId: number) {
  return apiRequest<Message>(`/api/chats/${chatId}/messages/${messageId}/regenerate`, {
    method: "POST",
  });
}

export async function uploadFile(chatId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const token = getAccessToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/chats/${chatId}/files/upload`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_URL}. Confirm the backend is running.`,
      0
    );
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    const message = messageForStatus(response.status, detail ?? undefined);
    throw new ApiError(message, response.status);
  }

  return response.json();
}

export async function sendImageMessage(chatId: number, imageFile: File, prompt: string = "") {
  const formData = new FormData();
  formData.append("image_file", imageFile);
  formData.append("content", prompt);

  const token = getAccessToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/chats/${chatId}/messages/image`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_URL}. Confirm the backend is running.`,
      0
    );
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    const message = messageForStatus(response.status, detail ?? undefined);

    if (isUnauthorizedStatus(response.status)) {
      redirectToLogin();
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<SendMessageResponse>;
}

export async function getUploadedFiles(chatId: number) {
  return apiRequest<Array<{id: number; original_name: string; mime_type: string; file_size: number}>>(`/api/chats/${chatId}/files`);
}
