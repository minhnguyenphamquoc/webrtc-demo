/* eslint-disable @typescript-eslint/no-misused-promises */
import * as mediasoupClient from 'mediasoup-client';
import {
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup-client/lib/RtpParameters';
import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Transport,
} from 'mediasoup-client/lib/Transport';

import { Button, Heading, useToast } from '@chakra-ui/react';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';

import { WebSocketContext } from '@/modules/ws/WebSocketProvider';

interface GetRTPCapabilitiesData {
  rtpCapabilities: any;
}

interface AudioParams {
  track: MediaStreamTrack;
}

interface CreateTransportResponse {
  params: {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    error?: unknown;
  };
}

interface ClientConsumeResponse {
  params: {
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
    error?: unknown;
  };
}

interface LatestUserJoinPayload {
  socketId: string;
  msg: string;
}

interface LatestUserLeavePayload {
  socketId: string;
  msg: string;
}

const IndexPage: React.FC<{}> = () => {
  const toast = useToast();

  const [lastPong, setLastPong] = useState<string | null>(null);
  const [spaceId] = useState<number>(1);
  const [hasMic, setHasMic] = useState<boolean>(false);
  const [hasRemoteMic, setHasRemoteMic] = useState<boolean>(false);

  const [rtpCapabilities, setRtpCapabilities] =
    useState<RtpCapabilities | null>(null);
  const [device, setDevice] = useState<mediasoupClient.Device | null>(null);
  const [audioParams, setAudioParams] = useState<AudioParams | null>(null);

  const [producerTransport, setProducerTransport] = useState<
    Transport | undefined
  >();

  // TODO: List of consumers to be consumed in the media source
  const [consumerTransports, setConsumerTransports] = useState<Transport[]>([]);

  const [consumerTransport, setConsumerTransport] = useState<
    Transport | undefined
  >();

  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const { socket, isConnected } = useContext(WebSocketContext);

  /**
   * Get Local User Media stream (Audio ONLY)
   */
  const getLocalUserMedia = () => {
    const constraints: MediaStreamConstraints | undefined = {
      audio: true,
      video: false,
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (localAudioRef.current) {
          // Assign audio stream to view
          localAudioRef.current.srcObject = stream;
          localAudioRef.current.volume = 0;

          // Set Audio Parameters from audio track
          setAudioParams({
            track: stream.getAudioTracks()[0],
          });
          setHasMic(true);
        }
      })
      .catch((err) => console.error(err));
  };

  // On component initial phase
  useEffect(() => {
    socket.on('pong', () => {
      setLastPong(new Date().toString());
    });

    // Handle latest user join to space
    const latestUserJoinHandler = ({
      msg,
      socketId,
    }: LatestUserJoinPayload) => {
      if (socketId !== socket.id) {
        console.log(msg);
      }
      // TODO: Create a Consumer on new socket joiner
      //
    };
    socket.on('space:latest-user-join', latestUserJoinHandler);

    /// Handle latest user leave space
    const latestUserLeaveHandler = ({
      msg,
      socketId,
    }: LatestUserLeavePayload) => {
      if (socketId !== socket.id) {
        console.log(msg);
      }
    };
    socket.on('space:latest-user-leave', latestUserLeaveHandler);

    return () => {
      // Offload socket on unmount
      socket.off('pong');
      socket.off('space:latest-user-join');
      socket.off('space:latest-user-leave');
    };
  }, [socket]);

  /**
   * Join a Space by space Id
   * @param spaceId Space ID to join
   * @returns void | Throw error if error raised
   */
  const joinSpace = async (spaceId: number): Promise<void> => {
    return new Promise((resolve) => {
      socket.emit('space:join', { spaceId }, () => {
        console.log('Join space (id: 1) successfully.');
        resolve();
      });
    });
  };

  /**
   * Get SpaceId's RTP Capabilities
   * @param spaceId SpaceID
   */
  const getSpaceRtpCapabilities = async (spaceId: number): Promise<void> => {
    return new Promise((resolve) => {
      socket.emit(
        'rtc:get-rtpCapabilities',
        { spaceId },
        ({ rtpCapabilities }: GetRTPCapabilitiesData) => {
          setRtpCapabilities(rtpCapabilities);
          resolve();
        }
      );
    });
  };

  /**
   * Initialize new device
   */
  const initDevice = () => {
    setDevice(new mediasoupClient.Device());
  };

  /**
   * Load a new device for user's (to create transport)
   */
  const loadDevice = async () => {
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    if (!rtpCapabilities) {
      throw new Error(
        'Cannot create device. RTP Capabilities is currently null.'
      );
    }
    // Load device
    try {
      await device?.load({
        routerRtpCapabilities: rtpCapabilities,
      });
      if (device?.loaded) {
        console.log('Loaded device successfully.');
      } else {
        console.log('Device loaded failed');
      }
    } catch (err) {
      console.error(err);
      if ((err as any).name === 'UnsupportedError') {
        console.warn('Browser not supported');
      }
    }
  };

  /**
   * Create Send Transport to server for a specific space
   */
  const createSpaceSendTransport = (spaceId: number) => {
    socket.emit(
      'rtc:create-webrtcTransport',
      { spaceId },
      ({ params }: CreateTransportResponse) => {
        // The server sends back the params needed
        // to create the transport client-side
        if (params.error) {
          console.error(params.error);
          return;
        }
        console.log('createSendTransport Response Params', params);

        // Create a new WebRTC Transport to send media
        // based on server's producer transport params
        try {
          const sendTransport = device?.createSendTransport(params);
          setProducerTransport(sendTransport);
        } catch (err) {
          console.error(err);
        }
      }
    );
  };

  /**
   * Connect Send Transport to the server for sending media
   * @returns void
   */
  const connectSendTransport = async () => {
    // We now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    if (!audioParams) {
      console.error('No Audio Parameters available for transporting');
      return;
    }
    if (!producerTransport) {
      console.error('No Producer Transport available yet.');
      return;
    }
    const audioProducer = await producerTransport.produce(audioParams);

    audioProducer.on('trackended', () => {
      console.log('audio track ended');
    });

    audioProducer.on('transportclose', () => {
      console.log('audio transport ended');
    });

    console.log('Created Producer Transport ✅');
  };

  /// On device load
  useEffect(() => {
    if (!device || !rtpCapabilities) return;

    loadDevice()
      .then(() => createSpaceSendTransport(spaceId))
      .catch(console.error);
  }, [device, rtpCapabilities]);

  /// On producer created -> Connect
  useEffect(() => {
    if (!producerTransport) return;

    /// Attach listeners to producer
    // trigger on connectSendTransport
    producerTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        try {
          // Signal local DTLS parameters to the server side transport
          socket.emit('rtc:connect-transport', {
            transportId: producerTransport.id,
            spaceId,
            dtlsParameters,
          });
          console.log('Triggered on connectSendTransport.');

          // Tell the transport that parameters were transmitted.
          callback();
        } catch (err) {
          errback(err as Error);
        }
      }
    );

    producerTransport.on('produce', (parameters, callback, errback) => {
      console.log(parameters);
      try {
        // Tell the server to create a Producer
        // with the following parameters and produce,
        // and expect back a server-side producer id
        // see server's socket.on('rtc:create-producer', ...)
        socket.emit(
          'rtc:create-producer',
          {
            transportId: producerTransport.id,
            spaceId,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            // appData: parameters.appData,
          },
          ({ id }: { id: string }) => {
            // Tell the transport that parameters were transmitted and provide it with
            // the server-side producer's id.
            const producerIdObj = { id };
            callback(producerIdObj);
          }
        );
      } catch (err) {
        errback(err as Error);
      }
    });
    connectSendTransport().catch(console.error);
  }, [producerTransport]);

  /**
   * On Join Space actions
   */
  const onJoinSpace = async () => {
    // Join space by Id
    await joinSpace(spaceId);

    // Get RTP Capabilities of spaceId after joining
    await getSpaceRtpCapabilities(spaceId);

    // Set/Initialize device
    initDevice();

    // Create producer after joining
    // NOTE: Consumer will be created later on if latest user joined

    // Announce successfully join space of client
    toast({
      title: 'Join space 1 successfully.',
      description: "You've joined space 1 successfully.",
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  /**
   * Unload Cleanup
   */
  const unloadCleanup = () => {
    socket.emit('space:leave');
    console.log('Left the space!');
  };

  useEffect(() => {
    // TODO: Add a leave mechanism for moving between 2 tabs
    // Add tab unload listener
    window.addEventListener('beforeunload', unloadCleanup);
    return () => {
      window.removeEventListener('beforeunload', unloadCleanup);
    };
  }, [unloadCleanup]);

  /**
   * Get RTP Capabilities
   */
  const _getRtpCapabilities = () => {
    socket.emit(
      'getRtpCapabilities',
      ({ rtpCapabilities }: GetRTPCapabilitiesData) => {
        setRtpCapabilities(rtpCapabilities);
      }
    );
  };

  /**
   * Create Send Transport to Server
   */
  const _createSendTransport = () => {
    socket.emit(
      'createWebRtcTransport',
      { sender: true },
      ({ params }: CreateTransportResponse) => {
        // The server sends back the params needed
        // to create the transport client-side
        if (params.error) {
          console.error(params.error);
          return;
        }
        console.log('createSendTransport Response Params', params);

        // Create a new WebRTC Transport to send media
        // based on server's producer transport params
        try {
          const sendTransport = device?.createSendTransport(params);
          setProducerTransport(sendTransport);
        } catch (err) {
          console.error(err);
        }
      }
    );
  };

  /**
   * Connect Send Transport to the server for sending media
   * @returns void
   */
  const _connectSendTransport = async () => {
    // We now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    if (!audioParams) {
      console.error('No Audio Parameters available for transporting');
      return;
    }
    if (!producerTransport) {
      console.error('No Producer Transport available yet.');
      return;
    }
    const audioProducer = await producerTransport.produce(audioParams);
    console.log('Trigger creating a producer from transport.');

    audioProducer.on('trackended', () => {
      console.log('audio track ended');
    });

    audioProducer.on('transportclose', () => {
      console.log('audio transport ended');
    });
  };

  /**
   * Create a Receive Transport
   */
  const createRecvTransport = () => {
    socket.emit(
      'createWebRtcTransport',
      { sender: false },
      ({ params }: CreateTransportResponse) => {
        if (params.error) {
          console.error(params.error);
          return;
        }
        console.log('RecvTransport Params:', params);

        // Creates a new WebRTC Transport to receive media
        // based on server's consumer transport params
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
        setConsumerTransport(device?.createRecvTransport(params));
      }
    );
  };

  // Connect recv transport to the server's consumer
  useEffect(() => {
    if (consumerTransport) {
      // trigger on .consume() method of transport
      consumerTransport.on(
        'connect',
        ({ dtlsParameters }, callback, errback) => {
          try {
            console.log('did it call transport-recv-connect');
            socket.emit('transport-recv-connect', { dtlsParameters });
            callback();
          } catch (err) {
            errback(err as Error);
          }
        }
      );
    }
  }, [consumerTransport]);

  /**
   * Connect to Recv Transport
   */
  const connectRecvTransport = () => {
    if (!device) throw new Error('Device not found.');
    console.log('connectRecvTransport called.');

    socket.emit(
      'consume',
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }: ClientConsumeResponse) => {
        if (params.error) {
          // params to connect (consumerId, producerId, kind, rtpParams)
          console.error('Cannot consume');
          return;
        }
        console.log('consume params:', params);

        // Consume with local media transport -> Init a consumer
        const consumer = await consumerTransport?.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        if (!consumer) {
          throw new Error('Cannot create consumer from given parameters.');
        }

        // Destructure track from producer retrieved by consumer
        const { track } = consumer;

        // Assign to remote audio track section
        if (!remoteAudioRef.current) {
          throw new Error('No Remote Audio ref found.');
        }
        remoteAudioRef.current.srcObject = new MediaStream([track]);
        setHasRemoteMic(true);
      }
    );
  };

  /**
   * Emit ping event to socket server
   */
  const emitPing = () => {
    console.log('emit ping!');
    socket.emit('ping');
  };

  /* Producer Transport (debug) */
  useEffect(() => {
    if (producerTransport) {
      console.log('producerTransport (debug):', producerTransport);
    }
  }, [producerTransport]);

  /* Audio Params (debug) */
  useEffect(() => {
    if (audioParams) {
      console.log('audioParams (debug):', audioParams);
    }
  }, [audioParams]);

  /* RTP Capabilities (debug) */
  useEffect(() => {
    if (rtpCapabilities) {
      console.log(
        `rtpCapabilities of space (id: ${spaceId}) (debug):`,
        rtpCapabilities
      );
    }
  }, [rtpCapabilities]);

  return (
    <>
      {/* Meta section */}
      <Helmet>
        <title>VicaSpace - Chill lounge</title>
        <meta name="Let's chill in this McHouse Lounge" content="VicaSpace" />
      </Helmet>
      {/* Page Body */}
      <div>
        <h1>Index/Home Page</h1>
        <hr />
        {/* Socket test section */}
        <div>
          <Heading>Socket Section</Heading>
          <p>Socket connection: {isConnected ? 'OK' : 'NO'}</p>
          <p>Socket ID: {socket.id ?? '-'}</p>
          <p>Last Pong: {lastPong ?? '-'}</p>
          <Button onClick={emitPing}>Ping Socket</Button>
          &nbsp;
          <Button colorScheme="linkedin" onClick={onJoinSpace}>
            Join Space 1
          </Button>
        </div>
        <hr />
        {/* Audio stream test section */}
        <div style={{ margin: 10 }}>
          <Heading>Audio Section</Heading>
          <Button onClick={() => _getRtpCapabilities()}>
            Get RTP Capabilities
          </Button>
          <Button onClick={() => setDevice(new mediasoupClient.Device())}>
            Create Device
          </Button>
          <div>
            <Button onClick={_createSendTransport}>
              Create Send Transport
            </Button>
            <Button onClick={_connectSendTransport}>
              Connect Send Transport
            </Button>
          </div>
          <div>
            <Button onClick={createRecvTransport}>Create Recv Transport</Button>
            <Button onClick={connectRecvTransport}>
              Connect Recv Transport
            </Button>
          </div>
          {/* Mic section */}
          <hr />
          <Heading>Peer Audio Section</Heading>
          <div>
            <Button onClick={() => getLocalUserMedia()}>Enable Local!</Button>
            <p>Local Mic: {hasMic ? 'ON' : 'OFF'}</p>
            <audio ref={localAudioRef} autoPlay></audio>
          </div>
          <div>
            <p>
              Remote Mic: {hasRemoteMic ? 'Someone is ON' : 'Someone is OFF'}
            </p>
            <audio ref={remoteAudioRef} autoPlay></audio>
          </div>
        </div>
      </div>
    </>
  );
};

export default IndexPage;
