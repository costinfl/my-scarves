export interface Association {
  code: string;
  name: string;
  notes: string | null;
}

export interface SeedLeague {
  association: string;
  tier: 1 | 2;
  /** Must equal the league's English label on Wikidata; checked before every import. */
  name: string;
  qid: string;
}

export interface LeagueMembership {
  league: string;
  tier: 1 | 2;
  season: string;
}

export interface Club {
  qid: string;
  name: string;
  association: string;
  leagues: LeagueMembership[];
  officialWebsite?: string;
  /** Commons file name from P154; downloaded with its license in the logos stage (P4). */
  logoFile?: string;
  /** Primary stadium first. */
  stadiumIds: string[];
}

export interface Stadium {
  qid: string;
  name: string;
  lat?: number;
  lon?: number;
  capacity?: number;
}

export interface LeagueInfo {
  qid: string;
  association: string;
  tier: 1 | 2;
  label: string;
  /** P1132 "number of participants" as stated on Wikidata, used as the expected club count. */
  participants?: number;
}

export interface LeagueImportResult {
  league: string;
  name: string;
  status: string;
  clubs: number;
  stadiums: number;
  excluded: string[];
}
