defmodule AppWeb.AuthController do
  use AppWeb, :controller

  def delete_me(conn, _params) do
    user = conn.assigns.current_user
    App.Accounts.delete_user!(user)
    redirect(conn, to: "/")
  end
end
