class Message < ApplicationRecord
  belongs_to :author, class_name: "User", foreign_key: :author_user_id
  belongs_to :recipient, class_name: "User", foreign_key: :recipient_user_id
end
