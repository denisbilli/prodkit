import os


class Settings:
    frontend_host = os.environ["FRONTEND_HOST"]


settings = Settings()
