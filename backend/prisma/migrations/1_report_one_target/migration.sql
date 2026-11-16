-- Report is single-table inheritance: exactly one of dropId, upToId and
-- messageId is set. Prisma cannot express a check constraint in
-- schema.prisma, so it lives here, worded as the schema comment describes it.
ALTER TABLE "Report" ADD CONSTRAINT report_one_target CHECK (
  (("dropId" IS NOT NULL)::int + ("upToId" IS NOT NULL)::int
   + ("messageId" IS NOT NULL)::int) = 1);
