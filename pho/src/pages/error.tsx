/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import { useRouteError } from 'react-router-dom';

const ErrorPage: React.FC<{}> = () => {
  const error = useRouteError();
  console.error(error);

  return (
    <div id="error-page">
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <p>
        <i>{(error as any).statusText || (error as any).message}</i>
      </p>
    </div>
  );
};

export default ErrorPage;
