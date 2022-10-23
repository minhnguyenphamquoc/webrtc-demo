import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';
import https from 'httpolyglot';
import { ServerOptions } from 'https';
import { Router } from 'mediasoup/node/lib/Router';
import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters';
import path from 'path';
import pinoHttp from 'pino-http';
import { Server } from 'socket.io';

import { socketCollection, spaceCollection } from '@/data/collections';
import { registerConnHandlers } from '@/handlers/conn';
import { registerRtcHandlers } from '@/handlers/rtc';
import { registerSpaceHandlers } from '@/handlers/space';
import { createWorker } from '@/ms/utils';
import { logger } from '@/utils/logger';

const main = async () => {
  const pinoHttpMiddleware = pinoHttp();

  /* Server Setup */
  const app = express();
  app.set('trust proxy', 1);
  app.use(pinoHttpMiddleware);

  app.get('/', (_req, res) => {
    res.send('<h1>Welcome to the WebRTC Demo App.</h1>');
  });

  const options: ServerOptions = {
    key: readFileSync(path.join(__dirname, '../ssl/key.pem'), 'utf-8'),
    cert: readFileSync(path.join(__dirname, '../ssl/cert.pem'), 'utf-8'),
  };
  const server = https.createServer(options, app);
  const io = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  /* Mediasoup setup */
  const worker = await createWorker();
  const mediaCodecs: RtpCodecCapability[] = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
  ];
  // const router = await worker.createRouter({ mediaCodecs });

  // NOTE: Each space has its own router for separate communication
  // Dummy fetch spaceIds:
  const spaceIds = [1, 2];
  const routers = await Promise.all(
    new Array<Promise<Router>>(spaceIds.length).fill(
      worker.createRouter({ mediaCodecs })
    )
  );
  // Init routers for spaces
  routers.forEach((router, idx) => {
    spaceCollection[spaceIds[idx]] = {
      router,
    };
  });

  /* Socket setup */
  io.on('connection', (socket) => {
    /// Socket Initialization
    logger.info(`User (socketId: ${socket.id}) has connected to socket`);
    socketCollection[socket.id] = {
      id: socket.id,
    };
    socket.emit('connect-success', { socketId: socket.id });

    /* Register handlers */
    registerConnHandlers(io, socket);
    registerSpaceHandlers(io, socket);
    registerRtcHandlers(io, socket);
  });

  server.listen(process.env.APP_PORT, () => {
    logger.info(
      `Server listening on ${process.env.APP_HOST}:${process.env.APP_PORT}`
    );
  });
};

export default main;
