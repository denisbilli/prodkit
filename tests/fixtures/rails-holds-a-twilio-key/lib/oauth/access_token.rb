module OAuth
  class AccessToken
    attr_reader :token, :expires_at

    def initialize(token, expires_at)
      @token = token
      @expires_at = expires_at
    end
  end
end
