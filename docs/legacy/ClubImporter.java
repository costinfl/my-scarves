package app.scarves;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Imports clubs and home stadiums for the leagues of one association from Wikidata.
 * Rows are matched on the Wikidata QID, so re-running updates instead of duplicating.
 * A column listed in club.manual_fields / stadium.manual_fields is never overwritten,
 * and an empty value from Wikidata never erases an existing one.
 */
@Service
public class ClubImporter {

    private static final Logger log = LoggerFactory.getLogger(ClubImporter.class);
    private static final Pattern QID = Pattern.compile("^Q[0-9]+$");

    // P118 league, P582 end time (qualifier), P115 home venue, P625 coordinates,
    // P1083 capacity, P856 official website. Only memberships without an end date count as current.
    private static final String CLUBS_IN_LEAGUE = """
            SELECT ?club ?clubLabel ?website ?stadium ?stadiumLabel ?coord ?capacity WHERE {
              ?club p:P118 ?membership .
              ?membership ps:P118 wd:%s .
              FILTER NOT EXISTS { ?membership pq:P582 ?end }
              OPTIONAL { ?club wdt:P856 ?website }
              OPTIONAL {
                ?club wdt:P115 ?stadium .
                OPTIONAL { ?stadium wdt:P625 ?coord }
                OPTIONAL { ?stadium wdt:P1083 ?capacity }
              }
              SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ro,es,fr,de". }
            }
            """;

    private static final String UPSERT_CLUB = """
            INSERT INTO club (association_id, name, wikidata_qid, official_website)
            VALUES (:assoc, :name, :qid, :website)
            ON CONFLICT(wikidata_qid) DO UPDATE SET
              name = CASE WHEN instr(club.manual_fields, ',name,') > 0
                          THEN club.name ELSE excluded.name END,
              official_website = CASE WHEN instr(club.manual_fields, ',official_website,') > 0
                                        OR excluded.official_website IS NULL
                                      THEN club.official_website ELSE excluded.official_website END,
              updated_at = datetime('now')
            """;

    static final String UPSERT_STADIUM = """
            INSERT INTO stadium (name, latitude, longitude, capacity, wikidata_qid)
            VALUES (:name, :lat, :lon, :capacity, :qid)
            ON CONFLICT(wikidata_qid) DO UPDATE SET
              name = CASE WHEN instr(stadium.manual_fields, ',name,') > 0
                          THEN stadium.name ELSE excluded.name END,
              latitude = CASE WHEN instr(stadium.manual_fields, ',latitude,') > 0
                                OR excluded.latitude IS NULL
                              THEN stadium.latitude ELSE excluded.latitude END,
              longitude = CASE WHEN instr(stadium.manual_fields, ',longitude,') > 0
                                 OR excluded.longitude IS NULL
                               THEN stadium.longitude ELSE excluded.longitude END,
              capacity = CASE WHEN instr(stadium.manual_fields, ',capacity,') > 0
                                OR excluded.capacity IS NULL
                              THEN stadium.capacity ELSE excluded.capacity END
            """;

    public record LeagueResult(String league, String status, int clubs, int stadiums) {}

    private final JdbcClient jdbc;
    private final WikidataClient wikidata;
    private final String season;
    private final long delayMs;

    public ClubImporter(JdbcClient jdbc, WikidataClient wikidata,
                        @Value("${app.importer.season}") String season,
                        @Value("${app.importer.delay-ms}") long delayMs) {
        this.jdbc = jdbc;
        this.wikidata = wikidata;
        this.season = season;
        this.delayMs = delayMs;
    }

