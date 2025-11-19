CREATE OR REPLACE FUNCTION get_my_claim(claim TEXT) RETURNS JSONB AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::JSONB ->> claim, NULL)::JSONB;
$$ LANGUAGE SQL STABLE;