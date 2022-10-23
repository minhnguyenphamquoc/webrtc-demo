import { socketCollection } from '@/data/collections';
import { IOConnection, SocketConnection } from '@/types/ws';
import { logger } from '@/utils/logger';

export const registerConnHandlers = (
  _io: IOConnection,
  socket: SocketConnection
) => {
  /// Handles disconnection of socket from server
  const disconnectHandler = () => {
    logger.info(`User (socketId: ${socket.id}) has disconnected from socket`);
    // Remove peers from collection
    delete socketCollection[socket.id];
  };
  socket.on('disconnect', disconnectHandler);

  /// Handles ping event of socket to server
  const pingHandler = () => {
    logger.info('Server has been ping!');
    socket.emit('pong');
  };
  socket.on('ping', pingHandler);
};
