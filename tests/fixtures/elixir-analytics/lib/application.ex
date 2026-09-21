defmodule Metrics.Application do
  use Application

  def start(_type, _args) do
    children = [Metrics.Repo, MetricsWeb.Endpoint]
    Supervisor.start_link(children, strategy: :one_for_one)
  end
end
