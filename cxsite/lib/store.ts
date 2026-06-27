import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import searchReducer from './slices/searchSlice'
import cartReducer from './slices/cartSlice'
import restaurantApi from './api/restaurantApi'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    search: searchReducer,
    cart: cartReducer,
    [restaurantApi.reducerPath]: restaurantApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(restaurantApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

