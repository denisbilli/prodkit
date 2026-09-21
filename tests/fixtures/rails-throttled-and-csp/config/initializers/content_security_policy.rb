Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.script_src  :self
    policy.style_src   :self
  end

  config.content_security_policy_nonce_generator = ->(request) { SecureRandom.base64(16) }
end
