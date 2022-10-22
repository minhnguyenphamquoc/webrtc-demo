import { ChakraProvider } from '@chakra-ui/react';
import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import WebSocketProvider from '@/modules/ws/WebSocketProvider';
import IndexPage from '@/pages';
import AboutPage from '@/pages/about';
import ErrorPage from '@/pages/error';
import { store } from '@/states/store';

/// Routes config
const router = createBrowserRouter([
  {
    path: '/',
    element: <IndexPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
]);

const App: React.FC<{}> = () => {
  return (
    <>
      <HelmetProvider>
        <Provider store={store}>
          <WebSocketProvider>
            <ChakraProvider>
              <RouterProvider router={router} />
            </ChakraProvider>
          </WebSocketProvider>
        </Provider>
      </HelmetProvider>
    </>
  );
};

export default App;
