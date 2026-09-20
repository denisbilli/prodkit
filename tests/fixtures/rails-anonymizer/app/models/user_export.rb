class UserExport < ApplicationRecord
  belongs_to :user

  def self.retain_for
    2.days
  end
end
