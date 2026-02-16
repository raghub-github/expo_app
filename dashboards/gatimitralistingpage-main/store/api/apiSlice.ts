import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers) => {
    return headers;
  },
});

export const apiSlice = createApi({
  baseQuery,
  tagTypes: ['Order', 'User', 'Agent', 'Permission', 'Department'],
  endpoints: () => ({}),
});



