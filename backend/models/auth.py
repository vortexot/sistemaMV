"""Auth models — the public shape never includes password_hash or MongoDB's _id."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator

from lib.dates import utcnow


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    role: str  # admin | atendente | comprador
    status: str  # ativo | bloqueado
    picture: str | None = None
    created_at: datetime


class AuthInput(BaseModel):
    model_config = ConfigDict(extra='forbid')


class RegisterIn(AuthInput):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=15, max_length=72)

    @field_validator('password')
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('A senha excede 72 bytes UTF-8.')
        return value


class LoginIn(AuthInput):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(AuthInput):
    email: EmailStr


class ResetPasswordIn(AuthInput):
    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=15, max_length=72)

    @field_validator('new_password')
    @classmethod
    def password_bytes(cls, value):
        return RegisterIn.password_bytes(value)


class GoogleSessionIn(AuthInput):
    session_id: str = Field(min_length=1, max_length=4096)


class MessageOut(BaseModel):
    message: str
    reset_token: str | None = None
