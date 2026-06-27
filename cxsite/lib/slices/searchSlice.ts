import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface SearchState {
  query: string
  results: any[]
  isSearching: boolean
  showSuggestions: boolean
}

const initialState: SearchState = {
  query: '',
  results: [],
  isSearching: false,
  showSuggestions: false,
}

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload
    },
    setResults: (state, action: PayloadAction<any[]>) => {
      state.results = action.payload
    },
    setIsSearching: (state, action: PayloadAction<boolean>) => {
      state.isSearching = action.payload
    },
    setShowSuggestions: (state, action: PayloadAction<boolean>) => {
      state.showSuggestions = action.payload
    },
    clearSearch: (state) => {
      state.query = ''
      state.results = []
      state.showSuggestions = false
    },
  },
})

export const { setQuery, setResults, setIsSearching, setShowSuggestions, clearSearch } = searchSlice.actions

export default searchSlice.reducer

