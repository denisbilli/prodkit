defmodule IconsWeb.Favicon do
  @moduledoc """
  Serves a favicon fetched from a third party. The Content-Security-Policy below is
  what keeps a hostile SVG from running anything.
  """

  import Plug.Conn

  def send_icon(conn, body) do
    conn
    |> put_resp_header("content-security-policy", "script-src 'none'")
    |> send_resp(200, body)
  end
end
