"""
Flask app entry point for the Expense Tracker (deliberately vulnerable app).

Run with:
    python -m flask --app app.main run --debug
or:
    python app/main.py
"""

from flask import Flask, jsonify

from app.config import SECRET_KEY, DEBUG, PORT
from app.db import init_db
from app.routes.auth import auth_bp
from app.routes.items import items_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["DEBUG"] = DEBUG

    # Initialise the SQLite schema
    with app.app_context():
        init_db()

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(items_bp)

    @app.route("/health")
    def health():
        return jsonify({"status": "ok", "app": "expense-tracker-vuln-demo"})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)
