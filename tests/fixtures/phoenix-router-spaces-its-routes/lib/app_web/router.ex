defmodule AppWeb.Router do
  use AppWeb, :router

  pipeline :browser do
    plug :fetch_session
    plug :protect_from_forgery
  end

  scope "/", AppWeb do
    pipe_through [:browser, :require_authenticated_user]

    get "/settings", SettingsController, :index
    delete "/me", AuthController, :delete_me
    get "/settings/account/export", SettingsController, :download
  end
end
