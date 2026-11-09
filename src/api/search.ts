import { request } from '@/utils/request'
import type {
  ArtistSearchHit,
  EventSearchHit,
  PlaceSearchHit,
  SearchResponse,
} from '@/types/search'

export const searchApi = {
  artists: (params: { q: string; type?: string; country?: string }) =>
    request<SearchResponse<ArtistSearchHit>>('/search/artists', { method: 'GET', data: params }),

  events: (params: { q: string; type?: string; status?: string }) =>
    request<SearchResponse<EventSearchHit>>('/search/events', { method: 'GET', data: params }),

  places: (params: { q: string; country?: string }) =>
    request<SearchResponse<PlaceSearchHit>>('/search/places', { method: 'GET', data: params }),
}
