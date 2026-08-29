-- The append-only event ledger. Every state change of an order lands here once.
--
-- ENGINE = ReplacingMergeTree(version)
--   ClickHouse has no UPDATE and no unique constraint. ReplacingMergeTree keeps
--   the row with the highest `version` for a given ORDER BY key -- eventually,
--   during a background merge. So a re-run of the same ingest is harmless
--   (idempotent), but a SELECT right after it can still see BOTH rows.
--   That is why every read below uses FINAL.
--
-- ORDER BY is the primary key AND the deduplication key. Choose it as the
-- columns you filter by most, most-selective first.
--
-- PARTITION BY month so that dropping old data is a metadata operation
-- (DROP PARTITION) instead of a full rewrite.
CREATE TABLE IF NOT EXISTS order_event
(
    orderId    String,
    userId     String,
    eventType  LowCardinality(String),
    status     LowCardinality(String),
    totalUsd   Float64,
    provider   LowCardinality(String),
    occurredAt DateTime64(3, 'UTC'),
    version    UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(occurredAt)
ORDER BY (orderId, eventType, occurredAt)
