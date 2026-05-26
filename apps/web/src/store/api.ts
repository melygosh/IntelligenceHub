import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type {
  ArticleDetail,
  ArticleListResponse,
  AuthResponse,
  Axis,
  AxisList,
  Category,
  CategoryList,
  ConfirmEmailRequest,
  ConfirmEmailResponse,
  CreateAxisRequest,
  CreateCategoryRequest,
  CreateFeedRequest,
  EntityDetail,
  Feed,
  FeedListResponse,
  GraphResponse,
  LoginRequest,
  PullFeedResponse,
  RegenerationRun,
  RegisterRequest,
  ResendConfirmationResponse,
  StartRegenerationResponse,
  UpdateAxisRequest,
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
  tagTypes: ['Me', 'Feeds', 'Articles', 'Article', 'Entity', 'Categories', 'Axes', 'Regeneration'],
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
    getArticles: build.query<ArticleListResponse, { categoryId?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg && arg.categoryId) params.set('category', arg.categoryId);
        const qs = params.toString();
        return `/articles${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Articles'],
    }),
    getGraph: build.query<GraphResponse, { categoryId?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg && arg.categoryId) params.set('category', arg.categoryId);
        const qs = params.toString();
        return `/graph${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Articles'],
    }),
    getArticle: build.query<ArticleDetail, string>({
      query: (id) => `/articles/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Article', id }],
    }),
    getEntity: build.query<EntityDetail, string>({
      query: (id) => `/entities/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Entity', id }],
    }),
    getCategories: build.query<CategoryList, void>({
      query: () => '/categories',
      providesTags: ['Categories'],
    }),
    createCategory: build.mutation<Category, CreateCategoryRequest>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: ['Categories'],
    }),
    deleteCategory: build.mutation<void, string>({
      query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Categories', 'Articles'],
    }),
    getAxes: build.query<AxisList, void>({
      query: () => '/axes',
      providesTags: ['Axes'],
    }),
    createAxis: build.mutation<Axis, CreateAxisRequest>({
      query: (body) => ({ url: '/axes', method: 'POST', body }),
      invalidatesTags: ['Axes'],
    }),
    updateAxis: build.mutation<Axis, { id: string; patch: UpdateAxisRequest }>({
      query: ({ id, patch }) => ({ url: `/axes/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Axes', 'Articles'],
    }),
    deleteAxis: build.mutation<void, string>({
      query: (id) => ({ url: `/axes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Axes', 'Articles'],
    }),
    getCurrentRegeneration: build.query<RegenerationRun | null, void>({
      query: () => '/regeneration/current',
      transformErrorResponse: (err) => (err.status === 404 ? null : err) as any,
      providesTags: ['Regeneration'],
    }),
    startRegeneration: build.mutation<StartRegenerationResponse, void>({
      query: () => ({ url: '/regeneration/start', method: 'POST' }),
      invalidatesTags: ['Regeneration'],
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
  useGetArticleQuery,
  useGetEntityQuery,
  useGetGraphQuery,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetAxesQuery,
  useCreateAxisMutation,
  useUpdateAxisMutation,
  useDeleteAxisMutation,
  useGetCurrentRegenerationQuery,
  useStartRegenerationMutation,
} = api;
