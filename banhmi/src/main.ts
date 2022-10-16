import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';
import https from 'httpolyglot';
import { ServerOptions } from 'https';
import { Consumer } from 'mediasoup/node/lib/Consumer';
import { Producer } from 'mediasoup/node/lib/Producer';
import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters';
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransport';
import path from 'path';
import pinoHttp from 'pino-http';
import { Server } from 'socket.io';

import { createWebRtcTransport, createWorker } from '@/ms/utils';
import { logger } from '@/utils/logger';

const pinoHttpMiddleware = pinoHttp();

const main = async () => {
  /* Server Setup */
  const app = express();
  // TODO: Create HTTPS server instead of HTTP
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

  const worker = await createWorker();
  const mediaCodecs: RtpCodecCapability[] = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
  ];

  /* Socket setup */
  io.on('connection', async (socket) => {
    logger.info('A user has connected');
    socket.emit('connect-success', { socketId: socket.id });

    socket.on('disconnect', () => {
      logger.info('User has disconnected');
    });

    socket.on('ping', () => {
      logger.info('Server has been ping!');
      socket.emit('pong');
    });

    /* Mediasoup setup */
    // Initialize a router
    const router = await worker.createRouter({ mediaCodecs });

    //  Client emits a request for server's media RTPCapabilities
    socket.on('getRtpCapabilities', (cb) => {
      const { rtpCapabilities } = router;
      console.log('rtpCapabilities:', rtpCapabilities);
      cb({ rtpCapabilities });
    });

    let producerTransport: WebRtcTransport | undefined;
    let consumerTransport: WebRtcTransport | undefined;
    let producer: Producer | undefined;
    let consumer: Consumer | undefined;
    // Client emits to create server side transport
    // It's needed to differentiate between producer & consumer transports
    socket.on('createWebRtcTransport', async ({ sender }, cb) => {
      logger.info(`Is this a sender request? ${sender}`);
      if (sender) {
        producerTransport = await createWebRtcTransport(router, cb);
      } else {
        consumerTransport = await createWebRtcTransport(router, cb);
      }
    });

    // Create a producer with ID
    socket.on('transport-produce', async ({ kind, rtpParameters }, cb) => {
      // call produce based on the params from the client
      producer = await producerTransport?.produce({
        kind,
        rtpParameters,
      });
      logger.info(`Producer ID: ${producer?.id} - Kind: ${producer?.kind}`);

      producer?.on('transportclose', () => {
        logger.info('Transport for this producer closed');
        producer?.close();
      });

      cb({
        id: producer?.id,
      });
    });

    // Establish RECV Transport for connection from consumerTransport
    socket.on('transport-recev-connect', async ({ dtlsParameters }) => {
      console.log('dtls parameters: ', dtlsParameters);
      await consumerTransport?.connect({ dtlsParameters });
    });

    socket.on('consume', async ({ rtpCapabilities }, cb) => {
      if (!producer) {
        throw new Error('Cannot find any valid producer to consume.');
      }
      try {
        if (
          router.canConsume({
            producerId: producer.id as string,
            rtpCapabilities,
          })
        ) {
          // Init consumer
          consumer = await consumerTransport?.consume({
            producerId: producer.id,
            rtpCapabilities,
          });

          // Add handlers for consumer
          consumer?.on('transportclose', () => {
            logger.info('Transport close from consumer');
          });
          consumer?.on('producerclose', () => {
            logger.info('Producer of consumer has been closed');
          });

          // Extract consumer's params & sent back to client
          const params = {
            id: consumer?.id,
            producerId: producer.id,
            kind: consumer?.kind,
            rtpParameters: consumer?.rtpParameters,
          };
          cb({
            params,
          });
        }
      } catch (err) {
        logger.error(err);
        cb({
          params: {
            error: err,
          },
        });
      }
    });

    socket.on('consumer-resume', async () => {
      logger.info('Consumer resumed');
      await consumer?.resume();
    });
  });

  server.listen(process.env.APP_PORT, () => {
    logger.info(
      `Server listening on ${process.env.APP_HOST}:${process.env.APP_PORT}`
    );
  });
};

export default main;
