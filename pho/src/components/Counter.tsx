import { Button } from '@chakra-ui/react';
import React from 'react';

import { decrement, increment } from '@/states/counter/slice';
import { useAppDispatch, useAppSelector } from '@/states/hooks';

const Counter: React.FC<{}> = () => {
  const { data } = useAppSelector((state) => state.counterSlice);
  const dispatch = useAppDispatch();
  return (
    <>
      <div>
        <p>
          <b>Counter value: {data}</b>
        </p>
        <Button onClick={() => dispatch(increment(1))}>Increment (+)</Button>
        <Button onClick={() => dispatch(decrement(1))}>Decrement (-)</Button>
      </div>
    </>
  );
};

export default Counter;
