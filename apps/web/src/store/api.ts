import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type {
  ArticleDetail,
  ArticleListResponse,
  AuthResponse,
  Axis,
  AxisList,
  BuildDigestRequest,
  Category,
  CategoryList,
  ConfirmEmailRequest,
  ConfirmEmailResponse,
  CreateAxisRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateFeedRequest,
  DigestDetail,
  DigestSummary,
  EntityDetail,
  EntityKind,
  EntityListResponse,
  EntitySort,
  RecentEntitiesResponse,
  Feed,
  FeedListResponse,
  GraphResponse,
  GraphPeriod,
  LoginRequest,
  PublicConfig,
  PullAllFeedsResponse,
  PullFeedResponse,
  RegenerationRun,
  RegisterRequest,
  ResendConfirmationResponse,
  StartRegenerationResponse,
  TelemetrySummary,
  DashboardResponse,
  DashboardPeriod,
  RelatedSemanticResponse,
  UpdateAxisRequest,
  UpdateFeedRequest,
  UserResponse,
  ValidateFeedRequest,
  ValidateFeedResponse,
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
  tagTypes: [
    'Me',
    'Feeds',
    'Articles',
    'Article',
    'Entity',
    'Categories',
    'Axes',
    'Regeneration',
    'Digests',
    'Digest',
    'Telemetry',
    'Graph',
    'Dashboard',
    'RelatedSemantic',
  ],
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
    validateFeed: build.mutation<ValidateFeedResponse, ValidateFeedRequest>({
      query: (body) => ({ url: '/feeds/validate', method: 'POST', body }),
    }),
    deleteFeed: build.mutation<void, string>({
      query: (id) => ({ url: `/feeds/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Feeds'],
    }),
    pullFeed: build.mutation<PullFeedResponse, string>({
      // The pull endpoint only enqueues — the worker publishes a feed.pull.done
      // SSE event on completion which invalidates Feeds + Articles via
      // useFeedPullEvents. The 3s setTimeout fallback covers the rare case
      // where the SSE channel isn't connected.
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
    pullAllFeeds: build.mutation<PullAllFeedsResponse, void>({
      query: () => ({ url: '/feeds/pull-all', method: 'POST' }),
    }),
    updateFeed: build.mutation<Feed, { id: string; body: UpdateFeedRequest }>({
      query: ({ id, body }) => ({ url: `/feeds/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Feeds'],
    }),
    getArticles: build.query<
      ArticleListResponse,
      {
        categoryIds?: string[];
        feedIds?: string[];
        importances?: ('high' | 'normal' | 'junk')[];
        axisValueIds?: string[];
        statuses?: ('ready' | 'pending' | 'filtered' | 'failed' | 'duplicate')[];
        period?: 'all' | '24h' | '7d' | '30d' | 'custom';
        from?: string;
        to?: string;
        q?: string;
        page?: number;
        pageSize?: number;
        sort?: 'newest' | 'feed' | 'duplicates';
      } | void
    >({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg) {
          if (arg.categoryIds && arg.categoryIds.length > 0) {
            params.set('category', arg.categoryIds.join(','));
          }
          if (arg.feedIds && arg.feedIds.length > 0) {
            params.set('feed', arg.feedIds.join(','));
          }
          if (arg.importances && arg.importances.length > 0) {
            params.set('importance', arg.importances.join(','));
          }
          if (arg.axisValueIds && arg.axisValueIds.length > 0) {
            params.set('axisValue', arg.axisValueIds.join(','));
          }
          if (arg.statuses && arg.statuses.length > 0) {
            params.set('status', arg.statuses.join(','));
          }
          if (arg.period && arg.period !== 'all') params.set('period', arg.period);
          if (arg.from) params.set('from', arg.from);
          if (arg.to) params.set('to', arg.to);
          if (arg.q) params.set('q', arg.q);
          if (arg.page !== undefined) params.set('page', String(arg.page));
          if (arg.pageSize !== undefined) params.set('pageSize', String(arg.pageSize));
          if (arg.sort && arg.sort !== 'newest') params.set('sort', arg.sort);
        }
        const qs = params.toString();
        return `/articles${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Articles'],
    }),
    getGraph: build.query<
      GraphResponse,
      {
        categoryIds?: string[];
        period?: GraphPeriod;
        from?: string;
        to?: string;
        top?: number;
        anchorEntityId?: string;
        // Explicit-set mode: when either is non-empty, top-N is skipped and
        // the canvas renders exactly these IDs.
        selectedEntityIds?: string[];
        selectedArticleIds?: string[];
        timeline?: boolean;
      } | void
    >({
      // POST (not GET): explicit entity/article selections can exceed 100 UUIDs
      // each — too long for a query string — so they ride in the JSON body.
      // Still a cached query: RTK keys the cache by the arg object regardless
      // of HTTP method.
      query: (arg) => ({
        url: '/graph',
        method: 'POST',
        body: {
          categoryIds: arg?.categoryIds && arg.categoryIds.length > 0 ? arg.categoryIds : undefined,
          period: arg?.period,
          from: arg?.from,
          to: arg?.to,
          top: arg?.top,
          anchorEntityId: arg?.anchorEntityId,
          selectedEntityIds:
            arg?.selectedEntityIds && arg.selectedEntityIds.length > 0
              ? arg.selectedEntityIds
              : undefined,
          selectedArticleIds:
            arg?.selectedArticleIds && arg.selectedArticleIds.length > 0
              ? arg.selectedArticleIds
              : undefined,
          timeline: arg?.timeline ? true : undefined,
        },
      }),
      // Provide both: existing mutations + SSE handlers that invalidate
      // 'Articles' (feed pull, regen, axis/category updates) still keep the
      // graph in sync; future graph-only invalidations can target 'Graph'.
      providesTags: ['Graph', 'Articles'],
    }),
    getArticle: build.query<ArticleDetail, string>({
      query: (id) => `/articles/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Article', id }],
    }),
    getEntity: build.query<EntityDetail, string>({
      query: (id) => `/entities/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Entity', id }],
    }),
    getRecentEntities: build.query<RecentEntitiesResponse, void>({
      query: () => '/entities',
      providesTags: ['Entity'],
    }),
    getEntityList: build.query<
      EntityListResponse,
      {
        type?: EntityKind;
        q?: string;
        sort?: EntitySort;
        page?: number;
        pageSize?: number;
      } | void
    >({
      query: (args) => {
        const { type, q, sort, page, pageSize } = args ?? {};
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (q) params.set('q', q);
        params.set('sort', sort ?? 'mentions');
        if (page !== undefined) params.set('page', String(page));
        if (pageSize !== undefined) params.set('pageSize', String(pageSize));
        return `/entities?${params.toString()}`;
      },
      providesTags: ['Entity'],
    }),
    // Cached infinite-scroll entity list for the graph topbar dropdown.
    // Pages accumulate in the RTK cache keyed by {q, sort}, so closing and
    // reopening the dropdown reuses them (5-min keepUnusedDataFor) instead of
    // refetching. pageParam is the 1-based page number.
    getEntities: build.infiniteQuery<EntityListResponse, { q?: string; sort?: EntitySort }, number>(
      {
        infiniteQueryOptions: {
          initialPageParam: 1,
          getNextPageParam: (lastPage, allPages, lastPageParam) => {
            const loaded = allPages.reduce((n, p) => n + p.entities.length, 0);
            return loaded < lastPage.total ? lastPageParam + 1 : undefined;
          },
        },
        query: ({ queryArg, pageParam }) => {
          const params = new URLSearchParams();
          if (queryArg.q) params.set('q', queryArg.q);
          params.set('sort', queryArg.sort ?? 'mentions');
          params.set('page', String(pageParam));
          params.set('pageSize', '50');
          return `/entities?${params.toString()}`;
        },
        keepUnusedDataFor: 300,
        providesTags: ['Entity'],
      },
    ),
    getCategories: build.query<CategoryList, void>({
      query: () => '/categories',
      providesTags: ['Categories'],
    }),
    createCategory: build.mutation<Category, CreateCategoryRequest>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: ['Categories'],
    }),
    updateCategory: build.mutation<Category, { id: string; body: UpdateCategoryRequest }>({
      query: ({ id, body }) => ({
        url: `/categories/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Categories', 'Articles'],
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
      transformErrorResponse: (err) => ((err as FetchBaseQueryError).status === 404 ? null : err),
      providesTags: ['Regeneration'],
    }),
    startRegeneration: build.mutation<StartRegenerationResponse, void>({
      query: () => ({ url: '/regeneration/start', method: 'POST' }),
      invalidatesTags: ['Regeneration'],
    }),
    getDigests: build.query<{ items: DigestSummary[] }, void>({
      query: () => '/digests',
      providesTags: ['Digests'],
    }),
    getDigest: build.query<DigestDetail, string>({
      query: (id) => `/digests/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Digest', id }],
    }),
    startDigest: build.mutation<DigestSummary, BuildDigestRequest>({
      query: (body) => ({ url: '/digests/start', method: 'POST', body }),
      invalidatesTags: ['Digests'],
    }),
    getTelemetrySummary: build.query<TelemetrySummary, void>({
      query: () => '/telemetry/summary',
      providesTags: ['Telemetry'],
    }),
    getPublicConfig: build.query<PublicConfig, void>({
      query: () => '/config',
    }),
    getRelatedSemantic: build.query<RelatedSemanticResponse, string>({
      query: (articleId) => `/articles/${articleId}/related-semantic`,
      providesTags: (_r, _e, articleId) => [{ type: 'RelatedSemantic', id: articleId }],
    }),
    getDashboard: build.query<
      DashboardResponse,
      { period: DashboardPeriod; from?: string; to?: string }
    >({
      query: ({ period, from, to }) => {
        const params = new URLSearchParams({ period });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        return `/dashboard?${params.toString()}`;
      },
      providesTags: ['Dashboard'],
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
  useValidateFeedMutation,
  useDeleteFeedMutation,
  usePullFeedMutation,
  usePullAllFeedsMutation,
  useUpdateFeedMutation,
  useGetArticlesQuery,
  useGetArticleQuery,
  useGetEntityQuery,
  useGetRecentEntitiesQuery,
  useGetEntityListQuery,
  useGetEntitiesInfiniteQuery,
  useGetGraphQuery,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetAxesQuery,
  useCreateAxisMutation,
  useUpdateAxisMutation,
  useDeleteAxisMutation,
  useGetCurrentRegenerationQuery,
  useStartRegenerationMutation,
  useGetDigestsQuery,
  useGetDigestQuery,
  useStartDigestMutation,
  useGetTelemetrySummaryQuery,
  useGetPublicConfigQuery,
  useGetDashboardQuery,
  useGetRelatedSemanticQuery,
} = api;
