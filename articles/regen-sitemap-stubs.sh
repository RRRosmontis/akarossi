#!/bin/bash
# regen-sitemap-stubs.sh — akaros.si SEO 每日再生（随网站目录存放，迁移时请保留）
#
# 数据源：CDN https://cdn.rrrosmontis.icu/articles/（index.json 清单 + <id>/content.html 正文）
# 产出1：/var/www/html/akaros.si/sitemap.xml（canonical 采用 /articles/?id=NNNNN 形式）
# 产出2：/var/www/html/akaros.si/articles/<id>/index.html 轻量 stub 页
#        （真实 <title>/description/keywords/canonical，0 秒跳转到 /articles/?id=NNNNN）
# 排除：同目录 excluded.json 中的 id 不收录、不生成 stub
# 安全：CDN 拉取失败的文章跳过 stub 更新（保留旧文件）；sitemap 少于 10 个 URL 或 XML 未闭合时放弃覆盖
export LC_ALL=C.UTF-8
set -u

W=/var/www/html/akaros.si
A=$W/articles
C=https://cdn.rrrosmontis.icu/articles
SITE=https://akaros.si
T=$(mktemp)

E=$(grep -oE '"[0-9]{5}"' "$A/excluded.json" 2>/dev/null | tr -d '"' || true)

