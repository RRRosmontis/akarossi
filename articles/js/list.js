/* 文章列表自动生成（list.js）
 * - 无 ?id= 参数时渲染文章列表（瀑布流，id 越大越靠上）
 * - 通过 nginx autoindex JSON 接口读取 articles 目录下的五位数字文件夹
 * - 排除列表中的 id 不写入列表
 */
(function() {
    'use strict';

    // 不写入列表的文章 id（默认值；优先从 /articles/excluded.json 读取，与主站 articles.js 同步）
    var EXCLUDED_IDS = ['00000', '00002'];
    // 公共屏蔽列表接口
    var EXCLUDED_API = '/articles/excluded.json';
    // CDN 上的文章目录清单与动态 HTML（更新文章无需重新部署 Pages）
    var CDN_ARTICLES = 'https://cdn.rrrosmontis.icu/articles';
    var LIST_API = CDN_ARTICLES + '/index.json';
    // 文章数据（用于搜索）
    var articlesData = [];

    function isFiveDigit(name) {
        return /^\d{5}$/.test(name);
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeRegExp(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    /* 高亮关键词（不区分大小写） */
    function highlight(text, q) {
        var safe = escapeHtml(text);
        if (!q) return safe;
        try {
            var re = new RegExp('(' + escapeRegExp(escapeHtml(q)) + ')', 'ig');
            return safe.replace(re, '<mark>$1</mark>');
        } catch (e) {
            return safe;
        }
    }

    /* 读取公共屏蔽列表；失败时保留内置默认值 */
    function loadExcluded() {
        return fetch(EXCLUDED_API)
            .then(function(res) { return res.ok ? res.json() : null; })
            .catch(function() { return null; })
            .then(function(list) {
                if (Array.isArray(list) && list.length) {
                    EXCLUDED_IDS = list;
                }
            });
    }

    function init() {
        var params = new URLSearchParams(window.location.search);
        if (params.get('id')) return; // 有 id：交给 main.js 加载文章

        var list = document.getElementById('article-list');
        if (!list) return;
        list.style.display = 'block';

        // 列表页隐藏文章页专属元素（mobile-only 的 !important 会覆盖普通 inline，需用 important）
        var artLoading = document.getElementById('article-loading');
        var artError = document.getElementById('article-error');
        if (artLoading) artLoading.style.display = 'none';
        if (artError) artError.style.display = 'none';
        var tocBar = document.getElementById('mobile-toc-bar');
        var tocPanel = document.getElementById('mobile-toc-panel');
        if (tocBar) tocBar.style.setProperty('display', 'none', 'important');
        if (tocPanel) tocPanel.style.setProperty('display', 'none', 'important');

        initSearch();

        loadExcluded().then(function() {
            return fetch(LIST_API);
        })
            .then(function(res) {
                if (!res.ok) throw new Error('list api status ' + res.status);
                return res.json();
            })
            .then(function(entries) {
                var ids = [];
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    if (e.type === 'directory' && isFiveDigit(e.name) && EXCLUDED_IDS.indexOf(e.name) === -1) {
                        ids.push(e.name);
                    }
                }
                ids.sort();    // 升序
                ids.reverse(); // 降序：id 越大越靠上
                if (!ids.length) {
                    showError();
                    return;
                }
                loadArticles(ids);
            })
            .catch(function() {
                showError();
            });
    }

    function showError() {
        var loading = document.getElementById('list-loading');
        var err = document.getElementById('list-error');
        if (loading) loading.style.display = 'none';
        if (err) err.style.display = 'block';
    }

    function loadArticles(ids) {
        var container = document.getElementById('list-container');
        if (!container) return;
        var loading = document.getElementById('list-loading');

        Promise.all(ids.map(function(id) {
            return fetch(CDN_ARTICLES + '/' + id + '/content.html')
                .then(function(res) { return res.ok ? res.text() : null; })
                .catch(function() { return null; });
        })).then(function(htmls) {
            articlesData = [];
            for (var i = 0; i < ids.length; i++) {
                var meta = htmls[i] ? parseContent(htmls[i]) : {};
                var el = renderCard(container, ids[i], meta, i);
                articlesData.push({
                    id: ids[i],
                    title: meta.title || ('文章 ' + ids[i]),
                    desc: meta.desc || '',
                    date: meta.date || '',
                    el: el
                });
            }
            if (window.innerWidth >= 768) syncMediaSizes(container);
            if (loading) loading.style.display = 'none';
        });
    }

    /* pad/pc：图片区纵向占满（CSS stretch），宽度按 4:3 收敛设置，上限 45% 防过宽 */
    function syncMediaSizes(container) {
        var cards = container.querySelectorAll('.article-card');
        for (var iter = 0; iter < 3; iter++) {
            var changed = false;
            for (var i = 0; i < cards.length; i++) {
                var media = cards[i].querySelector('.card-media');
                var body = cards[i].querySelector('.card-body');
                if (!media || !body) continue;
                var targetW = body.offsetHeight * 4 / 3;
                var maxW = cards[i].clientWidth * 0.45;
                targetW = Math.min(targetW, maxW);
                if (Math.abs(media.clientWidth - targetW) > 1) {
                    media.style.width = targetW + 'px';
                    changed = true;
                }
            }
            if (!changed) break;
        }
    }

    /* 从 content.html 提取标题 / 图片 / 简介 / 日期 */
    function parseContent(html) {
        var doc;
        try {
            doc = new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
            return {};
        }
        var box = doc.querySelector('.additional-box') || doc.body;
        var h1 = doc.querySelector('.title-container h1') || box.querySelector('h1') || doc.querySelector('h1');
        var img = box.querySelector('img');
        var desc = '';
        var ps = box.querySelectorAll('p');
        for (var i = 0; i < ps.length; i++) {
            var t = (ps[i].textContent || '').trim();
            if (!t) continue;
            // 跳过日期行（.content-info-text 内），简介取正文开头
            if (ps[i].closest && ps[i].closest('.content-info-text')) continue;
            desc = t;
            break;
        }
        if (desc.length > 110) desc = desc.slice(0, 110) + '…';
        var dateEl = doc.querySelector('.content-info-text p');
        var dateText = dateEl ? dateEl.textContent.replace(/\s+/g, ' ').trim() : '';
        // 提取形如 "2026-8-13 18:33" 的日期时间
        var dateMatch = dateText.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}/);
        return {
            title: h1 ? h1.textContent.trim() : '',
            img: img ? img.getAttribute('src') : null,
            desc: desc,
            date: dateMatch ? dateMatch[0] : dateText
        };
    }

    function renderCard(container, id, meta, index) {
        var a = document.createElement('a');
        a.className = 'article-card';
        a.id = 'art-' + id;              // 锚点 id，供搜索结果平滑跳转
        a.href = '?id=' + id;
        a.setAttribute('data-id', id);
        // 入场动画：逐卡递增延迟；动画结束后移除动画以便 hover 位移生效
        a.style.animationDelay = (0.05 + (index || 0) * 0.09) + 's';
        a.addEventListener('animationend', function() {
            a.style.animation = 'none';
            a.style.opacity = '1';
        });

        var media = document.createElement('div');
        media.className = 'card-media';
        if (meta.img) {
            var img = document.createElement('img');
            img.src = meta.img;
            img.alt = meta.title || id;
            img.loading = 'lazy';
            media.appendChild(img);
        } else {
            media.classList.add('no-image');
            media.textContent = 'NO IMAGE';
        }

        var body = document.createElement('div');
        body.className = 'card-body';

        var h2 = document.createElement('h2');
        h2.className = 'card-title';
        h2.textContent = meta.title || ('文章 ' + id);

        var desc = document.createElement('p');
        desc.className = 'card-desc';
        desc.textContent = meta.desc || '暂无简介';

        var metaRow = document.createElement('div');
        metaRow.className = 'card-meta';
        var idSpan = document.createElement('span');
        idSpan.className = 'card-id';
        idSpan.textContent = '#' + id;
        var dateSpan = document.createElement('span');
        dateSpan.className = 'card-date';
        dateSpan.textContent = meta.date || '';
        metaRow.appendChild(idSpan);
        metaRow.appendChild(dateSpan);

        body.appendChild(h2);
        body.appendChild(desc);
        body.appendChild(metaRow);

        a.appendChild(media);
        a.appendChild(body);
        container.appendChild(a);
        return a;
    }

    /* ---------- Bing 式搜索：实时过滤、下拉动画、关键词高亮、点击平滑跳转 ---------- */
    function initSearch() {
        var input = document.getElementById('search-input');
        var results = document.getElementById('search-results');
        if (!input || !results) return;
        var timer = null;

        input.addEventListener('input', function() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() { doSearch(input.value, results); }, 120);
        });
        input.addEventListener('focus', function() {
            if (input.value.trim()) results.classList.add('open');
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') results.classList.remove('open');
        });
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#article-search')) results.classList.remove('open');
        });
    }

    function doSearch(q, results) {
        q = q.trim();
        if (!q) {
            results.classList.remove('open');
            results.innerHTML = '';
            return;
        }
        var lower = q.toLowerCase();
        var matches = articlesData.filter(function(d) {
            return (d.title + ' ' + d.desc + ' ' + d.id + ' ' + d.date).toLowerCase().indexOf(lower) !== -1;
        });
        if (!matches.length) {
            results.innerHTML = '<div class="search-result-empty">无匹配文章</div>';
        } else {
            results.innerHTML = matches.slice(0, 8).map(function(d) {
                return '<a class="search-result-item" href="#art-' + d.id + '">' +
                    '<div class="search-result-title">' + highlight(d.title, q) + '</div>' +
                    (d.desc ? '<div class="search-result-desc">' + highlight(d.desc, q) + '</div>' : '') +
                    '<span class="search-result-id">#' + d.id + '</span>' +
                    '</a>';
            }).join('');
        }
        results.classList.add('open');
        results.querySelectorAll('.search-result-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                var id = item.getAttribute('href').substring(1);
                var target = document.getElementById(id);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // 目标卡片短暂高亮
                    target.classList.add('search-target');
                    setTimeout(function() { target.classList.remove('search-target'); }, 1800);
                }
                results.classList.remove('open');
                var inp = document.getElementById('search-input');
                if (inp) inp.value = '';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 窗口尺寸变化（旋转/缩放）时重算图片宽度
    var resizeTimer = null;
    window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            var container = document.getElementById('list-container');
            if (container && container.children.length && window.innerWidth >= 768) {
                syncMediaSizes(container);
            }
        }, 250);
    });
})();
