import os

APP_HOST = "127.0.0.1"
APP_PORT = 5000

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, ".cache/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}

MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25MB
