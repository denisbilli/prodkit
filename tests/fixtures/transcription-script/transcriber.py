import logging
import os

from openai import OpenAI

logger = logging.getLogger(__name__)


def transcribe(path: str) -> str:
    logger.info("transcribing %s", path)
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    with open(path, "rb") as audio:
        return client.audio.transcriptions.create(model="whisper-1", file=audio).text
