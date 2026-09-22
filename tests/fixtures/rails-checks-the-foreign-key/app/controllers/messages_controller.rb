class MessagesController < ApplicationController
  before_action :authenticate_user!

  def show
    @message = Message.find(params[:id])

    if @message.recipient_user_id == @user.id
      @message.update(read_at: Time.current)
    elsif @message.author_user_id != @user.id
      return render plain: "not found", status: :not_found
    end

    render :show
  end

  def destroy
    @message = Message.find(params[:id])
    return head :forbidden unless @message.author_user_id == @user.id

    @message.destroy
    redirect_to messages_path
  end
end
