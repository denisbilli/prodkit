defmodule AppWeb.Router do
  use AppWeb, :router

  scope "/", AppWeb do
    pipe_through [:browser, :require_authenticated_user]

    get "/:domain/download/export", SiteController, :download_export
    post "/:domain/export", StatsController, :csv_export
    get "/configs/export", ConfigController, :export
    get "/organizations/:org_id/export", OrganizationController, :export
    get "/admin/users/export", AdminController, :users_csv
  end
end
