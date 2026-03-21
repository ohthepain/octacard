-- Allow multiple projects per user (client still opens one at a time).
DROP INDEX IF EXISTS "project_userId_key";
CREATE INDEX IF NOT EXISTS "project_userId_idx" ON "project"("userId");
