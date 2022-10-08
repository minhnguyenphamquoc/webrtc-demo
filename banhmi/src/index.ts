import "dotenv/config";
import express from "express";
import http from "http";

import { sayHello } from "@/utils/greeting";

(async () => {
  sayHello("Minh");

  /* Server Setup */
  const app = express();
  const server = http.createServer(app);

  app.get("/", (_req, res) => {
    res.send("<h1>Welcome to the WebRTC Demo App.");
  });

  server.listen(process.env.APP_PORT, () => {
    console.log(
      `Server listening on ${process.env.APP_HOST}:${process.env.APP_PORT}`
    );
  });
})().catch((err) => console.error(err));
