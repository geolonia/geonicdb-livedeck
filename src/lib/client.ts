import GeonicDB from "@geolonia/geonicdb-sdk";
import { config, contributionConnConfig } from "./config";

/**
 * 設定済みの GeonicDB SDK クライアントを生成する。
 *
 * デッキ全体で **1 つの API キー**（`config.key` / `VITE_GEONICDB_KEY`）を共用する。
 * このキーは統合ポリシー `geonicdb-livedeck-deck` にバインドされ、各デモが必要とする
 * 型別の GET/POST・WS を許可している（origin 制限＋DPoP 必須）。接続先・テナント・
 * キーの扱いをこの 1 か所に集約する。
 */
export function createClient(): GeonicDB {
  return new GeonicDB({
    apiKey: config.key,
    tenant: config.tenant,
    baseUrl: config.baseUrl,
  });
}

/**
 * 会場投稿(Contribution)専用の GeonicDB SDK クライアントを生成する。
 *
 * 他デモとは別に、ENTERPRISE契約・200名負荷試験済みのテナント
 * `foss4g_hiroshima_2026` 向けの integration key で接続する(`createClient()` の
 * デッキ共通キーとは別物・混同禁物)。
 */
export function createContributionClient(): GeonicDB {
  return new GeonicDB({
    apiKey: contributionConnConfig.key,
    tenant: contributionConnConfig.tenant,
    baseUrl: contributionConnConfig.baseUrl,
  });
}
