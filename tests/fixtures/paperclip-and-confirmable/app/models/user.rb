class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :recoverable, :validatable,
         :confirmable

  has_many :media_attachments
end
