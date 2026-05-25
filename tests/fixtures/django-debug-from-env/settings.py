import os

DEBUG = os.getenv('DEBUG', 'False') == 'True'
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECRET_KEY = os.getenv('SECRET_KEY')
