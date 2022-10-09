import "dotenv/config";
import express from "express";
import http from "http";
import pino from "pino-http";

import { sayHello } from "@/utils/greeting";

const pinoHttp = pino();

const main = async () => {
  sayHello("Minh");

  /* Server Setup */
  const app = express();
  const server = http.createServer(app);

  app.use(pinoHttp);

  app.get("/", (_req, res) => {
    res.send("<h1>Welcome to the WebRTC Demo App.</h1>");
  });

  server.listen(process.env.APP_PORT, () => {
    console.log(
      `Server listening on ${process.env.APP_HOST}:${process.env.APP_PORT}`
    );
  });
};

main().catch((err) => console.error(err));
