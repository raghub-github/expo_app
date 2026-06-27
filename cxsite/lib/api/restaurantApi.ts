import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface Restaurant {
  id: number
  name: string
  image: string
  rating: number
  totalRatings: number
  cuisine: string
  distance: string
  price: string
  deliveryTime: string
  isVeg: boolean
  tags: string[]
  description: string
  ratingDetails: {
    food: number
    service: number
    ambiance: number
    value: number
  }
  topSelling: Array<{
    name: string
    price: number
    orders: number
  }>
}

export interface MenuItem {
  name: string
  desc: string
  price: number
  isVeg: boolean
  isSpicy: boolean
  isBestseller: boolean
}

const restaurantApi = createApi({
  reducerPath: 'restaurantApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
  tagTypes: ['Restaurant'],
  endpoints: (builder) => ({
    getRestaurants: builder.query<Restaurant[], void>({
      query: () => 'restaurants',
    }),
    getRestaurantById: builder.query<Restaurant, number>({
      query: (id) => `restaurants/${id}`,
    }),
  }),
})

export const { useGetRestaurantsQuery, useGetRestaurantByIdQuery } = restaurantApi

export default restaurantApi

