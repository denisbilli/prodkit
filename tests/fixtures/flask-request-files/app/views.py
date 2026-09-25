from flask import Flask, request
from werkzeug.utils import secure_filename

app = Flask(__name__)


@app.route("/admin/logo", methods=["POST"])
def upload_logo():
    logo = request.files.get("logo")
    logo.save("/uploads/" + secure_filename(logo.filename))
    return "", 204
