defmodule Notes.MixProject do
  use Mix.Project

  def project do
    [app: :notes, version: "0.1.0", elixir: "~> 1.18", deps: deps()]
  end

  defp deps do
    [{:phoenix, "~> 1.8"}, {:postgrex, "~> 0.20"}]
  end
end
