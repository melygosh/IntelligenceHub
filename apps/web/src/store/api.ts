import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type {
  ArticleListResponse,
  AuthResponse,
  ConfirmEmailRequest,
  ConfirmEmailResponse,
  CreateFeedRequest,
  Feed,
  FeedListResponse,
  GraphResponse,
  LoginRequest,
  PullFeedResponse,
  RegisterRequest,
  ResendConfirmationResponse,
  UpdateFeedRequest,
  UserResponse,
} from '@intelligencehub/shared';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
});

const baseQueryWithUnconfirmedHandling: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (
    result.error &&
    result.error.status === 403 &&
    typeof result.error.data === 'object' &&
    result.error.data &&
    (result.error.data as { error?: string }).error === 'email_unconfirmed' &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/auth/')
  ) {
    window.location.assign('/auth/check-email');
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithUnconfirmedHandling,
  tagTypes: ['Me', 'Feeds', 'Articles'],
  endpoints: (build) => ({
    register: build.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    login: build.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me', 'Feeds', 'Articles'],
    }),
    getMe: build.query<UserResponse, void>({
      query: () => ({ url: '/auth/me', method: 'GET' }),
      providesTags: ['Me'],
    }),
    confirmEmail: build.mutation<ConfirmEmailResponse, ConfirmEmailRequest>({
      query: (body) => ({ url: '/auth/confirm', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    resendConfirmation: build.mutation<ResendConfirmationResponse, void>({
      query: () => ({ url: '/auth/resend-confirmation', method: 'POST' }),
    }),
    getFeeds: build.query<FeedListResponse, void>({
      query: () => ({ url: '/feeds', method: 'GET' }),
      providesTags: ['Feeds'],
    }),
    createFeed: build.mutation<Feed, CreateFeedRequest>({
      query: (body) => ({ url: '/feeds', method: 'POST', body }),
      invalidatesTags: ['Feeds'],
    }),
    deleteFeed: build.mutation<void, string>({
      query: (id) => ({ url: `/feeds/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Feeds'],
    }),
    pullFeed: build.mutation<PullFeedResponse, string>({
      // The pull endpoint only enqueues — the worker updates feed.title/lastPullAt/status
      // asynchronously. Refetch Feeds + Articles after a delay so the UI reflects the
      // worker's results. 3s is enough for a typical RSS feed (10s parser timeout).
      query: (id) => ({ url: `/feeds/${id}/pull`, method: 'POST' }),
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          return;
        }
        setTimeout(() => {
          dispatch(api.util.invalidateTags(['Feeds', 'Articles']));
        }, 3000);
      },
    }),
    updateFeed: build.mutation<Feed, { id: string; body: UpdateFeedRequest }>({
      query: ({ id, body }) => ({ url: `/feeds/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Feeds'],
    }),
    getArticles: build.query<ArticleListResponse, void>({
      query: () => ({ url: '/articles', method: 'GET' }),
      providesTags: ['Articles'],
    }),
    getGraph: build.query<GraphResponse, void>({
      query: () => ({ url: '/graph', method: 'GET' }),
      providesTags: ['Articles'],
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useConfirmEmailMutation,
  useResendConfirmationMutation,
  useGetFeedsQuery,
  useCreateFeedMutation,
  useDeleteFeedMutation,
  usePullFeedMutation,
  useUpdateFeedMutation,
  useGetArticlesQuery,
  useGetGraphQuery,
} = api;
