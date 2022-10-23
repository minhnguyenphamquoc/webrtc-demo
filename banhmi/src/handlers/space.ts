import { producerCollection, socketCollection } from '@/data/collections';
import {
  GetParticipantsErrorResponse,
  GetParticipantsPayload,
  GetParticipantsResponse,
  JoinPayload,
  ParticipantDetails,
} from '@/types/handlers/space';
import { IOConnection, SocketConnection } from '@/types/ws';
import { logger } from '@/utils/logger';

export const registerSpaceHandlers = (
  io: IOConnection,
  socket: SocketConnection
) => {
  /**
   * Handles joining a specific space by ID
   * @param payload Payload
   * @param callback Callback
   */
  const spaceJoinHandler = async (
    payload: JoinPayload,
    callback: () => void
  ) => {
    const { spaceId, producerId } = payload;
    logger.info(
      `socketId ${socket.id}) has joined a space (spaceId: ${spaceId})`
    );

    const spaceIdStr = spaceId.toString();
    // Assign socket to a specific space
    await socket.join(spaceIdStr);
    // Add spaceId to room
    socketCollection[socket.id].spaceId = spaceId;

    // Broadcast recent joined user to all sockets in space
    io.to(spaceIdStr).emit('space:recent-user-join', {
      socketId: socket.id,
      producerId,
      msg: `User (socketId: ${socket.id}) has joined the space.`,
    });

    callback();
  };
  socket.on('space:join', spaceJoinHandler);

  /**
   * Handles leaving current space
   */
  const spaceLeaveHandler = async () => {
    const { spaceId } = socketCollection[socket.id];
    if (!spaceId) {
      logger.warn(
        `User (socketId: ${socket.id}) cannot leave space as 'spaceId' is empty`
      );
      return;
    }
    // Unassign socket from a specific space
    const curSpaceIdStr = spaceId.toString();
    await socket.leave(curSpaceIdStr);

    // Delete spaceId to room
    delete socketCollection[socket.id].spaceId;
    // Broadcast recent left user to all sockets in space
    io.to(curSpaceIdStr).emit('space:recent-user-leave', {
      socketId: socket.id,
      msg: `User (socketId: ${socket.id}) has left the space.`,
    });

    logger.info(
      `User (socketId: ${socket.id}) has left a space (spaceId: ${spaceId})`
    );
  };
  socket.on('space:leave', spaceLeaveHandler);

  /**
   * Get list of participants' socket ids
   * @param payload Payload
   * @param callback Callback
   * @returns List of participants' socket ids
   */
  const getParticipantsHandler = async (
    payload: GetParticipantsPayload,
    callback: (
      res: GetParticipantsResponse | GetParticipantsErrorResponse
    ) => void
  ) => {
    const { spaceId } = payload;
    const participantSids = io.sockets.adapter.rooms.get(spaceId.toString());

    if (!participantSids) {
      return callback({
        error: 'Space ID is not valid. Cannot get participants',
      });
    }

    // Get participants along with their current producerId
    const response: ParticipantDetails = {};
    // Associate participant id with producer.
    Object.keys(producerCollection).forEach((producerId) => {
      const { socketId } = producerCollection[producerId];
      if (participantSids?.has(socketId)) {
        response[socketId] = {
          id: socketId,
          producerId,
        };
      }
    });
    return callback({
      participants: response,
    });
  };
  socket.on('space:get-participants', getParticipantsHandler);
};
