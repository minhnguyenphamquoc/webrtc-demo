import { Socket, io } from 'socket.io-client';

import React, { useEffect, useState } from 'react';

const socket = io('wss://localhost:4000', {
  closeOnBeforeunload: false,
});

export const WebSocketContext = React.createContext<{
  socket: Socket<any, any>;
  isConnected: boolean;
  socketId: string | null;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
}>({
  socket,
  isConnected: false,
  socketId: null,
  setIsConnected: () => {},
});

interface WebSocketProviderProps {
  children: JSX.Element;
}

const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Socket connected!');
      setIsConnected(true);
    });

    socket.on('connect-success', ({ socketId }) => {
      setSocketId(socketId);
    });

    return () => {
      socket.off('connect');
      socket.off('connect-success');
    };
  }, [socket]);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        isConnected,
        socketId,
        setIsConnected,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
