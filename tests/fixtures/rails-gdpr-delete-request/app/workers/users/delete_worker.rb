module Users
  class DeleteWorker
    include Sidekiq::Job

    def perform(user_id, reason = "gdpr")
      user = User.find_by(id: user_id)
      return unless user

      Users::Delete.call(user)
      GDPRDeleteRequest.create(user_id: user.id, email: user.email) if reason == "gdpr"
    end
  end
end
