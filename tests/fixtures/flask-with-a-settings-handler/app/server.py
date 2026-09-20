from flask import Flask

from app.handlers.settings import settings_blueprint


def create_app() -> Flask:
    app = Flask(__name__)
    app.register_blueprint(settings_blueprint)
    return app
