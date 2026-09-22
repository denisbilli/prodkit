class Story < ApplicationRecord
  def delete_by_moderator!(moderator, reason)
    update!(is_deleted: true)

    m = Moderation.new
    m.moderator_user_id = moderator.id
    m.story_id = id
    m.action = "deleted story"
    m.reason = reason
    m.save!
  end
end
