class AttachmentsController < ApplicationController
  before_action :authenticate_user!

  def create
    @attachment = current_user.messages.find(params[:message_id]).attachments.create!(file: params[:file])
    render json: @attachment
  end
end
