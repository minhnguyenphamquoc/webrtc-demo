import React from 'react';
import { Helmet } from 'react-helmet';

import Counter from '@/components/Counter';

const IndexPage: React.FC<{}> = () => {
  return (
    <>
      {/* Meta section */}
      <Helmet>
        <title>McHouse - Chill lounge</title>
        <meta
          name="Let's chill in this McHouse Lounge"
          content="McHouse application"
        />
      </Helmet>
      {/* Body */}
      <div>
        <h1>Index Page</h1>
        <Counter />
      </div>
    </>
  );
};

export default IndexPage;
