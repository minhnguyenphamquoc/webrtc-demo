import { Consumer } from 'mediasoup/node/lib/Consumer';
import { Producer } from 'mediasoup/node/lib/Producer';
import { Router } from 'mediasoup/node/lib/Router';
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransport';

export interface SpaceCollection {
  [id: string]: {
    router: Router;
  };
}

export interface SocketCollection {
  [id: string]: {
    id: string;
    spaceId?: number;
  };
}

export interface TransportCollection {
  [id: string]: {
    id: string;
    transport: WebRtcTransport;
    socketId: string;
    spaceId: number;
  };
}

export interface ProducerCollection {
  [id: string]: {
    id: string;
    producer: Producer;
    socketId: string;
    spaceId: number;
  };
}

export interface ConsumerCollection {
  [id: string]: {
    id: string;
    consumer: Consumer;
    socketId: string;
    spaceId: number;
  };
}
