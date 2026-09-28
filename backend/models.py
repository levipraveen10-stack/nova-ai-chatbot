from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    chats = relationship(
        "Chat",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(
        String(255),
        nullable=False,
        default="New Chat",
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="chats",
    )

    messages = relationship(
        "Message",
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)

    chat_id = Column(
        Integer,
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role = Column(
        String(20),
        nullable=False,
    )

    content = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    chat = relationship(
        "Chat",
        back_populates="messages",
    )


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    chat_id = Column(
        Integer,
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False, unique=True)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    extracted_text = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user = relationship("User")
    chat = relationship("Chat")


Index(
    "ix_messages_chat_created",
    Message.chat_id,
    Message.created_at,
)
