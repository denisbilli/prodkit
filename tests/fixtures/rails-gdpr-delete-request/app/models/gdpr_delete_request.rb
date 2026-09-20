class GDPRDeleteRequest < ApplicationRecord
  validates :user_id, presence: true
end
