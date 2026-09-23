require "minitest/autorun"
require_relative "../lib/roda"

class RodaTest < Minitest::Test
  def test_call
    assert_equal 200, Roda.call({}).first
  end
end
