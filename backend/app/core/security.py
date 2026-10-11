import hashlib
import hmac
import time
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Tuple

import bcrypt
import jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72  # bcrypt limit


def get_password_hash(password: str) -> str:
    pw = password.encode("utf-8")[:MAX_PASSWORD_BYTES]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def _is_legacy_hash(hashed: str) -> bool:
    # Legacy format from v1.0: "<32 hex salt>$<64 hex sha256>"
    return "$" in hashed and not hashed.startswith("$2")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith("$2"):
            return bcrypt.checkpw(plain_password.encode("utf-8")[:MAX_PASSWORD_BYTES], hashed_password.encode("utf-8"))
        if _is_legacy_hash(hashed_password):
            salt, expected = hashed_password.split("$", 1)
            actual = hashlib.sha256((salt + plain_password).encode("utf-8")).hexdigest()
            return hmac.compare_digest(actual, expected)
    except Exception:
        return False
    return False


def needs_rehash(hashed_password: str) -> bool:
    """True for legacy SHA-256 hashes that should be upgraded to bcrypt after a successful login."""
    return not hashed_password.startswith("$2")


_DUMMY_HASH = get_password_hash("dummy-password-for-timing")


def burn_password_check(password: str) -> None:
    """Spend comparable time when the user does not exist (reduces user enumeration via timing)."""
    verify_password(password, _DUMMY_HASH)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    to_encode = data.copy()
    to_encode.update({
        "iat": now,
        "exp": now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)),
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        return None


class LoginThrottle:
    """Small in-memory brute-force guard keyed by employee id + client IP."""

    def __init__(self) -> None:
        self._failures: Dict[str, Tuple[int, float]] = {}
        self._lock = threading.Lock()

    def _key(self, employee_id: str, ip: str) -> str:
        return f"{employee_id.lower()}|{ip}"

    def retry_after(self, employee_id: str, ip: str) -> int:
        with self._lock:
            count, until = self._failures.get(self._key(employee_id, ip), (0, 0.0))
            if count >= settings.LOGIN_MAX_FAILURES and until > time.time():
                return int(until - time.time()) + 1
            if until and until <= time.time():
                self._failures.pop(self._key(employee_id, ip), None)
            return 0

    def record_failure(self, employee_id: str, ip: str) -> None:
        with self._lock:
            k = self._key(employee_id, ip)
            count, _ = self._failures.get(k, (0, 0.0))
            self._failures[k] = (count + 1, time.time() + settings.LOGIN_LOCK_SECONDS)

    def reset(self, employee_id: str, ip: str) -> None:
        with self._lock:
            self._failures.pop(self._key(employee_id, ip), None)

    def clear_all(self) -> None:
        with self._lock:
            self._failures.clear()


login_throttle = LoginThrottle()
