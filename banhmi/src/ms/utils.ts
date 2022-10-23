import * as mediasoup from 'mediasoup';
import { Router } from 'mediasoup/node/lib/Router';

import { CreateWebRtcTransportResponse } from '@/types/handlers/rtc';
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

/**
 *
 * @param router Mediasoup's Router
 * @param callback Callback from socket
 * @returns
 */
export const createWebRtcTransport = async (
  router: Router,
  callback: (payload: CreateWebRtcTransportResponse) => void
) => {
  // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
  const webRtcTransportOptions = {
    listenIps: [
      {
        ip: process.env.APP_SERVER_IP as string, // replace with relevant IP address
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  };
  try {
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
    callback({
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
    callback({
      params: {
        error: err,
      },
    });
  }
};
