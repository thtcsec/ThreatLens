from __future__ import annotations

from typing import Iterable, List, Optional
import os

import google.generativeai as genai

from core.prompts import ANALYSIS_PROMPT_TEMPLATE, SYSTEM_PROMPT


class GeminiConfigError(Exception):
    pass


class GeminiGenerationError(Exception):
    pass


class GeminiSecurityService:
    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise GeminiConfigError("Missing GEMINI_API_KEY")

        model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model_name=model_name)

    def _build_prompt(self, user_message: str, contexts: List[str]) -> str:
        context_block = "\n\n".join(contexts) if contexts else "No RAG context found in vector store."

        analysis_prompt = ANALYSIS_PROMPT_TEMPLATE.format(
            context=context_block,
            user_input=user_message,
        )
        return f"{SYSTEM_PROMPT}\n\n{analysis_prompt}"

    def generate_analysis(self, user_message: str, contexts: List[str]) -> str:
        prompt = self._build_prompt(user_message, contexts)

        try:
            response = self._model.generate_content(prompt)
            text = getattr(response, "text", None)
            if text:
                return text
            return "No response text returned by Gemini model."
        except Exception as exc:
            raise GeminiGenerationError(f"Gemini generate_content failed: {exc}") from exc

    def stream_analysis(self, user_message: str, contexts: List[str]) -> Iterable[str]:
        prompt = self._build_prompt(user_message, contexts)

        try:
            response_stream = self._model.generate_content(prompt, stream=True)
            for chunk in response_stream:
                text = getattr(chunk, "text", "")
                if text:
                    yield text
        except Exception as exc:
            raise GeminiGenerationError(f"Gemini stream generation failed: {exc}") from exc
