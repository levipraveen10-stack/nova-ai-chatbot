from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import User, Chat, Message, UploadedFile
from schemas import (
    UserCreate,
    UserResponse,
    LoginRequest,
    TokenResponse,
    ChatCreate,
    ChatUpdate,
    ChatResponse,
    MessageCreate,
    MessageResponse,
    SendMessageResponse,
    FileResponse,
)
from security import hash_password, verify_password
from auth import create_access_token, get_current_user
from ai_service import generate_ai_response
from file_handler import validate_file, save_file, extract_text_from_file, delete_file


app = FastAPI(
    title="AI Chatbot API",
    description="Backend API for the AI Chatbot application",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://nova-ai-chatbot-xi.vercel.app",
    ],
    allow_origin_regex=r"https://nova-ai-chatbot(?:-[a-z0-9]+)*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# BASIC ROUTES
# =========================================================

@app.get("/")
def home():
    return {
        "message": "AI Chatbot Backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# =========================================================
# AUTHENTICATION
# =========================================================

@app.post(
    "/api/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    email = str(user_data.email).lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    new_user = User(
        name=user_data.name.strip(),
        email=email,
        password_hash=hash_password(user_data.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
)
def login_user(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(login_data.email).lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if not user or not verify_password(
        login_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(user.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get(
    "/api/auth/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


# =========================================================
# CHAT MANAGEMENT
# =========================================================

@app.post(
    "/api/chats",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_chat(
    chat_data: ChatCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_chat = Chat(
        user_id=current_user.id,
        title=chat_data.title.strip() or "New Chat",
    )

    db.add(new_chat)
    db.commit()
    db.refresh(new_chat)

    return new_chat


@app.get(
    "/api/chats",
    response_model=list[ChatResponse],
)
def get_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chats = db.scalars(
        select(Chat)
        .where(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
    ).all()

    return chats


@app.get(
    "/api/chats/{chat_id}",
    response_model=ChatResponse,
)
def get_chat(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    return chat


@app.patch(
    "/api/chats/{chat_id}",
    response_model=ChatResponse,
)
def rename_chat(
    chat_id: int,
    chat_data: ChatUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    new_title = chat_data.title.strip()

    if not new_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat title cannot be empty",
        )

    chat.title = new_title
    chat.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(chat)

    return chat


@app.delete(
    "/api/chats/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_chat(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    db.delete(chat)
    db.commit()

    return None


# =========================================================
# MESSAGE HISTORY
# =========================================================

@app.get(
    "/api/chats/{chat_id}/messages",
    response_model=list[MessageResponse],
)
def get_messages(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    messages = db.scalars(
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
    ).all()

    return messages


# =========================================================
# SEND MESSAGE + GEMINI
# =========================================================

@app.post(
    "/api/chats/{chat_id}/messages",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    chat_id: int,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check that this chat belongs to the logged-in user.
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    content = message_data.content.strip()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    # Load already-saved conversation history.
    previous_messages = db.scalars(
        select(Message)
        .where(Message.chat_id == chat.id)
        .order_by(Message.created_at.asc())
    ).all()

    history_parts = []

    for message in previous_messages:
        if message.role == "user":
            history_parts.append(
                f"User: {message.content}"
            )
        else:
            history_parts.append(
                f"Assistant: {message.content}"
            )

    # Add current user message to Gemini prompt.
    # Do not save it yet.
    history_parts.append(
        f"User: {content}"
    )

    prompt = (
        "You are a helpful, accurate AI assistant.\n\n"
        "Answer simple questions clearly and briefly. "
        "For complex questions, provide detailed explanations. "
        "For coding questions, provide clean code and explain it. "
        "If the user asks for step-by-step instructions, give clear steps. "
        "Use previous conversation context when relevant.\n\n"
        "Conversation:\n"
        + "\n".join(history_parts)
        + "\nAssistant:"
    )

    # Check if there are uploaded documents in this chat.
    uploaded_files = db.scalars(
        select(UploadedFile)
        .where(UploadedFile.chat_id == chat.id)
        .order_by(UploadedFile.created_at.desc())
    ).all()

    # Ask Gemini first.
    try:
        # If there are documents and the question seems to relate to them, use document context
        if uploaded_files and any(keyword in content.lower() for keyword in ["document", "pdf", "file", "this", "what", "summarize", "explain", "find", "about", "section"]):
            # Combine document text from most recent relevant file
            combined_doc_text = ""
            for doc_file in uploaded_files:
                if doc_file.extracted_text:
                    # Use first ~2000 chars of extracted text to avoid overwhelming Gemini
                    combined_doc_text = doc_file.extracted_text[:2000]
                    break
            
            if combined_doc_text:
                # Use document-aware response
                from ai_service import generate_response_with_text_file
                ai_text = generate_response_with_text_file(prompt, combined_doc_text)
            else:
                ai_text = generate_ai_response(prompt)
        else:
            ai_text = generate_ai_response(prompt)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {str(exc)}",
        )

    # Gemini succeeded.
    # Now save both user + assistant messages.
    user_message = Message(
        chat_id=chat.id,
        role="user",
        content=content,
    )

    assistant_message = Message(
        chat_id=chat.id,
        role="assistant",
        content=ai_text,
    )

    db.add(user_message)
    db.add(assistant_message)

    # Automatically create title for a new chat.
    if chat.title == "New Chat":
        chat.title = content[:50]

        if len(content) > 50:
            chat.title += "..."

    chat.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save conversation",
        )

    db.refresh(user_message)
    db.refresh(assistant_message)
    db.refresh(chat)

    return {
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


@app.post(
    "/api/chats/{chat_id}/messages/{message_id}/regenerate",
    response_model=MessageResponse,
)
def regenerate_message(
    chat_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check that this chat belongs to the logged-in user.
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    # Find the message to regenerate.
    target_message = db.scalar(
        select(Message).where(
            Message.id == message_id,
            Message.chat_id == chat_id,
            Message.role == "assistant",
        )
    )

    if not target_message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found or is not an assistant message",
        )

    # Load conversation history UP TO (but not including) the target assistant message by ID.
    previous_messages = db.scalars(
        select(Message)
        .where(
            Message.chat_id == chat_id,
            Message.id < target_message.id,
        )
        .order_by(Message.id.asc())
    ).all()

    history_parts = []

    for message in previous_messages:
        if message.role == "user":
            history_parts.append(
                f"User: {message.content}"
            )
        else:
            history_parts.append(
                f"Assistant: {message.content}"
            )

    prompt = (
        "You are a helpful, accurate AI assistant.\n\n"
        "Answer simple questions clearly and briefly. "
        "For complex questions, provide detailed explanations. "
        "For coding questions, provide clean code and explain it. "
        "If the user asks for step-by-step instructions, give clear steps. "
        "Use previous conversation context when relevant.\n\n"
        "Conversation:\n"
        + "\n".join(history_parts)
        + "\nAssistant:"
    )

    # Ask Gemini.
    try:
        ai_text = generate_ai_response(prompt)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {str(exc)}",
        )

    # Update the target message.
    target_message.content = ai_text
    chat.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save regenerated message",
        )

    db.refresh(target_message)
    db.refresh(chat)

    return target_message



# =========================================================
# FILE UPLOAD
# =========================================================

@app.post(
    "/api/chats/{chat_id}/files/upload",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    chat_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify chat exists and belongs to user
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    # Get MIME type
    mime_type = file.content_type or "application/octet-stream"

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Validate file
    is_valid, error_msg = validate_file(file.filename or "file", mime_type, file_size)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    # Save file
    stored_name = save_file(content, file.filename or "file", mime_type)

    # Extract text
    extracted_text = extract_text_from_file(stored_name, mime_type)

    # Save to database
    uploaded_file = UploadedFile(
        user_id=current_user.id,
        chat_id=chat_id,
        original_name=file.filename or "file",
        stored_name=stored_name,
        mime_type=mime_type,
        file_size=file_size,
        extracted_text=extracted_text if extracted_text else None,
    )

    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)

    return uploaded_file


@app.get(
    "/api/chats/{chat_id}/files",
    response_model=list[FileResponse],
)
def get_files(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify chat exists and belongs to user
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    files = db.scalars(
        select(UploadedFile)
        .where(UploadedFile.chat_id == chat_id)
        .order_by(UploadedFile.created_at.desc())
    ).all()

    return files


@app.delete(
    "/api/chats/{chat_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_uploaded_file(
    chat_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify chat exists and belongs to user
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    # Find and delete file
    uploaded_file = db.scalar(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.chat_id == chat_id,
        )
    )

    if not uploaded_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    # Delete from disk
    delete_file(uploaded_file.stored_name)

    # Delete from database
    db.delete(uploaded_file)
    db.commit()

    return None


@app.get(
    "/api/files/{file_id}",
)
def get_file_data(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get file data (for images/documents) with authentication."""
    # Find file and verify user owns it
    uploaded_file = db.scalar(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
        )
    )

    if not uploaded_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    # Get file path and serve
    from pathlib import Path
    from fastapi.responses import FileResponse as FastAPIFileResponse
    
    file_path = Path(__file__).parent / "uploads" / uploaded_file.stored_name
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk",
        )
    
    # Serve file with correct MIME type
    return FastAPIFileResponse(
        path=file_path,
        media_type=uploaded_file.mime_type,
        filename=uploaded_file.original_name,
    )



# =========================================================
# IMAGE MESSAGES WITH VISION
# =========================================================

@app.post(
    "/api/chats/{chat_id}/messages/image",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_image_message(
    chat_id: int,
    content: str = "",
    image_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from ai_service import generate_response_with_image
    from file_handler import validate_file, save_file

    # Verify chat exists
    chat = db.scalar(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == current_user.id,
        )
    )

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found",
        )

    mime_type = image_file.content_type or "image/jpeg"
    image_data = await image_file.read()

    # Validate image
    is_valid, error_msg = validate_file(image_file.filename or "image", mime_type, len(image_data))
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    # Save image file
    stored_name = save_file(image_data, image_file.filename or "image.jpg", mime_type)

    # Save to database
    uploaded_file = UploadedFile(
        user_id=current_user.id,
        chat_id=chat_id,
        original_name=image_file.filename or "image.jpg",
        stored_name=stored_name,
        mime_type=mime_type,
        file_size=len(image_data),
        extracted_text=None,
    )
    db.add(uploaded_file)
    db.flush()

    user_message_text = content if content.strip() else f"Image: {image_file.filename or 'image'}"

    # Save user message (plain message, no file_id reference)
    user_message = Message(
        chat_id=chat.id,
        role="user",
        content=user_message_text,
    )
    db.add(user_message)
    db.flush()

    # Generate response with image
    prompt = content.strip() if content.strip() else "Please analyze this image"

    try:
        ai_text = generate_response_with_image(prompt, image_data, mime_type)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vision analysis failed: {str(exc)}",
        )

    # Save assistant message
    assistant_message = Message(
        chat_id=chat.id,
        role="assistant",
        content=ai_text,
    )
    db.add(assistant_message)

    # Auto-title new chat
    if chat.title == "New Chat":
        chat.title = user_message_text[:50]
        if len(user_message_text) > 50:
            chat.title += "..."

    chat.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save message",
        )

    db.refresh(user_message)
    db.refresh(assistant_message)
    db.refresh(chat)

    return {
        "user_message": user_message,
        "assistant_message": assistant_message,
    }
