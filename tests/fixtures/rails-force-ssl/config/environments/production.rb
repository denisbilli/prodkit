Rails.application.configure do
  # Redirects to https, marks cookies secure, and sends Strict-Transport-Security.
  config.force_ssl = true
  config.log_level = :info
end
