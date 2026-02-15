from flask import Flask
from config import APP_HOST, APP_PORT, MAX_CONTENT_LENGTH
from routes import register_routes
from state import setup_upload_dirs

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

setup_upload_dirs()
register_routes(app)

if __name__ == "__main__":
    print(f"Running on http://{APP_HOST}:{APP_PORT}")
    app.run(host=APP_HOST, port=APP_PORT, debug=False)
