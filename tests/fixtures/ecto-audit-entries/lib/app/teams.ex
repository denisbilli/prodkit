defmodule App.Teams do
  alias App.Repo
  alias App.Teams.Team

  def rename(%Team{} = team, name) do
    team
    |> Team.name_changeset(%{name: name})
    |> Repo.update_with_audit!("team_renamed", %{team_id: team.id})
  end

  def delete(%Team{} = team) do
    Repo.delete_with_audit!(team, "team_deleted", %{team_id: team.id})
  end
end
