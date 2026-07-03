import GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "./config";

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