    public List<LeagueResult> importAssociation(String uefaCode) throws InterruptedException {
        Long assocId = jdbc.sql("SELECT id FROM association WHERE uefa_code = :c")
                .param("c", uefaCode).query(Long.class).optional()
                .orElseThrow(() -> new IllegalArgumentException("Unknown association " + uefaCode));

        List<Map<String, Object>> leagues = jdbc.sql(
                "SELECT id, name, wikidata_qid FROM league WHERE association_id = :a ORDER BY tier")
                .param("a", assocId).query().listOfRows();

        List<LeagueResult> results = new ArrayList<>();
        for (Map<String, Object> league : leagues) {
            String name = (String) league.get("name");
            String qid = (String) league.get("wikidata_qid");
            if (qid == null || !QID.matcher(qid).matches()) {
                results.add(new LeagueResult(name, "skipped: no wikidata_qid", 0, 0));
                continue;
            }
            try {
                results.add(importLeague(assocId, ((Number) league.get("id")).longValue(), name, qid));
            } catch (IOException e) {
                log.warn("Import of {} failed", name, e);
                results.add(new LeagueResult(name, "failed: " + e.getMessage(), 0, 0));
            }
            Thread.sleep(delayMs);
        }
        return results;
    }

    private LeagueResult importLeague(long assocId, long leagueId, String leagueName, String qid)
            throws IOException, InterruptedException {
        List<Map<String, String>> rows = wikidata.select(CLUBS_IN_LEAGUE.formatted(qid));
        Set<String> clubs = new HashSet<>();
        Set<String> stadiums = new HashSet<>();
        Set<String> clubsWithPrimaryStadium = new HashSet<>();

        for (Map<String, String> row : rows) {
            String clubQid = WikidataClient.qid(row.get("club"));
            String clubName = row.get("clubLabel");
            // A label equal to the QID means Wikidata had no label in the requested languages.
            if (clubQid == null || clubName == null || clubName.equals(clubQid)) continue;

            Map<String, Object> club = new HashMap<>();
            club.put("assoc", assocId);
            club.put("name", clubName);
            club.put("qid", clubQid);
            club.put("website", row.get("website"));
            jdbc.sql(UPSERT_CLUB).params(club).update();
            long clubId = jdbc.sql("SELECT id FROM club WHERE wikidata_qid = :q")
                    .param("q", clubQid).query(Long.class).single();
            clubs.add(clubQid);

            jdbc.sql("INSERT OR IGNORE INTO season_membership (club_id, league_id, season) VALUES (:c, :l, :s)")
                    .param("c", clubId).param("l", leagueId).param("s", season).update();

            String stadiumQid = WikidataClient.qid(row.get("stadium"));
            String stadiumName = row.get("stadiumLabel");
            if (stadiumQid == null || stadiumName == null || stadiumName.equals(stadiumQid)) continue;

            double[] point = WikidataClient.parsePoint(row.get("coord"));
            Map<String, Object> stadium = new HashMap<>();
            stadium.put("name", stadiumName);
            stadium.put("lat", point == null ? null : point[0]);
            stadium.put("lon", point == null ? null : point[1]);
            stadium.put("capacity", parseInt(row.get("capacity")));
            stadium.put("qid", stadiumQid);
            jdbc.sql(UPSERT_STADIUM).params(stadium).update();
            long stadiumId = jdbc.sql("SELECT id FROM stadium WHERE wikidata_qid = :q")
                    .param("q", stadiumQid).query(Long.class).single();
            stadiums.add(stadiumQid);

            // The first stadium seen for a club is marked primary; later ones are secondary.
            int primary = clubsWithPrimaryStadium.add(clubQid) ? 1 : 0;
            jdbc.sql("INSERT OR IGNORE INTO club_stadium (club_id, stadium_id, is_primary) VALUES (:c, :s, :p)")
                    .param("c", clubId).param("s", stadiumId).param("p", primary).update();
        }
        log.info("{}: {} clubs, {} stadiums", leagueName, clubs.size(), stadiums.size());
        return new LeagueResult(leagueName, "ok", clubs.size(), stadiums.size());
    }

    private static Integer parseInt(String s) {
        if (s == null) return null;
        try {
            return (int) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
