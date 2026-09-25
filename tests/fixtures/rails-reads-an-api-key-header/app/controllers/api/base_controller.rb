module Api
  class BaseController < ActionController::API
    before_action :authenticate_with_key!

    private

    def authenticate_with_key!
      key = request.headers["api-key"]
      secret = ApiSecret.includes(:user).find_by(secret: key)
      return head(:unauthorized) unless secret && ActiveSupport::SecurityUtils.secure_compare(secret.secret, key)

      @user = secret.user
    end
  end
end
