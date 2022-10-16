import * as mediasoup from 'mediasoup';
import { Router } from 'mediasoup/node/lib/Router';

import { logger } from '@/utils/logger';

export const createWorker = async () => {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
  logger.info(`Worker PID: ${worker.pid}`);

  worker.on('died', (error) => {
    logger.error('mediasoup worker has died');
    logger.error(error);
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};

export const createWebRtcTransport = async (
  router: Router,
  cb: (params: unknown) => void
) => {
  try {
    // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
    const webRtcTransportOptions = {
      listenIps: [
        {
          ip: '0.0.0.0', // replace with relevant IP address
          announcedIp: '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    const transport = await router.createWebRtcTransport(
      webRtcTransportOptions
    );
    logger.info(`Transport ID: ${transport.id}`);

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState == 'closed') transport.close();
    });

    transport.on('@close', () => {
      logger.info('Transport closed');
    });

    // Send back to the client the following parameters
    cb({
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });
    return transport;
  } catch (err) {
    logger.error(err);
    cb({
      params: {
        error: err,
      },
    });
  }
};
