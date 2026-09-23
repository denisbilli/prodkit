Rails.application.configure do
  config.log_level = :info
  config.log_tags = [:request_id]
  config.logger = ActiveSupport::TaggedLogging.new(ActiveSupport::Logger.new($stdout))
end
