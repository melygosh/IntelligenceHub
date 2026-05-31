import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { GraphPeriod } from '@intelligencehub/shared';

/**
 * In-memory snapshot of the /graph page's view state so navigating away (to an
 * entity/article detail page) and back returns the exact same canvas + builder
 * controls + open panel/selection — instead of resetting to the default top-N.
 *
 * Serializable on purpose (arrays, not Sets) so it lives cleanly in Redux. The
 * component converts to/from Sets at the boundary. Survives navigation only —
 * a full browser reload starts fresh (no persistence layer, by design).
 */
export type GraphSelectedNode = { id: string; kind: 'article' | 'entity' };

export type GraphViewSnapshot = {
  // Builder draft (what the controls show before Build).
  draftCategoryIds: string[];
  draftPeriod: GraphPeriod;
  draftFrom?: string;
  draftTo?: string;
  draftEntitySel: string[] | null;
  draftArticleIds: string[];
  // Built (the committed params that drove the last /graph fetch).
  built: {
    categoryIds: string[];
    period: GraphPeriod;
    from?: string;
    to?: string;
    entitySel: string[] | null;
    articleIds: string[];
    anchorEntityId?: string;
  };
  // UI state to restore.
  articlesOpen: boolean;
  graphQuery: string;
  selected: GraphSelectedNode | null;
};

type GraphViewState = { snapshot: GraphViewSnapshot | null };

const initialState: GraphViewState = { snapshot: null };

const graphViewSlice = createSlice({
  name: 'graphView',
  initialState,
  reducers: {
    saveGraphView(state, action: PayloadAction<GraphViewSnapshot>) {
      state.snapshot = action.payload;
    },
    clearGraphView(state) {
      state.snapshot = null;
    },
  },
});

export const { saveGraphView, clearGraphView } = graphViewSlice.actions;
export const graphViewReducer = graphViewSlice.reducer;
