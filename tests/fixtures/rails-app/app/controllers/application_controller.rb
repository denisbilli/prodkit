class ApplicationController < ActionController::Base
  def health
    render json: { ok: true }
  end
end
