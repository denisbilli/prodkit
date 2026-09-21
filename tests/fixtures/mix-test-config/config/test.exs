import Config

config :notes, Notes.Metrics, metrics_jwt_secret: "test"

config :notes, Notes.Repo, database: "notes_test"
