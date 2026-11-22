-- T-ISO: cross-account leak checks. Read-only; returns ids/counts only, no content.
-- Every query should return 0. Run:
--   docker exec -i inbox-zero-services-db-1 psql -U postgres -d inboxzero -At < scripts/test-multi-account/isolation.sql

\echo 'ISO-1 classification -> category of another account'
select count(*) from "CategorizeClassification" c
join "CategorizeCategory" k on k.id = c."categoryId"
where k."emailAccountId" <> c."emailAccountId";

\echo 'ISO-2 span -> classification of another account'
select count(*) from "CategorizeExtractedSpan" s
join "CategorizeClassification" c on c.id = s."classificationId"
where s."emailAccountId" <> c."emailAccountId";

\echo 'ISO-3 feedback event -> classification of another account'
select count(*) from "CategorizeFeedbackEvent" f
join "CategorizeClassification" c on c.id = f."classificationId"
where f."emailAccountId" <> c."emailAccountId";

\echo 'ISO-4 priority override -> category of another account'
select count(*) from "CategorizePriorityOverrideLog" o
join "CategorizeCategory" k on k.id = o."categoryId"
where k."emailAccountId" <> o."emailAccountId";

\echo 'ISO-5 sender centroid -> (upstream) category of another account'
select count(*) from "CategorizeSenderCategoryCentroid" sc
join "Category" k on k.id = sc."categoryId"
where k."emailAccountId" <> sc."emailAccountId";

\echo 'ISO-6 calendar -> connection of another account (n/a: calendar has no account column; check connection owner exists)'
select count(*) from "Calendar" cal
left join "CalendarConnection" cc on cc.id = cal."connectionId"
where cc.id is null;

\echo 'ISO-7 duplicate classifications for one message in one account (parallel sync)'
select count(*) from (
  select "emailAccountId", "threadId", "messageId" from "CategorizeClassification"
  group by 1,2,3 having count(*) > 1) d;

\echo 'ISO-8 same messageId stored under two accounts (expected 0 unless the same mail truly went to both)'
select count(*) from (
  select "messageId" from "CategorizeClassification"
  group by 1 having count(distinct "emailAccountId") > 1) d;

\echo 'ISO-9 deadline alert whose message is classified only under another account'
select count(*) from "CategorizeDeadlineAlert" a
where not exists (select 1 from "CategorizeClassification" c
  where c."messageId" = a."messageId" and c."emailAccountId" = a."emailAccountId")
and exists (select 1 from "CategorizeClassification" c
  where c."messageId" = a."messageId" and c."emailAccountId" <> a."emailAccountId");

\echo 'INFO same category name in more than one account (allowed by @@unique(emailAccountId,name))'
select count(*) from (
  select name from "CategorizeCategory" group by 1 having count(distinct "emailAccountId") > 1) d;

\echo 'INFO same sender contact in more than one account (separate rows per account)'
select count(*) from (
  select email from "CategorizeContact" group by 1 having count(distinct "emailAccountId") > 1) d;

\echo 'INFO email accounts per user (consent is per user)'
select count(*) from "EmailAccount" group by "userId";
