class Order < ApplicationRecord
  after_commit :announce

  def announce
    Rails.logger.info("order #{id} committed")
  end
end
