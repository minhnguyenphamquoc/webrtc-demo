import { ChakraProvider } from '@chakra-ui/react';
import React from 'react';
import { Provider } from 'react-redux';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

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
      <Provider store={store}>
        <ChakraProvider>
          <RouterProvider router={router} />
        </ChakraProvider>
      </Provider>
    </>
  );
};

export default App;
