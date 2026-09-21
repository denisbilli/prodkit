defmodule Notes.Keys do
  import Ecto.Changeset

  @secret_key_size 32

  def validate(changeset) do
    validate_change(changeset, :secret_key, fn :secret_key, secret_key ->
      case Base.url_decode64(secret_key, padding: false) do
        {:ok, binary} when byte_size(binary) == @secret_key_size -> []
        _ -> [secret_key: "must be #{@secret_key_size} bytes in Base 64 URL alphabet"]
      end
    end)
  end
end
