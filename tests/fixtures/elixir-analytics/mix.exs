defmodule Metrics.MixProject do
  use Mix.Project

  def project do
    [
      app: :metrics,
      version: "2.1.0",
      elixir: "~> 1.18",
      deps: deps(),
      releases: [
        metrics: [
          config_providers: [
            {Config.Reader, path: {:system, "RELEASE_ROOT", "/extra_config.exs"}}
          ]
        ]
      ],
      dialyzer: [plt_file: {:no_warn, "priv/plts/dialyzer.plt"}],
      xref: [exclude: [{:myxql, :child_spec, 1}]]
    ]
  end

  def application do
    [mod: {Metrics.Application, []}, extra_applications: [:logger]]
  end

  defp deps do
    [
      {:phoenix, "~> 1.8.2"},
      {:ecto_sql, "~> 3.13"},
      {:postgrex, "~> 0.20"},
      {:ecto_ch, "~> 0.8"},
      {:bcrypt_elixir, "~> 3.3"},
      {:nimble_totp, "~> 1.0"},
      {:hammer, "~> 6.2"},
      {:oban, "~> 2.24"},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:bandit, "~> 1.5", only: :dev},
      {:telemetry_source,
       git: "https://github.com/example/telemetry_source.git",
       ref: "e67f5e30a4cc96411800c48ba960153a9223a71d",
       override: true}
    ]
  end
end
