class Order < ApplicationRecord
  STATES = [:pending, :confirmable, :confirmed].freeze
end
