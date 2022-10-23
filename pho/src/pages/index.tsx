/* eslint-disable @typescript-eslint/no-misused-promises */
import * as mediasoupClient from 'mediasoup-client';
import { Consumer } from 'mediasoup-client/lib/Consumer';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { Transport } from 'mediasoup-client/lib/Transport';

import {
  Button,
  Container,
  Heading,
  ListItem,
  UnorderedList,
  useToast,
} from '@chakra-ui/react';
import React, {
  createRef,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Helmet } from 'react-helmet-async';

import { WebSocketContext } from '@/modules/ws/WebSocketProvider';
import {
  AudioParams,
  ClientConsumeResponse,
  CreateTransportResponse,
  GetParticipantsResponse,
  GetRTPCapabilitiesData,
  ParticipantDetails,
  PeerAudioRefs,
  RecentUserJoinPayload,
  RecentUserLeavePayload,
  RecvTransports,
} from '@/types/ws';
import { countObjectKeys } from '@/utils/object';

const IndexPage: React.FC<{}> = () => {
  const toast = useToast();
  const { socket, isConnected } = useContext(WebSocketContext);

  /* States */
  const [spaceId, setSpaceId] = useState<number>(0);
  const [hasMic, setHasMic] = useState<boolean>(false);
  const [rtpCapabilities, setRtpCapabilities] =
    useState<RtpCapabilities | null>(null);
  const [device, setDevice] = useState<mediasoupClient.Device | undefined>();
  const [audioParams, setAudioParams] = useState<AudioParams | null>(null);
  const [sendTransport, setSendTransport] = useState<Transport | undefined>();
  const [localProducerId, setLocalProducerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantDetails>({});
  const [recvTransportId, setRecvTransportId] = useState<string | undefined>();
  const [recvTransports, setRecvTransports] = useState<RecvTransports>({});

  /* Refs */
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerAudioRefs = useRef<PeerAudioRefs>({});

  // On component initial phase
  useEffect(() => {
    // Handle recent user join to space
    socket.on(
      'space:recent-user-join',
      ({ socketId, producerId }: RecentUserJoinPayload) => {
        if (socket.id === socketId) return; // Skip same client id
        console.log(
          `A recent user (sid: ${socketId}) (with pId: ${producerId}) has joined.`
        );

        // Add new audio ref for incoming participants
        peerAudioRefs.current[socketId] = {
          id: socketId,
          ref: createRef<HTMLAudioElement>(),
        };

        // // Create Receiver Transports upon new comer
        console.log('add receiver on new join with spaceId:', spaceId);
        createRecvTransport(socketId).catch(console.error);

        // Add newcomer to the participants state
        setParticipants((prevParticipants) => ({
          ...prevParticipants,
          [socketId]: {
            id: socketId,
            producerId,
          },
        }));
      }
    );

    /// Handle latest user leave space
    socket.on(
      'space:recent-user-leave',
      ({ msg, socketId }: RecentUserLeavePayload) => {
        if (socketId !== socket.id) {
          console.log(msg);
        }
      }
    );

    return () => {
      // Offload socket on unmount
      socket.off('space:recent-user-join');
      socket.off('space:recent-user-leave');
    };
  }, [socket, spaceId, device]);

  /**
   * Get Local User Audio stream
   */
  const getLocalUserMedia = async () => {
    const constraints: MediaStreamConstraints | undefined = {
      audio: true,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (localAudioRef.current) {
        // Assign audio stream to view
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.volume = 0;

        // Create Audio Context from MediaStream
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);

        // Create gain node
        const gainNode = audioCtx.createGain();

        // Connect AudioBufferSourceNode to Gain Node
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Set local audio volume to 0 (avoid echo)
        gainNode.gain.value = 0;

        // Update audio params from stream track
        setAudioParams({
          track: source.mediaStream.getAudioTracks()[0],
        });

        // Mic ON flag
        setHasMic(true);
      }
    } catch (err) {
      console.error(err);
      throw new Error(
        'Cannot get user media from microphone. Please grant the required permission.'
      );
    }
  };

  /**
   * Join a Space by space Id
   * @param spaceId Space ID to join
   * @returns void | Throw error if error raised
   */
  const joinSpace = async (spaceId: number): Promise<void> => {
    return new Promise((resolve) => {
      socket.emit(
        'space:join',
        { spaceId, producerId: localProducerId },
        () => {
          console.log(`Join space (id: ${spaceId}) successfully.`);
          resolve();
        }
      );
    });
  };

  /**
   * Fetch initial list of space's participants (on join)
   * @param spaceId Space ID
   * @returns Get participants of a space
   */
  const fetchParticipantDetails = async (spaceId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit(
        'space:get-participants',
        { spaceId },
        async (res: GetParticipantsResponse) => {
          if (res.error) {
            return reject(res.error);
          }
          if (!res.participants) return;

          // Initialize participants audio refs
          Object.keys(res.participants).forEach((sId) => {
            if (socket.id === sId) return; // Skip client id
            peerAudioRefs.current[sId] = {
              id: sId,
              ref: createRef<HTMLAudioElement>(),
            };
            // // Create Receiver Transports
            createRecvTransport(sId).catch(console.error);
          });

          setParticipants(res.participants);
          resolve();
        }
      );
    });
  };

  useEffect(() => {
    if (
      recvTransportId &&
      countObjectKeys(recvTransports) > 0 &&
      countObjectKeys(participants) > 0
    ) {
      // Find peer id from given transport
      const matchKey = Object.keys(recvTransports).find((k) => {
        return recvTransports[k].id === recvTransportId;
      });
      if (!matchKey) return;

      // Find peer with given recvTransports
      const { peerSocketId } = recvTransports[matchKey];
      const peerProducerId = participants[peerSocketId].producerId;

      // Connect Recv Transports
      connectRecvTransport(spaceId, recvTransportId, peerProducerId).catch(
        console.error
      );
    }
  }, [recvTransportId, recvTransports, participants]);

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
  const createSpaceSendTransport = async (spaceId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit(
        'rtc:create-webrtcTransport',
        { spaceId },
        ({ params }: CreateTransportResponse) => {
          // The server sends back the params needed
          // to create the transport client-side
          if (params.error) {
            console.error(params.error);
            reject(params.error);
          }

          // Create a new WebRTC Transport to send media
          // based on server's producer transport params
          try {
            const sendTransport = device?.createSendTransport(params);
            if (!sendTransport) {
              return reject(new Error('Cannot create Send transport.'));
            }
            // Attach on send transport connects listener
            sendTransport.on(
              'connect',
              async ({ dtlsParameters }, callback, errback) => {
                try {
                  // Signal local DTLS parameters to the server side transport
                  socket.emit('rtc:connect-transport', {
                    transportId: sendTransport.id,
                    spaceId,
                    dtlsParameters,
                  });
                  // Tell the transport that parameters were transmitted.
                  callback();
                } catch (err) {
                  errback(err as Error);
                }
              }
            );

            // Attach on send transport produces listener
            sendTransport.on('produce', (parameters, callback, errback) => {
              console.log(parameters);
              try {
                // Tell the server to create a Producer
                // with the following parameters and produce,
                // and expect back a server-side producer id
                // see server's socket.on('rtc:create-producer', ...)
                socket.emit(
                  'rtc:create-producer',
                  {
                    transportId: sendTransport.id,
                    spaceId,
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    // appData: parameters.appData,
                  },
                  ({ id }: { id: string }) => {
                    // Tell the transport that parameters were transmitted and provide it with
                    // the server-side producer's id.
                    const producerIdObj = { id };
                    setLocalProducerId(id);
                    callback(producerIdObj);
                  }
                );
              } catch (err) {
                errback(err as Error);
              }
            });
            setSendTransport(sendTransport);
          } catch (err) {
            console.error(err);
            return reject(params.error);
          }
          resolve();
        }
      );
    });
  };

  /**
   * Connect Send Transport to the server for sending media
   */
  const connectSpaceSendTransport = async () => {
    // We now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    if (!audioParams) {
      console.error('No Audio Parameters available for transporting');
      return;
    }
    if (!sendTransport) {
      console.error('No Producer Transport available yet.');
      return;
    }

    const audioProducer = await sendTransport.produce(audioParams);

    audioProducer.on('trackended', () => {
      console.log('audio track ended');
    });

    audioProducer.on('transportclose', () => {
      console.log('audio transport ended');
    });

    console.log('Created Producer Transport ✅');
  };

  /**
   * On Join Space Setup action
   */
  const onJoinSpaceSetup = async () => {
    // Get user's mic ref
    await getLocalUserMedia();

    // Get RTP Capabilities of spaceId after joining
    await getSpaceRtpCapabilities(spaceId);

    // Set/Initialize device
    initDevice();
  };

  /**
   * On joining space
   */
  useEffect(() => {
    if (spaceId === 0) return;
    onJoinSpaceSetup().catch(console.error);
  }, [spaceId]);

  /* * * Device lifecycle for Send Transport * * */
  /**
   * On device loaded
   */
  useEffect(() => {
    if (!device || !rtpCapabilities) return;
    loadDevice()
      .then(async () => createSpaceSendTransport(spaceId))
      .catch(console.error);
  }, [device, rtpCapabilities]);

  /**
   * Connect recently created Send Transport to Server's one
   */
  useEffect(() => {
    if (!sendTransport) return;
    connectSpaceSendTransport().catch(console.error);
  }, [sendTransport]);

  /**
   * On Send Transport created & connected as producer
   */
  useEffect(() => {
    if (!localProducerId) return;
    joinSpace(spaceId)
      .then(async () => fetchParticipantDetails(spaceId))
      .then(() =>
        // Announce successfully join the space from client
        toast({
          title: `Join space ${spaceId} successfully.`,
          description: `You've joined space ${spaceId}  successfully.`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
      )
      .catch(console.error);
  }, [localProducerId]);

  /**
   * Unload Cleanup for Space
   */
  const unloadCleanup = () => {
    socket.emit('space:leave');
    console.log('Left the space.');
  };

  useEffect(() => {
    // TODO: Add a leave mechanism for moving between 2 tabs
    // Add tab unload listener
    window.addEventListener('beforeunload', unloadCleanup);
    return () => {
      window.removeEventListener('beforeunload', unloadCleanup);
    };
  }, [unloadCleanup]);

  /* * * RECV Section * * */
  /**
   * Create Recv Transport from server and init local device based on given params
   * @returns Recv Transport ID
   */
  const createRecvTransport = async (peerSocketId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('spaceId before create:', spaceId);
      socket.emit(
        'rtc:create-webrtcTransport',
        { spaceId },
        ({ params }: CreateTransportResponse) => {
          if (params.error) {
            console.error(params.error);
            return reject(new Error(params.error as any));
          }
          console.log('RecvTransport Params:', params);

          if (!device) {
            return reject(new Error('Device is not found!'));
          }

          // Add a new WebRTC Transport to receive media
          // based on server's consumer transport params
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
          const recvTsp = device.createRecvTransport(params);
          console.log('recvTsp:', recvTsp);

          // Attach on connect listener
          recvTsp.on('connect', ({ dtlsParameters }, callback, errback) => {
            try {
              socket.emit('rtc:connect-transport', {
                dtlsParameters,
                transportId: recvTsp.id,
                spaceId,
              });
              // Inform receiver has connected successfully.
              callback();
            } catch (err) {
              errback(err as Error);
            }
          });

          // Update new Recv Transport record
          setRecvTransports((prevRecvTransports) => ({
            ...prevRecvTransports,
            [recvTsp.id]: {
              id: recvTsp.id,
              transport: recvTsp,
              peerSocketId,
            },
          }));
          setRecvTransportId(recvTsp.id);
          resolve();
        }
      );
    });
  };

  /**
   * Connect Recv Transport to create a consumer from server
   * @param spaceId Space ID
   * @param transportId Transport ID to connect
   * @param producerId Producer ID to be connected with
   */
  const connectRecvTransport = async (
    spaceId: number,
    transportId: string,
    producerId: string
  ): Promise<void> => {
    // Check for loaded device
    return new Promise((resolve, reject) => {
      if (!device) {
        return reject(new Error('Device not found.'));
      }
      // Retrieve Receiver Transport for consuming Peer's producer
      // NOTE: Error here because state has not been updated yet
      console.log('recvTransports in connect:', recvTransports);
      const { transport: recvTransport, peerSocketId } =
        recvTransports[transportId];

      if (!recvTransport) {
        return reject(new Error('Consumer Transport not created.'));
      }

      // Emit create consumer event
      socket.emit(
        'rtc:create-consumer',
        {
          spaceId,
          transportId,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        },
        async ({ params }: ClientConsumeResponse) => {
          if (params.error) {
            return reject(new Error(params.error as string));
          }
          console.log('Consume Params:', params);

          // Consume with local media transport -> Init a consumer
          let consumer: Consumer | undefined;
          try {
            consumer = await recvTransport.consume({
              id: params.id,
              producerId: params.producerId,
              kind: params.kind,
              rtpParameters: params.rtpParameters,
            });
          } catch (err) {
            console.error(err);
          }
          if (!consumer) {
            return reject(
              new Error('Cannot create consumer from given parameters.')
            );
          }

          // Destructure track from producer retrieved by consumer
          const { track } = consumer;
          // TODO: Add Ref to audio followed by peerId

          // Assign to remote audio track section
          // remoteAudioRef.current.srcObject = new MediaStream([track]);
          if (!peerAudioRefs.current[peerSocketId]) {
            return reject(
              new Error(
                'Cannot find reference to audio element of given socket id.'
              )
            );
          }

          // Get peer's audio ref
          const { ref: peerRef } = peerAudioRefs.current[peerSocketId];
          if (!peerRef.current) {
            return reject(
              new Error(
                `Reference to audio element has not been assigned yet for socketId  ${peerSocketId}`
              )
            );
          }
          peerRef.current.srcObject = new MediaStream([track]);
          console.log('Attached consumer to peer successfully ✅');
          resolve();
        }
      );
    });
  };

  /* * DEBUG Section * */
  useEffect(() => {
    console.log('participants (debug):', participants);
    console.log('peerAudioRefs', peerAudioRefs);
  }, [participants]);

  useEffect(() => {
    console.log('recvTransports (debug): ', recvTransports);
  }, [recvTransports]);

  return (
    <>
      {/* Meta section */}
      <Helmet>
        <title>VicaSpace - Chill Lounge</title>
        <meta name="Let's chill in this VicaSpace" content="VicaSpace" />
        <meta name="Vicarious" content="VicaSpace" />
      </Helmet>

      {/* Page Body */}
      <Container maxW="5xl" bgColor="burlywood" minH="100vh">
        <Heading marginBottom="10">Voice Demo 🤙</Heading>
        <hr />
        {/* Space Join section */}
        <div style={{ marginBottom: '60px' }}>
          <Heading size="lg" marginBottom="5">
            Space Test Section
          </Heading>
          <Button colorScheme="linkedin" onClick={() => setSpaceId(1)}>
            Join Space #1
          </Button>
          <div style={{ marginTop: '10px' }}>
            <p>
              <b>Mic Status: {hasMic ? 'ON' : 'OFF'}</b>
            </p>
            <audio ref={localAudioRef} autoPlay muted={true} />
          </div>
          <div>
            <Heading size="sm">
              Participants in Space (ID: {spaceId || 'N/A'}):{' '}
              {countObjectKeys(participants)} online
            </Heading>
            {/* List of Participants */}
            <UnorderedList>
              {/* Local audio */}
              {spaceId !== 0 && (
                <ListItem key={socket.id}>
                  {socket.id}
                  <audio ref={localAudioRef} autoPlay muted />
                </ListItem>
              )}
              {/* Peer Audios */}
              {Object.values(participants).map((p) =>
                p.id !== socket.id ? (
                  <ListItem key={p.id}>
                    {p.id}
                    {socket.id !== p.id ? (
                      <audio ref={peerAudioRefs.current[p.id].ref} autoPlay />
                    ) : (
                      <audio ref={localAudioRef} autoPlay />
                    )}
                  </ListItem>
                ) : (
                  <div key={p.id} style={{ display: 'none' }} />
                )
              )}
            </UnorderedList>
          </div>
        </div>

        {/* WebSocket test section */}
        <hr />
        <div>
          <Heading size="md">WebSocket Section</Heading>
          <p>WebSocket connection: {isConnected ? 'OK' : 'NO'}</p>
          <p>WebSocket ID: {socket.id ?? '-'}</p>
        </div>
        <hr />
      </Container>
    </>
  );
};

export default IndexPage;
