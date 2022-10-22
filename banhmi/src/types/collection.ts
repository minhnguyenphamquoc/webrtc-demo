import { Consumer } from 'mediasoup/node/lib/Consumer';
import { Producer } from 'mediasoup/node/lib/Producer';
import { Router } from 'mediasoup/node/lib/Router';
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransport';

export interface SpaceCollection {
  [id: string]: {
    router: Router;
  };
}

export interface PeerCollection {
  [id: string]: {
    spaceId?: number;
  };
}

export interface TransportCollection {
  [id: string]: {
    transport: WebRtcTransport;
    peerId: string;
    spaceId: number;
  };
}

export interface ProducerCollection {
  [id: string]: {
    producer: Producer;
    peerId: string;
    spaceId: number;
  };
}

export interface ConsumerCollection {
  [id: string]: {
    consumer: Consumer;
    peerId: string;
    spaceId: number;
  };
}
