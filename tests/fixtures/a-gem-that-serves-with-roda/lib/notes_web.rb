require "roda"

class NotesWeb < Roda
  route do |r|
    r.get("health") { "ok" }
  end
end
