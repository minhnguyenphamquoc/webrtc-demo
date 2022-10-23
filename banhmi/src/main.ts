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

import { peerCollection, spaceCollection } from '@/data/collections';
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
    peerCollection[socket.id] = {};
    socket.emit('connect-success', { socketId: socket.id });

    /* Register handlers */
    registerConnHandlers(io, socket);
    registerSpaceHandlers(io, socket);
    registerRtcHandlers(io, socket);
  });

  // io.on('connection', (socket) => {
  /* Mediasoup Listeners */
  //  On user retrieving media's RTP Capabilities

  //   // Establish RECV Transport for connection from consumerTransport
  //   socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
  //     await consumerTransport?.connect({ dtlsParameters });
  //   });

  //   socket.on('consume', async ({ rtpCapabilities }, cb) => {
  //     if (!producer) {
  //       throw new Error('Cannot find any valid producer to consume.');
  //     }
  //     try {
  //       const isConsumable = router.canConsume({
  //         producerId: producer.id as string,
  //         rtpCapabilities,
  //       });
  //       logger.info(`Produce.id to be consumed: ${producer.id}`);
  //       logger.info(`Is consumable: ${isConsumable}`);
  //       if (isConsumable) {
  //         // Init consumer
  //         consumer = await consumerTransport?.consume({
  //           producerId: producer.id,
  //           rtpCapabilities,
  //         });
  //         // Add handlers for consumer
  //         consumer?.on('transportclose', () => {
  //           logger.info('Transport close from consumer');
  //         });
  //         consumer?.on('producerclose', () => {
  //           logger.info('Producer of consumer has been closed');
  //         });
  //         // Extract consumer's params & sent back to client
  //         const params = {
  //           id: consumer?.id,
  //           producerId: producer.id,
  //           kind: consumer?.kind,
  //           rtpParameters: consumer?.rtpParameters,
  //         };
  //         cb({
  //           params,
  //         });
  //       }
  //     } catch (err) {
  //       logger.error(err);
  //       cb({
  //         params: {
  //           error: err,
  //         },
  //       });
  //     }
  //   });

  //   socket.on('consumer-resume', async () => {
  //     logger.info('Consumer resumed');
  //     await consumer?.resume();
  //   });
  // });
  // });

  server.listen(process.env.APP_PORT, () => {
    logger.info(
      `Server listening on ${process.env.APP_HOST}:${process.env.APP_PORT}`
    );
  });
};

export default main;
