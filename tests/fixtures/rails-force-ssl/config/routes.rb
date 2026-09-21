Rails.application.routes.draw do
  resources :stories, only: %i[index show]
end
