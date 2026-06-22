import type { CombinedUsageBucket } from "@/components/ai-settings/usage-aggregation";
import styles from "./ai-settings.module.css";

type UsageChartProps = {
  buckets: CombinedUsageBucket[];
};

export function UsageChart({ buckets }: UsageChartProps) {
  const visibleBuckets = buckets.slice(-30);
  const maxValue = Math.max(
    1,
    ...visibleBuckets.map((bucket) => bucket.combinedCertainTotalTokens + bucket.localUncertainTotalTokens),
  );

  if (visibleBuckets.length === 0) {
    return (
      <div className={styles.chartEmpty}>
        <span>사용량 데이터가 없습니다.</span>
      </div>
    );
  }

  return (
    <div className={styles.chart} aria-label="AI 사용량 토큰 추이" role="img">
      <div className={styles.chartBars}>
        {visibleBuckets.map((bucket) => {
          const serviceHeight = `${Math.max(2, (bucket.serviceTotalTokens / maxValue) * 100)}%`;
          const directHeight = `${Math.max(2, (bucket.localDirectTotalTokens / maxValue) * 100)}%`;
          const uncertainHeight = `${Math.max(2, (bucket.localUncertainTotalTokens / maxValue) * 100)}%`;
          const hasService = bucket.serviceTotalTokens > 0;
          const hasDirect = bucket.localDirectTotalTokens > 0;
          const hasUncertain = bucket.localUncertainTotalTokens > 0;

          return (
            <div className={styles.chartBarGroup} key={bucket.bucket}>
              <div className={styles.chartBar} title={formatBucketTitle(bucket)}>
                {hasUncertain ? <span className={styles.chartBarUncertain} style={{ height: uncertainHeight }} /> : null}
                {hasDirect ? <span className={styles.chartBarDirect} style={{ height: directHeight }} /> : null}
                {hasService ? <span className={styles.chartBarService} style={{ height: serviceHeight }} /> : null}
              </div>
              <span className={styles.chartLabel}>{formatBucketLabel(bucket.bucket)}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.legendService} /> SaaS
        </span>
        <span>
          <i className={styles.legendDirect} /> 로컬 기록
        </span>
        <span>
          <i className={styles.legendUncertain} /> 로컬 uncertain
        </span>
      </div>
    </div>
  );
}

function formatBucketTitle(bucket: CombinedUsageBucket) {
  return [
    bucket.bucket,
    `SaaS ${formatNumber(bucket.serviceTotalTokens)}`,
    `local recorded ${formatNumber(bucket.serverLocalTotalTokens)}`,
    `local direct ${formatNumber(bucket.localDirectTotalTokens)}`,
    `local uncertain ${formatNumber(bucket.localUncertainTotalTokens)}`,
  ].join(" / ");
}

function formatBucketLabel(bucket: string) {
  return bucket.length > 7 ? bucket.slice(5) : bucket;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
