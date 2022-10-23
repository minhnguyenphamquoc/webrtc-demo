import { Heading } from '@chakra-ui/react';
import React from 'react';
import { useParams } from 'react-router-dom';

const SpacePage: React.FC<{}> = () => {
  const { id } = useParams();
  return (
    <div>
      <Heading>Space (ID: {id})</Heading>
    </div>
  );
};

export default SpacePage;
