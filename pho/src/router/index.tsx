import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import IndexPage from '@/pages';
import AboutPage from '@/pages/about';
import NotFoundPage from '@/pages/notfound';
import SpacePage from '@/pages/space';

/// Routes config
const router = createBrowserRouter([
  {
    path: '/',
    element: <IndexPage />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '/spaces/:id',
    element: <SpacePage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

const AppRouter = () => {
  return <RouterProvider router={router} />;
};

export default AppRouter;
