/**
 * 出身地（都道府県/国レベルの自由入力・JIS都道府県コード）を地図の座標へ変換する。
 *
 * フォーム（ashigaru2・cmd_751①）側の最終的な入力形式（コードか名称か）が未確定のため、
 * JIS 2桁コード・日本語県名（「県」等の接尾辞あり/なし）・英字（romaji）・国名（日本語/英語）の
 * いずれでも解決できるようにしてある。未知の入力は座標を捏造せず null を返す。
 */

type LngLat = [number, number];

// 都道府県庁所在地の代表座標 [lng, lat]。JIS X 0401 コード（"01"〜"47"）をキーに持つ。
const PREFECTURE_BY_CODE: Record<string, LngLat> = {
  "01": [141.3469, 43.0642], // 北海道
  "02": [140.7400, 40.8244], // 青森県
  "03": [141.1527, 39.7036], // 岩手県
  "04": [140.8721, 38.2688], // 宮城県
  "05": [140.1064, 39.7186], // 秋田県
  "06": [140.3633, 38.2404], // 山形県
  "07": [140.4675, 37.7503], // 福島県
  "08": [140.4467, 36.3417], // 茨城県
  "09": [139.8836, 36.5658], // 栃木県
  "10": [139.0611, 36.3911], // 群馬県
  "11": [139.6489, 35.8617], // 埼玉県
  "12": [140.1233, 35.6047], // 千葉県
  "13": [139.6917, 35.6895], // 東京都
  "14": [139.6425, 35.4475], // 神奈川県
  "15": [138.9333, 37.9022], // 新潟県
  "16": [137.2114, 36.6953], // 富山県
  "17": [136.6256, 36.5947], // 石川県
  "18": [136.2217, 36.0652], // 福井県
  "19": [138.5683, 35.6642], // 山梨県
  "20": [138.1811, 36.6513], // 長野県
  "21": [136.7223, 35.3912], // 岐阜県
  "22": [138.3831, 34.9769], // 静岡県
  "23": [136.9066, 35.1802], // 愛知県
  "24": [136.5086, 34.7303], // 三重県
  "25": [135.8686, 35.0045], // 滋賀県
  "26": [135.7681, 35.0116], // 京都府
  "27": [135.5023, 34.6863], // 大阪府
  "28": [135.1830, 34.6913], // 兵庫県
  "29": [135.8328, 34.6851], // 奈良県
  "30": [135.1675, 34.2261], // 和歌山県
  "31": [134.2383, 35.5039], // 鳥取県
  "32": [133.0500, 35.4723], // 島根県
  "33": [133.9350, 34.6617], // 岡山県
  "34": [132.4596, 34.3963], // 広島県（会場）
  "35": [131.4714, 34.1861], // 山口県
  "36": [134.5594, 34.0658], // 徳島県
  "37": [134.0475, 34.3401], // 香川県
  "38": [132.7658, 33.8417], // 愛媛県
  "39": [133.5311, 33.5597], // 高知県
  "40": [130.4181, 33.6064], // 福岡県
  "41": [130.2994, 33.2494], // 佐賀県
  "42": [129.8737, 32.7448], // 長崎県
  "43": [130.7417, 32.7898], // 熊本県
  "44": [131.6126, 33.2382], // 大分県
  "45": [131.4239, 31.9111], // 宮崎県
  "46": [130.5581, 31.5602], // 鹿児島県
  "47": [127.6809, 26.2124], // 沖縄県
};

const PREFECTURE_NAMES: { code: string; ja: string; romaji: string }[] = [
  { code: "01", ja: "北海道", romaji: "hokkaido" },
  { code: "02", ja: "青森県", romaji: "aomori" },
  { code: "03", ja: "岩手県", romaji: "iwate" },
  { code: "04", ja: "宮城県", romaji: "miyagi" },
  { code: "05", ja: "秋田県", romaji: "akita" },
  { code: "06", ja: "山形県", romaji: "yamagata" },
  { code: "07", ja: "福島県", romaji: "fukushima" },
  { code: "08", ja: "茨城県", romaji: "ibaraki" },
  { code: "09", ja: "栃木県", romaji: "tochigi" },
  { code: "10", ja: "群馬県", romaji: "gunma" },
  { code: "11", ja: "埼玉県", romaji: "saitama" },
  { code: "12", ja: "千葉県", romaji: "chiba" },
  { code: "13", ja: "東京都", romaji: "tokyo" },
  { code: "14", ja: "神奈川県", romaji: "kanagawa" },
  { code: "15", ja: "新潟県", romaji: "niigata" },
  { code: "16", ja: "富山県", romaji: "toyama" },
  { code: "17", ja: "石川県", romaji: "ishikawa" },
  { code: "18", ja: "福井県", romaji: "fukui" },
  { code: "19", ja: "山梨県", romaji: "yamanashi" },
  { code: "20", ja: "長野県", romaji: "nagano" },
  { code: "21", ja: "岐阜県", romaji: "gifu" },
  { code: "22", ja: "静岡県", romaji: "shizuoka" },
  { code: "23", ja: "愛知県", romaji: "aichi" },
  { code: "24", ja: "三重県", romaji: "mie" },
  { code: "25", ja: "滋賀県", romaji: "shiga" },
  { code: "26", ja: "京都府", romaji: "kyoto" },
  { code: "27", ja: "大阪府", romaji: "osaka" },
  { code: "28", ja: "兵庫県", romaji: "hyogo" },
  { code: "29", ja: "奈良県", romaji: "nara" },
  { code: "30", ja: "和歌山県", romaji: "wakayama" },
  { code: "31", ja: "鳥取県", romaji: "tottori" },
  { code: "32", ja: "島根県", romaji: "shimane" },
  { code: "33", ja: "岡山県", romaji: "okayama" },
  { code: "34", ja: "広島県", romaji: "hiroshima" },
  { code: "35", ja: "山口県", romaji: "yamaguchi" },
  { code: "36", ja: "徳島県", romaji: "tokushima" },
  { code: "37", ja: "香川県", romaji: "kagawa" },
  { code: "38", ja: "愛媛県", romaji: "ehime" },
  { code: "39", ja: "高知県", romaji: "kochi" },
  { code: "40", ja: "福岡県", romaji: "fukuoka" },
  { code: "41", ja: "佐賀県", romaji: "saga" },
  { code: "42", ja: "長崎県", romaji: "nagasaki" },
  { code: "43", ja: "熊本県", romaji: "kumamoto" },
  { code: "44", ja: "大分県", romaji: "oita" },
  { code: "45", ja: "宮崎県", romaji: "miyazaki" },
  { code: "46", ja: "鹿児島県", romaji: "kagoshima" },
  { code: "47", ja: "沖縄県", romaji: "okinawa" },
];

