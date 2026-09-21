Rails.application.configure do
  # force_ssl lives in the other fixture, so each rule is held by one signal.
  config.log_level = :info
end
