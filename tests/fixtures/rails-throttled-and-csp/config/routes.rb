Rails.application.routes.draw do
  resources :stories, only: %i[index show create]
  post "/login", to: "sessions#create"
end
