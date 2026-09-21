# ref: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins 'https://app.example.com'
    resource '/api/*', headers: :any, methods: [:get, :post]
  end
end
