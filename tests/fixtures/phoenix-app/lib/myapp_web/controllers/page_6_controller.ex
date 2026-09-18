defmodule MyappWeb.Page6Controller do
  use MyappWeb, :controller

  def index(conn, _params) do
    render(conn, :index)
  end
end
