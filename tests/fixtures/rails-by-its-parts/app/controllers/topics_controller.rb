class TopicsController < ApplicationController
  before_action :require_login

  def show
    @topic = Topic.find(params[:id])
    raise Discourse::InvalidAccess unless @topic.user_id == current_user.id
  end
end
