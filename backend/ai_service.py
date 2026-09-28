import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types


load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")


client = genai.Client(api_key=GEMINI_API_KEY)


# Render environment variables override these defaults.
PRIMARY_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.6-flash",
)

FALLBACK_MODEL = os.getenv(
    "GEMINI_FALLBACK_MODEL",
    "gemini-3.5-flash-lite",
)


# Number of attempts for each model.
MAX_RETRIES = 3

# First retry waits 1 second, second waits 2 seconds.
BASE_RETRY_DELAY = 1


def is_retryable_error(exc: Exception) -> bool:
    """
    Returns True for temporary Gemini/API errors that are worth retrying.
    """

    status_code = getattr(exc, "status_code", None)

    if status_code is None:
        status_code = getattr(exc, "code", None)

    if status_code in (429, 500, 502, 503, 504):
        return True

    error_text = str(exc).lower()

    retryable_messages = [
        "429",
        "500",
        "502",
        "503",
        "504",
        "unavailable",
        "high demand",
        "resource exhausted",
        "rate limit",
        "temporarily unavailable",
        "internal server error",
        "timeout",
        "timed out",
    ]

    return any(message in error_text for message in retryable_messages)


def get_models():
    """
    Return primary and fallback models without duplicates.
    """

    models = []

    for model in [PRIMARY_MODEL, FALLBACK_MODEL]:
        if model and model not in models:
            models.append(model)

    return models


def generate_ai_response(prompt: str) -> str:
    """
    Generate a normal text response.

    Each model is retried up to 3 times for temporary errors.
    If the primary model continues failing, the fallback model is used.
    """

    last_error = None

    for model_name in get_models():

        for attempt in range(MAX_RETRIES):

            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )

                if response.text:
                    return response.text.strip()

                last_error = RuntimeError(
                    f"{model_name} returned an empty response."
                )

                # Empty response is not normally fixed by retrying.
                break

            except Exception as exc:
                last_error = exc

                print(
                    f"Gemini error on {model_name} "
                    f"(attempt {attempt + 1}/{MAX_RETRIES}): {exc}"
                )

                # Retry only temporary errors.
                if (
                    is_retryable_error(exc)
                    and attempt < MAX_RETRIES - 1
                ):
                    delay = BASE_RETRY_DELAY * (2 ** attempt)

                    print(
                        f"Retrying {model_name} in {delay} second(s)..."
                    )

                    time.sleep(delay)
                    continue

                # Move to fallback model.
                break

    raise RuntimeError(
        "Gemini request failed on all configured models: "
        f"{last_error}"
    )


def generate_response_with_image(
    prompt: str,
    image_data: bytes,
    mime_type: str,
) -> str:
    """
    Generate a response by analysing an uploaded image.
    """

    last_error = None

    content = types.Content(
        parts=[
            types.Part.from_text(text=prompt),
            types.Part.from_bytes(
                data=image_data,
                mime_type=mime_type,
            ),
        ]
    )

    for model_name in get_models():

        for attempt in range(MAX_RETRIES):

            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=content,
                )

                if response.text:
                    return response.text.strip()

                last_error = RuntimeError(
                    f"{model_name} returned an empty image response."
                )

                break

            except Exception as exc:
                last_error = exc

                print(
                    f"Gemini image error on {model_name} "
                    f"(attempt {attempt + 1}/{MAX_RETRIES}): {exc}"
                )

                if (
                    is_retryable_error(exc)
                    and attempt < MAX_RETRIES - 1
                ):
                    delay = BASE_RETRY_DELAY * (2 ** attempt)

                    print(
                        f"Retrying {model_name} in {delay} second(s)..."
                    )

                    time.sleep(delay)
                    continue

                break

    raise RuntimeError(
        "Gemini image analysis failed on all configured models: "
        f"{last_error}"
    )


def generate_response_with_text_file(
    prompt: str,
    file_text: str,
) -> str:
    """
    Generate a response using extracted text from an uploaded document.
    """

    combined_prompt = (
        f"{prompt}\n\n"
        "---DOCUMENT---\n"
        f"{file_text}\n"
        "---END DOCUMENT---"
    )

    return generate_ai_response(combined_prompt)