-- A plain view, not a MATERIALIZED view.
--
-- A materialized view in ClickHouse is an INSERT TRIGGER: it only ever sees
-- rows as they arrive, it does not see a backfill of old data, and it does not
-- re-run when you fix the definition. Start with a plain view; promote it to
-- materialized only when the query is genuinely too slow and you have accepted
-- that you now own its backfill.
CREATE VIEW IF NOT EXISTS v_order_daily AS
SELECT
    toDate(occurredAt)  AS day,
    eventType,
    count()             AS events,
    uniqExact(userId)   AS users,
    sum(totalUsd)       AS totalUsd
FROM order_event FINAL
GROUP BY day, eventType
