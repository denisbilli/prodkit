class AccessToken < ApplicationRecord
  has_secure_token :token
  belongs_to :owner, polymorphic: true
end
