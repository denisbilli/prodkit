class UsersController < ApplicationController
  before_action :authenticate_user!

  def request_destroy
    Users::DeleteWorker.perform_async(current_user.id)
    redirect_to root_path, notice: "Your account will be removed."
  end
end
