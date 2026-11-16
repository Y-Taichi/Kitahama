/**
 * 大阪メトロ堺筋線および直通先（阪急電鉄）の駅マッピング定義
 */

// 堺筋線の駅ナンバリング順（K11 天神橋筋六丁目 〜 K20 天下茶屋）
export const SAKAISUJI_ORDERED_STATIONS = [
  { code: "K11", num: 11, name: "天神橋筋六丁目", kana: "てんじんばしすじろくちょうめ" },
  { code: "K12", num: 12, name: "扇町", kana: "おうぎまち" },
  { code: "K13", num: 13, name: "南森町", kana: "みなみもりまち" },
  { code: "K14", num: 14, name: "北浜", kana: "きたはま", isKitahama: true },
  { code: "K15", num: 15, name: "堺筋本町", kana: "さかいすじほんまち" },
  { code: "K16", num: 16, name: "長堀橋", kana: "ながほりばし" },
  { code: "K17", num: 17, name: "日本橋", kana: "にっぽんばし" },
  { code: "K18", num: 18, name: "恵美須町", kana: "えびすちょう" },
  { code: "K19", num: 19, name: "動物園前", kana: "どうぶつえんまえ" },
  { code: "K20", num: 20, name: "天下茶屋", kana: "てんがちゃや" }
];

export const SAKAISUJI_STATIONS = Object.fromEntries(
  SAKAISUJI_ORDERED_STATIONS.map(s => [s.code, s.name])
);

export const HANKYU_STATIONS = {
  HK63: "淡路",
  HK64: "上新庄",
  HK65: "相川",
  HK66: "正雀",
  HK67: "摂津市",
  HK68: "南茨木",
  HK69: "茨木市",
  HK70: "総持寺",
  HK71: "富田",
  HK72: "高槻市",
  HK73: "上牧",
  HK74: "水無瀬",
  HK75: "大山崎",
  HK76: "西山天王山",
  HK77: "長岡天神",
  HK78: "西向日",
  HK79: "東向日",
  HK80: "洛西口",
  HK81: "桂",
  HK82: "西京極",
  HK83: "西院",
  HK84: "大宮",
  HK85: "烏丸",
  HK86: "京都河原町",
  HK87: "柴島",
  HK88: "下新庄",
  HK89: "吹田",
  HK90: "豊津",
  HK91: "関大前",
  HK92: "千里山",
  HK93: "南千里",
  HK94: "山田",
  HK95: "北千里",
  HK96: "上桂",
  HK97: "松尾大社",
  HK98: "嵐山"
};

export const ALL_STATIONS = {
  ...SAKAISUJI_STATIONS,
  ...HANKYU_STATIONS
};

/**
 * 駅コードから駅名を取得（未知の場合はコードそのものを返す）
 * @param {string} code
 * @returns {string}
 */
export function getStationName(code) {
  if (!code) return "";
  return ALL_STATIONS[code] || code;
}
