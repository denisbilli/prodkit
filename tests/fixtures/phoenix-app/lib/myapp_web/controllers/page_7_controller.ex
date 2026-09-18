defmodule MyappWeb.Page7Controller do
  use MyappWeb, :controller

  def index(conn, _params) do
    render(conn, :index)
  end
end
