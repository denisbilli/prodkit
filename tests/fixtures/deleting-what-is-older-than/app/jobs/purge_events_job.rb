class PurgeEventsJob < ApplicationJob
  def perform
    Event.where("created_at < ?", 90.days.ago).delete_all
  end
end
