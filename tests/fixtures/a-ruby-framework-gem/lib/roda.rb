class Roda
  def self.route(&block)
    @route_block = block
  end

  def self.call(env)
    [200, {}, ["ok"]]
  end
end
