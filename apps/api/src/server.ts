import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

createApp().listen(config.apiPort, () => {
  logger.info({ port: config.apiPort }, "Bearridge API listening");
});
