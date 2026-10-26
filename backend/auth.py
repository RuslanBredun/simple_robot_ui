"""Password authentication with salted PBKDF2 hashes and in-memory sessions."""
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from http.cookies import SimpleCookie
from pathlib import Path

AUTH_FILE = Path(os.environ.get("TURRET_WEB_AUTH_FILE", "/var/lib/turret-web/auth.json"))
ITERATIONS = 600_000
SESSION_SECONDS = 12 * 60 * 60
COOKIE_NAME = "turret_web_session"

def password_record(password):
    salt = secrets.token_bytes(16)
    return {"algorithm": "pbkdf2_sha256", "iterations": ITERATIONS,
            "salt": salt.hex(),
            "hash": hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex()}

def verify_password(password, record):
    try:
        if record["algorithm"] != "pbkdf2_sha256":
            return False
        iterations = int(record["iterations"])
        if not 100_000 <= iterations <= 2_000_000:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                    bytes.fromhex(record["salt"]), iterations)
        return hmac.compare_digest(actual, bytes.fromhex(record["hash"]))
    except (ValueError, KeyError, TypeError):
        return False

class AuthManager:
    def __init__(self, path=None):
        self.path = Path(path) if path else AUTH_FILE
        self.lock = threading.RLock()
        self.sessions = {}
        self.failures = {}

    def _record(self):
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def configured(self):
        return self._record() is not None

    def login(self, password, address):
        with self.lock:
            now = time.monotonic()
            attempts = [t for t in self.failures.get(address, []) if now - t < 300]
            if len(attempts) >= 5:
                self.failures[address] = attempts
                return None, "Too many attempts; retry later"
            record = self._record()
            if not record or not verify_password(password, record):
                attempts.append(now)
                self.failures[address] = attempts
                return None, "Invalid credentials"
            self.failures.pop(address, None)
            token = secrets.token_urlsafe(32)
            self.sessions[token] = now + SESSION_SECONDS
            return token, None

    def authenticated(self, cookie_header):
        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header or "")
            token = cookie[COOKIE_NAME].value
        except (KeyError, ValueError):
            return False
        with self.lock:
            expiry = self.sessions.get(token)
            if expiry is None:
                return False
            if expiry <= time.monotonic():
                self.sessions.pop(token, None)
                return False
            return True

    def logout(self, cookie_header):
        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header or "")
            token = cookie[COOKIE_NAME].value
        except (KeyError, ValueError):
            return
        with self.lock:
            self.sessions.pop(token, None)

def session_cookie(token, secure=False, clear=False):
    flags = ["Path=/", "HttpOnly", "SameSite=Strict"]
    if secure:
        flags.append("Secure")
    if clear:
        flags.extend(["Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"])
    else:
        flags.append(f"Max-Age={SESSION_SECONDS}")
    return f"{COOKIE_NAME}={token}; " + "; ".join(flags)