esc() { printf '%s' "$1" | sed -e 's/\&/\&amp;/g' -e 's/"/\&quot;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

dedupe_kw() { printf '%s' "$1" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | awk '!seen[$0]++' | paste -sd, -; }

# 非文章页面（静态配置）：路径, lastmod, changefreq, priority —— 页面确有更新时改这里
STATIC_PAGES='|2026-10-26|weekly|1.0
/articles/|2026-10-16|weekly|0.8
/notes/|2026-10-12|weekly|0.5
/programs/tools/markdown|2026-06-11|monthly|0.4
/programs/games/2048|2026-06-11|monthly|0.4
/programs/games/minesweeper|2026-06-11|monthly|0.4
/programs/games/thunder-fighter|2026-10-16|monthly|0.4
/programs/games/xterfusion|2026-06-11|monthly|0.4'

em() { echo " <url>"; echo "  <loc>$1</loc>"; if [ -n "$2" ]; then echo "  <lastmod>$2</lastmod>"; fi; echo "  <changefreq>$3</changefreq>"; echo "  <priority>$4</priority>"; echo " </url>"; }

IDS=$(curl -s --max-time 20 "$C/index.json" | grep -oE '"name":[[:space:]]*"[0-9]{5}"' | grep -oE '[0-9]{5}' | sort)

{
echo '<?xml version="1.0" encoding="UTF-8"?>'
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
# 首页与文章列表固定在最前
em "$SITE/" 2026-10-26 weekly 1.0
em "$SITE/articles/" 2026-10-16 weekly 0.8

for id in $IDS; do
  if echo "$E" | grep -qx "$id"; then continue; fi
  html=$(curl -s --max-time 20 "$C/$id/content.html")
  flat=$(printf '%s' "$html" | tr '\n' ' ')

  # 日期（content-info-text 内第一个 yyyy-m-d），补零
  raw=$(printf '%s' "$flat" | grep -oE 'content-info-text.{0,400}' | grep -oE '[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' | head -1)
  dt=""
  if [ -n "$raw" ]; then y=${raw%%-*}; rest=${raw#*-}; m=${rest%%-*}; d=${rest#*-}; m=$((10#$m)); d=$((10#$d)); if [ ${#m} -eq 1 ]; then m=0$m; fi; if [ ${#d} -eq 1 ]; then d=0$d; fi; dt="$y-$m-$d"; fi

  # sitemap 条目（canonical 形式）
  em "$SITE/articles/?id=$id" "$dt" monthly 0.6

  # ---- stub 页 ----
  title=$(printf '%s' "$flat" | sed -E 's|.*<h1[^>]*>||I; s|</h1>.*||I' | sed -E 's/<[^>]+>//g; s/^ +//; s/ +$//')
  if [ -z "$title" ]; then continue; fi

  noinfo=$(printf '%s' "$flat" | sed -E 's|<div class="content-info-text"> *<p[^>]*>[^<]*</p> *</div>||')
  full=$(printf '%s' "$noinfo" | awk 'match($0,/<p[^>]*>/){s=substr($0,RSTART+RLENGTH); sub(/<\/p>.*/,"",s); print s; exit}' | sed -E 's/<[^>]+>//g; s/&nbsp;/ /g; s/  +/ /g; s/^ +//; s/ +$//')
  desc=$(printf '%s' "$full" | grep -oE '^.{0,160}')
  if [ "$desc" != "$full" ]; then desc="$desc…"; fi
  if [ ${#desc} -lt 10 ]; then desc="$title"; fi

  kascii=$(printf '%s' "$title" | grep -oiE '[a-z0-9][a-z0-9.+#_-]{1,}' | paste -sd, -)
  ksegs=$(printf '%s' "$title" | sed -E 's/[[:punct:]]+|，|。|、|：|；|？|！|（|）|《|》|“|”|——|—|·/,/g')
  kh2=$(printf '%s' "$flat" | grep -oE '<h2[^>]*>[^<]*</h2>' | sed -E 's/<[^>]+>//g' | paste -sd, -)
  kw=$(dedupe_kw "RRRosmontis,RoyirinRosmontis,Royirin Rosmontis,Royirin,$title,$kascii,$ksegs,$kh2")
  kw=$(printf '%s' "$kw" | grep -oE '^.{0,400}'); kw=${kw%,*}

  # og:image：取正文第一张图（CDN 绝对地址），无图用站点 logo 兜底
  img=$(printf '%s' "$flat" | grep -oE '<img[^>]*src="[^"]+"' | head -1 | sed -E 's/.*src="([^"]+)".*/\1/')
  case "$img" in
    http*) ;;
    //*) img="https:$img" ;;
    /*) img="$SITE$img" ;;
    "") ;;
    *) img="$C/$id/$img" ;;
  esac
  if [ -z "$img" ]; then img="https://cdn.rrrosmontis.icu/logo.png"; fi

  # JSON-LD（Article 结构化数据）；日期缺失时省略 datePublished
  jesc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
  jsonld="{\"@context\":\"https://schema.org\",\"@type\":\"Article\",\"headline\":\"$(jesc "$title")\",\"description\":\"$(jesc "$desc")\",\"image\":\"$(jesc "$img")\",\"author\":{\"@type\":\"Person\",\"name\":\"Royirin Rosmontis\",\"url\":\"$SITE/\"},\"publisher\":{\"@type\":\"Organization\",\"name\":\"Royirin Rosmontis Presents\",\"url\":\"$SITE/\"},\"mainEntityOfPage\":\"$SITE/articles/?id=$id\""
  if [ -n "$dt" ]; then jsonld="$jsonld,\"datePublished\":\"$dt\""; fi
  jsonld="$jsonld}"

  mkdir -p "$A/$id"
  cat > "$A/$id/index.html" <<EOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<title>$(esc "$title") - Royirin Rosmontis Presents</title>
<meta name="description" content="$(esc "$desc")">
<meta name="keywords" content="$(esc "$kw")">
<link rel="canonical" href="$SITE/articles/?id=$id">
<meta property="og:type" content="article">
<meta property="og:title" content="$(esc "$title") - Royirin Rosmontis Presents">
<meta property="og:description" content="$(esc "$desc")">
<meta property="og:url" content="$SITE/articles/?id=$id">
<meta property="og:site_name" content="Royirin Rosmontis Presents">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(esc "$title") - Royirin Rosmontis Presents">
<meta name="twitter:description" content="$(esc "$desc")">
<meta property="og:image" content="$(esc "$img")">
<meta name="twitter:image" content="$(esc "$img")">
<script type="application/ld+json">$jsonld</script>
<link rel="icon" type="image/png" href="https://cdn.rrrosmontis.icu/favicon.png" sizes="64x64">
<meta http-equiv="refresh" content="0; url=/articles/?id=$id">
<script>location.replace("/articles/?id=$id");</script>
</head>
<body>
<h1>$(esc "$title")</h1>
<p>$(esc "$desc")</p>
<p>发布于 $dt ｜ <a href="/articles/?id=$id">阅读全文</a></p>
</body>
</html>
EOF
  chown -R www-data:www-data "$A/$id"
done

# 其余静态页面
printf '%s\n' "$STATIC_PAGES" | tail -n +3 | while IFS='|' read -r path lastmod changefreq priority; do
  em "$SITE$path" "$lastmod" "$changefreq" "$priority"
done
echo "</urlset>"
} > "$T"

if grep -q "</urlset>" "$T" && [ "$(grep -c "<url>" "$T")" -ge 10 ]; then
  cat "$T" > "$W/sitemap.xml"; chown www-data:www-data "$W/sitemap.xml"
  echo "$(date) OK: sitemap ($(grep -c "<url>" "$W/sitemap.xml") urls) + stubs ($(ls -d "$A"/0* 2>/dev/null | wc -l))"
else
  echo "$(date) FAILED: kept old sitemap"
fi
rm -f "$T"
