Rails.application.routes.draw do
  resources :articles, only: %i[index show create]

  post "users/request_destroy", to: "users#request_destroy", as: :user_request_destroy
end
