ALTER TABLE member_profiles ADD COLUMN ranking_alias text;
ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_ranking_alias_check
CHECK (ranking_alias IS NULL OR (char_length(btrim(ranking_alias)) BETWEEN 2 AND 24 AND ranking_alias = btrim(ranking_alias)));
CREATE UNIQUE INDEX member_profiles_ranking_alias_key ON member_profiles (lower(ranking_alias)) WHERE ranking_alias IS NOT NULL;
