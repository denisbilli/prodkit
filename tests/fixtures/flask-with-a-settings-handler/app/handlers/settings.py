"""The HTTP handler for a user's settings page. Not a configuration module."""

from flask import Blueprint, jsonify, request

settings_blueprint = Blueprint("settings", __name__)


@settings_blueprint.get("/settings")
def read_settings():
    return jsonify({"theme": "dark"})


@settings_blueprint.post("/settings")
def write_settings():
    return jsonify(request.get_json())
