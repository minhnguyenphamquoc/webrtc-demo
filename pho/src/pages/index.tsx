/* eslint-disable @typescript-eslint/no-misused-promises */
import * as mediasoupClient from 'mediasoup-client';
import { Consumer } from 'mediasoup-client/lib/Consumer';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { Transport } from 'mediasoup-client/lib/Transport';

import {
  Button,
  Heading,
  ListItem,
  UnorderedList,
  useToast,
} from '@chakra-ui/react';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';

import { WebSocketContext } from '@/modules/ws/WebSocketProvider';
import {
  AudioParams,
  ClientConsumeResponse,
  CreateTransportResponse,
  GetParticipantsResponse,
  GetRTPCapabilitiesData,
  ParticipantDetails,
  RecentUserJoinPayload,
  RecentUserLeavePayload,
  RecvTransport,
} from '@/types/ws';
import { countObjectKeys } from '@/utils/object';

const IndexPage: React.FC<{}> = () => {
  const toast = useToast();

  const { socket, isConnected } = useContext(WebSocketContext);

  /* States */
  const [spaceId] = useState<number>(1);
  const [hasMic, setHasMic] = useState<boolean>(false);
  const [rtpCapabilities, setRtpCapabilities] =
    useState<RtpCapabilities | null>(null);
  const [device, setDevice] = useState<mediasoupClient.Device | undefined>();
  const [audioParams, setAudioParams] = useState<AudioParams | null>(null);
  const [sendTransport, setSendTransport] = useState<Transport | undefined>();
  const [localProducerId, setLocalProducerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantDetails>({});
  // TODO: List of consumers to be consumed in the media source
  const [recvTransports, setRecvTransports] = useState<RecvTransport[]>([]);

  /* Audio Refs */
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerAudioRefs = useRef<HTMLAudioElement[]>([]);
  /**
   * schema:
   * {
   *   "peerId": {
   *      "ref": HTMLAudioElement
   *   }
   * }
   */

  /**
   * Get Local User Media stream (Audio ONLY)
   */
  const getLocalUserMedia = async () => {
    const constraints: MediaStreamConstraints | undefined = {
      audio: true,
      video: false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
    } catch (err) {
      console.error(err);
      throw new Error(
        'Cannot get user media from microphone. Please check your permission.'
      );
    }
  };

  // On component initial phase
  useEffect(() => {
    // Handle recent user join to space
    socket.on(
      'space:recent-user-join',
      ({ socketId, producerId }: RecentUserJoinPayload) => {
        if (socket.id === socketId) return;
        console.log(
          `A recent user (${socketId}) (pId: ${producerId}) has joined.`
        );

        // Add new participants record along with their producerId
        setParticipants((prevParticipants) => ({
          ...prevParticipants,
          [socketId]: {
            id: socketId,
            producerId,
          },
        }));
        // Query recent join producers to add consumer
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
  }, [socket]);

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
   * Get list of space's participants
   * @param spaceId Space ID
   * @returns Get participants of a space
   */
  const getSpaceParticipants = async (spaceId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit(
        'space:get-participants',
        { spaceId },
        (res: GetParticipantsResponse) => {
          if (res.error) {
            return reject(res.error);
          }
          setParticipants(res.participants as ParticipantDetails);
          resolve();
        }
      );
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
   * @returns void
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
      .then(async () => getSpaceParticipants(spaceId))
      .then(() =>
        // Announce successfully join the space from client
        toast({
          title: 'Join space 1 successfully.',
          description: "You've joined space 1 successfully.",
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
      )
      .catch(console.error);
  }, [localProducerId]);

  /**
   * On Join Space Setup action
   */
  const onJoinSpaceSetup = async () => {
    // Get user's mic
    await getLocalUserMedia();

    // Get RTP Capabilities of spaceId after joining
    await getSpaceRtpCapabilities(spaceId);

    // Set/Initialize device
    initDevice();
  };

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

  /**
   * Create Recv Transport from server and init local device based on given params
   */
  const createRecvTransport = async (peerId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
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
          recvTsp.on('connect', ({ dtlsParameters }, callback, errback) => {
            try {
              socket.emit('rtc:connect-transport', {
                dtlsParameters,
                transportId: recvTsp.id,
                spaceId,
              });
              callback();
            } catch (err) {
              errback(err as Error);
            }
          });
          setRecvTransports((prevRecvTransports) => [
            ...prevRecvTransports,
            {
              transport: recvTsp,
              peerId,
            },
          ]);
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
  const connectRecvTransport = (
    spaceId: number,
    peerId: string,
    transportId: string,
    producerId: string
  ) => {
    // Check for loaded device
    if (!device) throw new Error('Device not found.');

    // Retrieve Receiver Transport for consuming Peer's producer
    const recvTransport = recvTransports.find(
      (tsp) => tsp.transport.id === transportId
    );
    if (!recvTransport) throw new Error('Consumer Transport not created.');

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
          console.error(params.error);
          return;
        }
        console.log('Consume Params:', params);

        // Consume with local media transport -> Init a consumer
        let consumer: Consumer | undefined;
        try {
          consumer = await recvTransport.transport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters,
          });
        } catch (err) {
          console.error(err);
        }
        if (!consumer) {
          throw new Error('Cannot create consumer from given parameters.');
        }

        // Destructure track from producer retrieved by consumer
        const { track } = consumer;
        // TODO: Add Ref to audio followed by peerId

        // Assign to remote audio track section
        // if (!remoteAudioRef.current) {
        //   throw new Error('No Remote Audio ref found.');
        // }
        // remoteAudioRef.current.srcObject = new MediaStream([track]);
      }
    );
  };

  const participantSelector = () => {
    return Object.keys(participants).map((pKey: string) => participants[pKey]);
  };

  return (
    <>
      {/* Meta section */}
      <Helmet>
        <title>VicaSpace - Chill lounge</title>
        <meta name="Let's chill in this McHouse Lounge" content="VicaSpace" />
      </Helmet>
      {/* Page Body */}
      <div>
        <Heading>Index Page ☝️</Heading>
        <br />
        <hr />
        {/* Space Join test section */}
        <div style={{ marginBottom: '60px' }}>
          <Heading>Space Test Section</Heading>
          <Button colorScheme="linkedin" onClick={onJoinSpaceSetup}>
            Join Space 1
          </Button>
          <div>
            <p>My Mic Status: {hasMic ? 'ON' : 'OFF'}</p>
            <audio ref={localAudioRef} autoPlay></audio>
          </div>
          <div>
            <Heading size="sm">
              Participants in Space #{spaceId} (Total:{' '}
              {countObjectKeys(participants)})
            </Heading>
            <div>
              <UnorderedList>
                {participantSelector().map((p) => {
                  return (
                    <ListItem key={p.id}>
                      {p.id}
                      <audio />
                    </ListItem>
                  );
                })}
              </UnorderedList>
            </div>
          </div>
        </div>

        {/* Socket test section */}
        <hr />
        <div>
          <Heading size="md">Socket Section</Heading>
          <p>Socket connection: {isConnected ? 'OK' : 'NO'}</p>
          <p>Socket ID: {socket.id ?? '-'}</p>
        </div>
        <hr />

        {/* Audio stream test section */}
        <div>
          {/* Mic section */}
          <hr />
          <Heading size="md">Audio Section</Heading>
        </div>
      </div>
    </>
  );
};

export default IndexPage;
