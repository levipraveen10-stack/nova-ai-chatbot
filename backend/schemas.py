from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class ChatCreate(BaseModel):
    title: str = "New Chat"


class ChatUpdate(BaseModel):
    title: str


class ChatResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SendMessageResponse(BaseModel):
    user_message: MessageResponse
    assistant_message: MessageResponse


class FileResponse(BaseModel):
    id: int
    user_id: int
    chat_id: int
    original_name: str
    mime_type: str
    file_size: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)