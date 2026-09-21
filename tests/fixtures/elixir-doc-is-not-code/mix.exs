defmodule Ledger.MixProject do
  use Mix.Project

  def project do
    [app: :ledger, version: "0.1.0", elixir: "~> 1.18", deps: deps()]
  end

  defp deps do
    [{:phoenix, "~> 1.8"}]
  end
end
