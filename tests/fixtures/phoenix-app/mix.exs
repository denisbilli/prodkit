defmodule Myapp.MixProject do
  use Mix.Project

  def project do
    [app: :myapp, version: "0.1.0", elixir: "~> 1.16", deps: deps()]
  end

  defp deps do
    [{:phoenix, "~> 1.7"}, {:ecto_sql, "~> 3.11"}, {:bcrypt_elixir, "~> 3.1"}]
  end
end
