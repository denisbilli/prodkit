defmodule ShopWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :shop

  plug CORSPlug, origin: ["https://app.example.com"]
  plug ShopWeb.Router
end
