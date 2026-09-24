class MediaController < ApplicationController
  before_action :authenticate_user!

  def create
    @media = current_user.media_attachments.create!(file: params[:file])
    render json: @media
  end
end
