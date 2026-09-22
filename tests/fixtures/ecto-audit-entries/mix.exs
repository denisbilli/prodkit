defmodule App.MixProject do
  use Mix.Project

  def project do
    [app: :app, version: "2.1.0", elixir: "~> 1.17", deps: deps()]
  end

  defp deps do
    [
      {:phoenix, "~> 1.7.14"},
      {:ecto_sql, "~> 3.12"},
      {:postgrex, ">= 0.0.0"},
      {:bcrypt_elixir, "~> 3.1"},
      {:bandit, "~> 1.5"}
    ]
  end
end
