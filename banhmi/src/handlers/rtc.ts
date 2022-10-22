import { MediaKind, RtpParameters } from 'mediasoup/node/lib/RtpParameters';
import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
} from 'mediasoup/node/lib/WebRtcTransport';

import {
  producerCollection,
  spaceCollection,
  transportCollection,
} from '@/data/collections';
import { createWebRtcTransport } from '@/ms/utils';
import { IOConnection, SocketConnection } from '@/types/ws';
import { logger } from '@/utils/logger';

interface GetRtpCapabilitiesPayload {
  spaceId: number;
}

interface GetRtpCapabilitiesResponse {
  rtpCapabilities: object;
}

interface CreateWebRtcTransportPayload {
  spaceId: number;
}

export interface CreateWebRtcTransportResponse {
  params: {
    id?: string;
    iceParameters?: IceParameters;
    iceCandidates?: IceCandidate[];
    dtlsParameters?: DtlsParameters;
    error?: unknown;
  };
}

interface ConnectWebRtcTransportPayload {
  spaceId: number;
  transportId: string;
  dtlsParameters: DtlsParameters;
}

interface CreateProducerPayload {
  spaceId: number;
  transportId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
}

interface CreateProducerResponse {
  id: string;
}

/**
 * Register RTC Handlers for Space communication
 * @param io IO
 * @param socket Socket
 */
export const registerRtcHandlers = (
  _io: IOConnection,
  socket: SocketConnection
) => {
  /**
   * Get RTPCapabilities for Space
   * @param params Emitted params
   * @param callback Callback
   */
  const getRtpCapabilitiesHandler = (
    payload: GetRtpCapabilitiesPayload,
    callback: (payload: GetRtpCapabilitiesResponse) => void
  ) => {
    const { spaceId } = payload;
    logger.info(`User (socketId: ${socket.id}) retrieved RTP Capabilities`);
    const { router } = spaceCollection[spaceId];
    const { rtpCapabilities } = router;
    callback({ rtpCapabilities });
  };
  socket.on('rtc:get-rtpCapabilities', getRtpCapabilitiesHandler);

  /**
   * Create WebRTC Transport for space
   * @param params Parameters
   * @param callback Callback
   */
  const createWebRtcTransportHandler = async (
    payload: CreateWebRtcTransportPayload,
    callback: (payload: CreateWebRtcTransportResponse) => void
  ) => {
    const { spaceId } = payload;
    logger.info(`User (socketId: ${socket.id}) retrieved RTP Capabilities`);
    const { router } = spaceCollection[spaceId];
    const transport = await createWebRtcTransport(router, callback);
    if (!transport) throw new Error('WebRTC Transport cannot be created');
    // Add transports association to peer & room
    transportCollection[transport.id] = {
      transport,
      peerId: socket.id,
      spaceId,
    };
  };
  socket.on('rtc:create-webrtcTransport', createWebRtcTransportHandler);

  /**
   * Connect the Transport from the client with the server's one
   * @param payload Connect Payload (spaceId, transportId, dtlsParameters)
   */
  const connectWebRtcTransportHandler = async (
    payload: ConnectWebRtcTransportPayload
  ) => {
    const { spaceId, transportId, dtlsParameters } = payload;
    if (
      !transportCollection[transportId] &&
      transportCollection[transportId].spaceId !== spaceId
    ) {
      throw new Error(
        'Cannot find the given transport to connect in the specified space. '
      );
    }
    const transport = transportCollection[transportId].transport;
    await transport.connect({ dtlsParameters });
  };
  socket.on('rtc:connect-transport', connectWebRtcTransportHandler);

  /**
   * Create a Producer from transport handler
   * @param payload Handler Payload
   * @param callback Handler Callback
   */
  const createProducerHandler = async (
    payload: CreateProducerPayload,
    callback: (res: CreateProducerResponse) => void
  ) => {
    const { spaceId, transportId, kind, rtpParameters } = payload;
    if (
      !transportCollection[transportId] &&
      transportCollection[transportId].spaceId !== spaceId
    ) {
      throw new Error(
        'Cannot find the given transport to connect in the specified space. '
      );
    }

    const transport = transportCollection[transportId].transport;

    // Call produce based on the params from the client
    const producer = await transport.produce({
      kind,
      rtpParameters,
    });
    // Add producer to collection along with its associations
    producerCollection[producer.id] = {
      producer,
      peerId: socket.id,
      spaceId,
    };
    logger.info('Producer created successfully with the following info.');
    logger.info(`Producer ID: ${producer.id} - Kind: ${producer.kind}`);

    producer.on('transportclose', () => {
      logger.info('Transport for this producer closed');
      producer?.close();
    });

    callback({
      id: producer.id,
    });
  };
  socket.on('rtc:create-producer', createProducerHandler);
};
