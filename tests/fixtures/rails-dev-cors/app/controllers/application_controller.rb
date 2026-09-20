class ApplicationController < ActionController::Base
  REDIS_SECRET_KEY = "SECRET_TOKEN"

  def index
    render json: { ok: true }
  end
end
