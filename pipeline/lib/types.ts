export interface Association {
  code: string;
  name: string;
  notes: string | null;
  /** Wikidata QID of the country or territory (Wales Q25, not the United Kingdom); used to find clubs playing abroad. */
  country?: string;
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

export interface Scarf {
  id: string;
  clubQid: string;
  status: 'owned' | 'wishlist';
  type?: 'match' | 'vintage' | 'supporter' | 'other';
  acquired?: { date?: string; place?: string };
  price?: { amount: number; currency: string };
  condition?: string;
  notes?: string;
  /** Paths under assets/photos/. */
  photos?: string[];
}

/** Club fields filled by the enrichment stages, on top of what the importer writes. */
export interface ClubEnrichment {
  logo?: LogoInfo;
  /** UEFA team id (Wikidata P7361); the badge is embedded from img.uefa.com, never copied. */
  uefaId?: string;
  /** Which logo to show; default: UEFA badge if there is a UEFA id, else Commons. */
  logoSource?: 'uefa' | 'commons' | 'none';
  colors?: ColorInfo;
  /** Main colours of the badge, offered as suggestions in the editor (never shown as club colours). */
  palette?: string[];
  /** Home association when it differs from the league's (Swansea: WAL in an ENG league). */
  home?: string;
  blurb?: BlurbInfo;
  fanshop?: FanshopInfo;
}

/**
 * data/manual/overrides.json: my edits, keyed by club QID or stadium QID; they win over generated values.
 * e.g. { "Q245162": { "stadiumIds": ["Q97889239"], "fanshop": { "url": "...", "status": "confirmed" } },
 *        "Q97889239": { "address": { "text": "Strada Giulești 18, București" } } }
 */
export type Overrides = Record<string, Partial<Omit<Club, 'qid'> & ClubEnrichment & Omit<Stadium, 'qid'> & { address: AddressInfo }>>;

/** data/generated/logos.json, keyed by club QID. Only freely licensed files from Wikimedia Commons. */
export interface LogoInfo {
  /** File name under assets/logos/. */
  file: string;
  commonsFile: string;
  sourceUrl: string;
  license: string;
  author?: string;
  attributionRequired: boolean;
}

/** data/generated/colors.json, keyed by club QID. */
export interface ColorInfo {
  primary: string;
  secondary?: string;
  /** Colour names from Wikidata, when that is the source. */
  names?: string[];
  /** wikidata: P6364 official colour; manual: chosen by me (overrides). Logo colours are only suggestions. */
  source: 'wikidata' | 'manual';
}

/** data/generated/uefa.json, keyed by club QID. */
export interface UefaInfo {
  id: string;
}

/** data/generated/blurbs.json, keyed by club QID. */
export interface BlurbInfo {
  text: string;
  /** Wikipedia article URL, kept for CC BY-SA attribution. */
  source: string;
  status: 'draft' | 'reviewed';
}

/** data/generated/addresses.json, keyed by stadium QID. */
export interface AddressInfo {
  text: string;
  osmUrl?: string;
}

/** data/generated/fanshops.json, keyed by club QID. */
export interface FanshopInfo {
  url?: string;
  status: 'unchecked' | 'candidate' | 'confirmed' | 'none' | 'manual';
  checkedAt?: string;
  /** Why nothing was found, or a third-party marketplace link that was seen but not used. */
  note?: string;
}
