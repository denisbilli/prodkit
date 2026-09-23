defmodule AppWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :app

  plug Plug.RequestId
  plug AppWeb.Router
end
