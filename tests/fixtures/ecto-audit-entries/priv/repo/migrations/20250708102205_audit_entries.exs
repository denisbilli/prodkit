defmodule App.Repo.Migrations.AuditEntries do
  use Ecto.Migration

  def change do
    create table(:audit_entries, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :entity, :string, null: false
      add :entity_id, :string, null: false
      add :change, :map, default: %{}
      add :team_id, :integer
      add :datetime, :naive_datetime_usec, null: false
    end

    create index(:audit_entries, [:entity_id])
  end
end
