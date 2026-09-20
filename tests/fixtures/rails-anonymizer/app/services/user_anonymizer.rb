class UserAnonymizer
  def call(subject)
    subject.update!(email: nil, name: "removed", ip_address: nil)
  end
end
