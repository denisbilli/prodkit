class MessagesController < ApplicationController
  before_action :authenticate_user!

  def index
    render json: Message.where(account_id: current_user.account_id)
  end
end
