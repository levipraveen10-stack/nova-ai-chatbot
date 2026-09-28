import os

from dotenv import load_dotenv
from google import genai


load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")


client = genai.Client(api_key=GEMINI_API_KEY)

PRIMARY_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.8-flash",
)

FALLBACK_MODEL = os.getenv(
    "GEMINI_FALLBACK_MODEL",
    "gemini-3.5-flash-lite",
)


def generate_ai_response(prompt: str) -> str:
    last_error = None

    for model_name in [PRIMARY_MODEL, FALLBACK_MODEL]:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )

            if response.text:
                return response.text.strip()

        except Exception as exc:
            last_error = exc

    raise RuntimeError(
        f"Gemini request failed on all configured models: {last_error}"
    )


def generate_response_with_image(prompt: str, image_data: bytes, mime_type: str) -> str:
    """Generate response analyzing an image."""
    from google.genai import types
    import base64
    last_error = None

    for model_name in [PRIMARY_MODEL, FALLBACK_MODEL]:
        try:
            # Convert image data to base64 string
            image_base64 = base64.standard_b64encode(image_data).decode("utf-8")
            
            # Create Content with proper types
            content = types.Content(
                parts=[
                    types.Part(text=prompt),
                    types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_base64))
                ]
            )
            
            response = client.models.generate_content(
                model=model_name,
                contents=content
            )

            if response.text:
                return response.text.strip()

        except Exception as exc:
            last_error = exc

    raise RuntimeError(
        f"Gemini image analysis failed: {last_error}"
    )


def generate_response_with_text_file(prompt: str, file_text: str) -> str:
    """Generate response with document context."""
    combined_prompt = f"{prompt}\n\n---DOCUMENT---\n{file_text}\n---END DOCUMENT---"
    return generate_ai_response(combined_prompt)