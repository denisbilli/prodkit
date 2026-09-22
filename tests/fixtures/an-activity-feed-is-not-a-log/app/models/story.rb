class Story < ApplicationRecord
  def hide_for(actor, reason)
    self.hidden_by = actor
    self.action = "hidden"
    self.hidden_reason = reason
    self.hidden_at = Time.current
    Activity.create!(actor_id: actor.id, action: "hid", subject: self)
  end
end
