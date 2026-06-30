import GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "./config";
import type { DeckConfig } from "./config";

/**
 * 設定済みの GeonicDB SDK クライアントを生成する。
 *
 * 各ライブデモはこのファクトリ経由で SDK を初期化することで、接続先・テナント・
 * API キーの扱いを 1 か所に集約している（SDK の使い方を読みやすくするのが狙い）。
 *
 * @param key 使用する API キー（`readonly` または `survey`）
 */
export function createClient(key: keyof DeckConfig["keys"]): GeonicDB {
  return new GeonicDB({
    apiKey: config.keys[key],
    tenant: config.tenant,
    baseUrl: config.baseUrl,
  });
}
