import os
import mimetypes
from pathlib import Path
import uuid
import base64

# Create upload directory
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed MIME types
ALLOWED_MIMES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "image/png": ".png",
    "image/jpeg": [".jpg", ".jpeg"],  # Support both
    "image/webp": ".webp",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def validate_file(filename: str, mime_type: str, size: int) -> tuple[bool, str]:
    """Validate file before saving."""
    # Check size
    if size > MAX_FILE_SIZE:
        return False, "File too large (max 10MB)"

    # Check MIME type
    if mime_type not in ALLOWED_MIMES:
        return False, f"Unsupported file type: {mime_type}"

    # Check extension matches MIME
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = ALLOWED_MIMES.get(mime_type, "")
    
    # Handle both string and list of extensions
    if isinstance(allowed_exts, list):
        if ext and ext not in allowed_exts:
            return False, "File extension does not match type"
    else:
        if ext and ext != allowed_exts:
            return False, "File extension does not match type"

    return True, ""


def save_file(file_bytes: bytes, original_name: str, mime_type: str) -> str:
    """Save file and return stored filename."""
    allowed_exts = ALLOWED_MIMES.get(mime_type, "")
    
    # Handle both string and list of extensions
    if isinstance(allowed_exts, list):
        ext = allowed_exts[0]  # Use first option (e.g., .jpg for jpeg)
    else:
        ext = allowed_exts
    
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / stored_name

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    return stored_name


def get_file_path(stored_name: str) -> Path:
    """Get full path to stored file."""
    return UPLOAD_DIR / stored_name


def extract_text_from_file(stored_name: str, mime_type: str) -> str:
    """Extract text from uploaded file."""
    file_path = get_file_path(stored_name)

    if not file_path.exists():
        return ""

    if mime_type == "text/plain":
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    elif mime_type == "text/csv":
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    elif mime_type == "application/pdf":
        try:
            import PyPDF2

            text = ""
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            return text[:5000]  # Limit to 5000 chars
        except Exception:
            return "[PDF extraction failed]"

    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            from docx import Document

            doc = Document(file_path)
            text = "\n".join([para.text for para in doc.paragraphs])
            return text[:5000]  # Limit to 5000 chars
        except Exception:
            return "[DOCX extraction failed]"

    return ""


def get_image_base64(stored_name: str) -> str:
    """Get image as base64 for frontend display."""
    file_path = get_file_path(stored_name)
    if not file_path.exists():
        return ""
    
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def delete_file(stored_name: str) -> bool:
    """Delete stored file."""
    file_path = get_file_path(stored_name)
    try:
        if file_path.exists():
            file_path.unlink()
            return True
    except Exception:
        pass
    return False
