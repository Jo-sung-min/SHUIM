-- Existing fuel was stored as 10 minutes per log. Preserve the remaining log
-- count and burn progress when the service changes to 1 minute per log.
-- One shared database timestamp avoids shifting rows by different amounts.
-- Round up fractional milliseconds so a log just beyond a boundary is not lost.
WITH transition AS (
    SELECT FLOOR(EXTRACT(EPOCH FROM statement_timestamp()) * 1000)::BIGINT AS at_ms
)
UPDATE beach_fires AS fire
SET fuel_until = transition.at_ms
    + CEIL((fire.fuel_until - transition.at_ms)::NUMERIC / 10)::BIGINT
FROM transition
WHERE fire.fuel_until > transition.at_ms;
