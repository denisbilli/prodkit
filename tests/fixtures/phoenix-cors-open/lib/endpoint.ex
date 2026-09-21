defmodule ShopWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :shop

  plug(CORSPlug)
  plug(ShopWeb.Router)
end