// 国名 → 座標（国土の重心付近の代表点）。FOSS4G は国際会議のため海外参加者を想定。
const COUNTRY_COORDS: Record<string, LngLat> = {
  japan: [138.2529, 36.2048],
  日本: [138.2529, 36.2048],
  france: [2.2137, 46.2276],
  フランス: [2.2137, 46.2276],
  germany: [10.4515, 51.1657],
  ドイツ: [10.4515, 51.1657],
  "united states": [-95.7129, 37.0902],
  usa: [-95.7129, 37.0902],
  アメリカ: [-95.7129, 37.0902],
  uk: [-3.436, 55.3781],
  "united kingdom": [-3.436, 55.3781],
  イギリス: [-3.436, 55.3781],
  italy: [12.5674, 41.8719],
  イタリア: [12.5674, 41.8719],
  spain: [-3.7492, 40.4637],
  スペイン: [-3.7492, 40.4637],
  netherlands: [5.2913, 52.1326],
  オランダ: [5.2913, 52.1326],
  belgium: [4.4699, 50.5039],
  ベルギー: [4.4699, 50.5039],
  switzerland: [8.2275, 46.8182],
  スイス: [8.2275, 46.8182],
  canada: [-106.3468, 56.1304],
  カナダ: [-106.3468, 56.1304],
  brazil: [-51.9253, -14.235],
  ブラジル: [-51.9253, -14.235],
  india: [78.9629, 20.5937],
  インド: [78.9629, 20.5937],
  china: [104.1954, 35.8617],
  中国: [104.1954, 35.8617],
  "south korea": [127.7669, 35.9078],
  korea: [127.7669, 35.9078],
  韓国: [127.7669, 35.9078],
  taiwan: [120.9605, 23.6978],
  台湾: [120.9605, 23.6978],
  indonesia: [113.9213, -0.7893],
  インドネシア: [113.9213, -0.7893],
  philippines: [121.774, 12.8797],
  フィリピン: [121.774, 12.8797],
  vietnam: [108.2772, 14.0583],
  ベトナム: [108.2772, 14.0583],
  thailand: [100.9925, 15.87],
  タイ: [100.9925, 15.87],
  australia: [133.7751, -25.2744],
  オーストラリア: [133.7751, -25.2744],
  "new zealand": [174.886, -40.9006],
  ニュージーランド: [174.886, -40.9006],
};

const PREFECTURE_JA_TO_CODE: Record<string, string> = {};
const PREFECTURE_ROMAJI_TO_CODE: Record<string, string> = {};
for (const p of PREFECTURE_NAMES) {
  PREFECTURE_JA_TO_CODE[p.ja] = p.code;
  // 「県/都/府」を落とした裸の名称（北海道はそのまま）でも引けるようにする。
  PREFECTURE_JA_TO_CODE[p.ja.replace(/[都道府県]$/, "")] = p.code;
  PREFECTURE_ROMAJI_TO_CODE[p.romaji] = p.code;
}

/** 出身地の自由入力（コード・和名・romaji・国名）を [lng, lat] へ解決する。未知の入力は null。 */
export function resolveOriginCoords(origin: string): LngLat | null {
  if (typeof origin !== "string") return null;
  const raw = origin.trim();
  if (!raw) return null;

  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, "0");
    const hit = PREFECTURE_BY_CODE[code];
    if (hit) return hit;
  }

  const jaCode = PREFECTURE_JA_TO_CODE[raw];
  if (jaCode) return PREFECTURE_BY_CODE[jaCode] ?? null;

  const lower = raw.toLowerCase();
  const romajiCode = PREFECTURE_ROMAJI_TO_CODE[lower];
  if (romajiCode) return PREFECTURE_BY_CODE[romajiCode] ?? null;

  const country = COUNTRY_COORDS[lower] ?? COUNTRY_COORDS[raw];
  if (country) return country;

  return null;
}
