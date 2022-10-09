import { PayloadAction, createSlice } from '@reduxjs/toolkit';

interface CounterState {
  data: number;
  error: null | string;
}

const initialState: CounterState = {
  data: 0,
  error: null,
};

const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment(state, action?: PayloadAction<number>) {
      state.data = action != null ? state.data + action.payload : state.data++;
    },
    decrement(state, action?: PayloadAction<number>) {
      state.data = action != null ? state.data - action.payload : state.data--;
    },
  },
});

export const { decrement, increment } = counterSlice.actions;

export default counterSlice.reducer;
