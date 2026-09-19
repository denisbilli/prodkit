interface Match {
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
}

export function scoreboard(matches: Match[]): string[] {
  return matches.map((match) => `${match.homeTeamId} v ${match.awayTeamId}`);
}
