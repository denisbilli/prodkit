Rails.application.configure do
  config.public_file_server.headers = { "Access-Control-Allow-Origin" => "*" }
end
