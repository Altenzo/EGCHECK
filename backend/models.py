from pydantic import BaseModel
from typing import List, Optional

class VerifyRequest(BaseModel):
    text: str
    images: List[str]  # Base64 строки

class EvaluationRequest(BaseModel):
    text: str
    theme: Optional[str] = ""
