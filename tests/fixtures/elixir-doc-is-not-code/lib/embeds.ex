defmodule LedgerWeb.Embeds do
  @moduledoc """
  Notes on embedding a report in another page.

  A host page usually sends Content-Security-Policy and X-Frame-Options of its own,
  and an iframe from here will be refused unless it allows us. We send neither header;
  that is the host's decision to make.
  """

  def iframe_url(id), do: "/embed/" <> id
end
