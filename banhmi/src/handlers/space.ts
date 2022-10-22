import { peerCollection } from '@/data/collections';
import { IOConnection, SocketConnection } from '@/types/ws';
import { logger } from '@/utils/logger';

export interface SpaceJoinPayload {
  spaceId: number;
}

export type SpaceLeavePayload = SpaceJoinPayload;

export const registerSpaceHandlers = (
  io: IOConnection,
  socket: SocketConnection
) => {
  /// Handles joining a specific space by ID
  const spaceJoinHandler = async ({ spaceId }: SpaceJoinPayload, callback) => {
    logger.info(
      `User (socketId: ${socket.id}) has joined a space (spaceId: ${spaceId})`
    );

    const spaceIdStr = spaceId.toString();
    // Assign socket to a specific space
    await socket.join(spaceIdStr);
    // Add spaceId to room
    peerCollection[socket.id].spaceId = spaceId;

    // Broadcast latest joined user to all sockets in space
    io.to(spaceIdStr).emit('space:latest-user-join', {
      socketId: socket.id,
      msg: `User (socketId: ${socket.id}) has joined the space.`,
    });

    callback();
  };
  socket.on('space:join', spaceJoinHandler);

  /// Handles leaving current space
  const spaceLeaveHandler = async () => {
    const { spaceId } = peerCollection[socket.id];
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
    delete peerCollection[socket.id].spaceId;
    // Broadcast latest left user to all sockets in space
    io.to(curSpaceIdStr).emit('space:latest-user-leave', {
      socketId: socket.id,
      msg: `User (socketId: ${socket.id}) has left the space.`,
    });

    logger.info(
      `User (socketId: ${socket.id}) has left a space (spaceId: ${spaceId})`
    );
  };
  socket.on('space:leave', spaceLeaveHandler);
};
