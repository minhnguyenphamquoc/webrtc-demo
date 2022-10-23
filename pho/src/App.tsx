import { ChakraProvider } from '@chakra-ui/react';
import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';

import WebSocketProvider from '@/modules/ws/WebSocketProvider';
import AppRouter from '@/router';
import { store } from '@/states/store';

const App: React.FC<{}> = () => {
  return (
    <>
      <HelmetProvider>
        <Provider store={store}>
          <WebSocketProvider>
            <ChakraProvider>
              <AppRouter />
            </ChakraProvider>
          </WebSocketProvider>
        </Provider>
      </HelmetProvider>
    </>
  );
};

export default App;
