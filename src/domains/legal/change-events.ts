export type LegalSourceKind =
  | "administrativeAppeal"
  | "administrativeRule"
  | "committeeDecision"
  | "constitutionalDecision"
  | "courtPrecedent"
  | "enforcementDecree"
  | "enforcementRule"
  | "localOrdinance"
  | "molitInterpretation"
  | "statute"
  | "statutoryInterpretation"
  | "supremeCourtPrecedent";

export type LegalChangeKind =
  | "new"
  | "amended"
  | "repealed"
  | "effective_date_changed"
  | "unknown";

export type LegalChangeReviewState = "new" | "acknowledged";

export type LegalChangeEvent = {
  eventId: string;
  lawName: string;
  sourceKind: LegalSourceKind;
  changeKind: LegalChangeKind;
  articleNumber?: string;
  previousDigest?: string;
  currentDigest?: string;
  promulgatedAt?: string;
  effectiveFrom?: string;
  detectedAt: string;
  sourceUrl?: string;
  affectedSourceIds: string[];
  affectedTaskIds: string[];
  reviewState: LegalChangeReviewState;
};

export type LegalChangeItem = Pick<
  LegalChangeEvent,
  "eventId" | "lawName" | "changeKind" | "effectiveFrom" | "reviewState" | "affectedSourceIds" | "affectedTaskIds" | "sourceUrl"
> & {
  affectedTaskCount: number;
  reindexStatus: "needs_reindex";
};

export type LegalChangeMonitorStatus = "current" | "stale" | "missing";

export type LegalChangeMonitorFreshness = {
  status: LegalChangeMonitorStatus;
  cadenceDays: number;
  lastRunAt: string | null;
  detectedAt: string | null;
  dateWindow: string | null;
  eventCount: number;
  unchangedCount: number;
  staleSourceCount: number;
  warnings: string[];
};

export type LegalChangeListResponse = {
  items: LegalChangeItem[];
  monitor: LegalChangeMonitorFreshness;
};
