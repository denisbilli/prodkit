class ExportsController < ApplicationController
  before_action :authenticate_user!

  def show
    csv = BookmarkCsv.new(current_user.bookmarks).to_csv
    send_data csv, filename: "bookmarks.csv", type: "text/csv"
  end
end
