defmodule Notes.Metrics do
  def secret do
    Application.fetch_env!(:notes, __MODULE__)[:metrics_jwt_secret]
  end
end
