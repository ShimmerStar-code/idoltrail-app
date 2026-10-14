import { request } from '@/utils/request'

export const searchApi = {
  artists: (params: { q: string; type?: string; country?: string }) =>
    request<any>('/search/artists', { method: 'GET', data: params }),

  events: (params: { q: string; type?: string; status?: string }) =>
    request<any>('/search/events', { method: 'GET', data: params }),

  places: (params: { q: string; country?: string }) =>
    request<any>('/search/places', { method: 'GET', data: params }),
}
