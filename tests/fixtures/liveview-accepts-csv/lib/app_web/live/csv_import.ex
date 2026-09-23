defmodule AppWeb.Live.CSVImport do
  use AppWeb, :live_view

  def mount(_params, _session, socket) do
    upload_opts = [
      accept: [".csv", "text/csv"],
      max_entries: 5,
      max_file_size: 1_000_000_000
    ]

    {:ok, allow_upload(socket, :import, upload_opts)}
  end
end
