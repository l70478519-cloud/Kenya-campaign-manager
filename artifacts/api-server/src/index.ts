import app from "./app";
import { logger } from "./lib/logger";
import { backfillPublishedSlugs } from "./routes/insights";
import { ensureSeeded } from "./lib/seed";
import { installCampaignAwareAi } from "./lib/campaign-ai";

installCampaignAwareAi();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  ensureSeeded()
    .then(() => logger.info("Auth seed complete (session table, roles, bootstrap admin)"))
    .catch((err) => logger.error({ err }, "Failed to seed auth data"));

  backfillPublishedSlugs()
    .then((count) => {
      if (count > 0) logger.info({ count }, "Backfilled branded slugs for published polls");
    })
    .catch((err) => logger.error({ err }, "Failed to backfill published poll slugs"));
});
