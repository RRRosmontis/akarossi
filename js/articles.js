/* 主站首页 Articles 动态加载（articles.js）
 * - 从 articles 目录接口读取文章 id，固定加载最新的 5 篇
 * - 从各文章 content.html 中提取标题与时间
 * - 屏蔽列表与 articles/index.html 的列表页同步（读取 /articles/excluded.json）
 */
(function() {
    'use strict';

    /* 主页 URL 带 #Articles 时：不再滚动到 Articles 框，而是跳转到文章索引页 */
    function handleArticlesHash() {
        if (window.location.hash === '#Articles') {
            window.location.replace('/articles/index.html');
        }
    }
    handleArticlesHash();
    window.addEventListener('hashchange', handleArticlesHash);

    /* 主页 URL 带 #Programs 时：跳转到 Rosmanka Inc. 首页的业务列表 */
    function handleProgramsHash() {
        if (window.location.hash === '#Programs') {
            window.location.replace('https://rosmanka.rrrosmontis.icu/index.html#services');
        }
    }
    handleProgramsHash();
    window.addEventListener('hashchange', handleProgramsHash);

    var MAX_ARTICLES = 5;
    var EXCLUDED_IDS = ['00000', '00002']; // 默认值，优先从 /articles/excluded.json 读取
    var EXCLUDED_API = '/articles/excluded.json';
    var CDN_ARTICLES = 'https://cdn.rrrosmontis.icu/articles';
    var LIST_API = CDN_ARTICLES + '/index.json';
    var CONTAINER_ID = 'home-articles';

    function isFiveDigit(name) {
        return /^\d{5}$/.test(name);
    }

    /* 等待 #home-articles 容器出现（body.html 由 app.js 异步注入） */
    function waitForContainer(cb, tries) {
        var el = document.getElementById(CONTAINER_ID);
        if (el) { cb(el); return; }
        if (!tries) return;
        setTimeout(function() { waitForContainer(cb, tries - 1); }, 150);
    }

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

    /* 从 content.html 提取标题与时间 */
    function parseContent(html) {
        var doc;
        try {
            doc = new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
            return {};
        }
        // Match the article index: first body paragraph (excluding date), up to 110 chars.
        var box = doc.querySelector('.additional-box') || doc.body;
        var image = box.querySelector('img');
        var desc = '';
        var paragraphs = box.querySelectorAll('p');
        for (var i = 0; i < paragraphs.length; i++) {
            var text = (paragraphs[i].textContent || '').trim();
            if (!text || paragraphs[i].closest('.content-info-text')) continue;
            desc = text;
            break;
        }
        if (desc.length > 110) desc = desc.slice(0, 110) + '…';
        var h1 = doc.querySelector('.title-container h1') || box.querySelector('h1') || doc.querySelector('h1');
        var dateEl = doc.querySelector('.content-info-text p');
        var dateText = dateEl ? dateEl.textContent.replace(/\s+/g, ' ').trim() : '';
        var dateMatch = dateText.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}/);
        return {
            title: h1 ? h1.textContent.trim() : '',
            img: image ? image.getAttribute('src') : null,
            desc: desc,
            date: dateMatch ? dateMatch[0] : dateText
        };
    }

    function renderRow(container, id, meta) {
        var box = document.createElement('div');
        box.className = 'article-title-box';

        var titleP = document.createElement('button');
        titleP.type = 'button';
        titleP.className = 'article-title home-article-preview-toggle';
        titleP.setAttribute('aria-controls', 'home-article-preview-' + id);
        titleP.setAttribute('aria-expanded', 'false');
        titleP.textContent = meta.title || ('文章 ' + id);

        var dateP = document.createElement('p');
        dateP.className = 'article-date';
        dateP.textContent = meta.date || '';

        var jump = document.createElement('a');
        jump.className = 'jump-button';
        jump.href = '/articles/index.html?id=' + id;
        jump.target = '_blank';
        jump.textContent = '➙';

        box.appendChild(titleP);
        box.appendChild(dateP);
        box.appendChild(jump);
        var entry = document.createElement('div');
        entry.className = 'home-article-entry';
        entry.appendChild(box);

        var preview = document.createElement('div');
        preview.className = 'home-article-preview';
        preview.id = 'home-article-preview-' + id;
        preview.setAttribute('aria-hidden', 'true');
        var panel = document.createElement('div');
        panel.className = 'home-article-preview-panel';
        var media = document.createElement('div');
        media.className = 'home-article-preview-media';
        function noImage() {
            media.textContent = 'NO IMAGE';
            media.classList.add('no-image');
        }
        if (meta.img) {
            try {
                var imageUrl = new URL(meta.img, CDN_ARTICLES + '/' + id + '/content.html');
                if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') throw new Error('Unsupported image URL');
                var img = document.createElement('img');
                img.src = imageUrl.href;
                img.alt = meta.title || ('文章 ' + id);
                img.loading = 'lazy';
                img.addEventListener('error', noImage, {once: true});
                media.appendChild(img);
            } catch (e) { noImage(); }
        } else { noImage(); }
        var desc = document.createElement('p');
        desc.className = 'home-article-preview-desc';
        desc.textContent = meta.desc || '暂无简介';
        panel.appendChild(media);
        panel.appendChild(desc);
        preview.appendChild(panel);
        entry.appendChild(preview);
        container.appendChild(entry);

        var hoverQuery = window.matchMedia('(min-width: 1025px) and (hover: hover) and (pointer: fine)');
        function pcHoverEnabled() {
            return document.documentElement.getAttribute('data-device') === 'pc' && hoverQuery.matches;
        }
        function openPreview() {
            entry.classList.add('preview-open');
            preview.setAttribute('aria-hidden', 'false');
            titleP.setAttribute('aria-expanded', 'true');
        }
        function closePreview() {
            entry.classList.remove('preview-open');
            preview.setAttribute('aria-hidden', 'true');
            titleP.setAttribute('aria-expanded', 'false');
        }
        // Desktop keeps its original hover condition; touch/mobile toggles by tapping the row.
        entry.addEventListener('mouseenter', function() {
            if (pcHoverEnabled()) openPreview();
        });
        entry.addEventListener('mouseleave', function() {
            if (pcHoverEnabled()) closePreview();
        });
        entry.addEventListener('focusin', function() {
            if (pcHoverEnabled()) openPreview();
        });
        entry.addEventListener('focusout', function(event) {
            if (pcHoverEnabled() && !entry.contains(event.relatedTarget)) closePreview();
        });
        box.addEventListener('click', function(event) {
            if (event.target.closest('a')) return; // Arrow still navigates, never toggles.
            if (pcHoverEnabled() && event.pointerType !== 'touch') return;
            entry.classList.contains('preview-open') ? closePreview() : openPreview();
        });
        document.addEventListener('click', function(event) {
            if (!entry.contains(event.target)) closePreview();
        });
        entry.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') closePreview();
        });
        window.addEventListener('resize', function() {
            if (!pcHoverEnabled()) closePreview();
        });
    }

    /* Swap the container's content while smoothing any height change, so articles that
       arrive after the box is already visible grow it instead of making the page jump. */
    function swapContent(container, fill) {
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var startHeight = container.getBoundingClientRect().height;
        fill();
        if (reduceMotion) return;
        var endHeight = container.getBoundingClientRect().height;
        if (Math.abs(endHeight - startHeight) < 2) return;

        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            container.style.height = '';
            container.classList.remove('home-articles-resizing');
            container.removeEventListener('transitionend', finish);
        }
        container.style.height = startHeight + 'px';
        container.classList.add('home-articles-resizing');
        container.getBoundingClientRect(); // Commit the start height before transitioning.
        container.style.height = endHeight + 'px';
        container.addEventListener('transitionend', finish);
        setTimeout(finish, 700);
    }

    function init() {
        waitForContainer(function(container) {
            loadExcluded().then(function() {
                return fetch(LIST_API);
            }).then(function(res) {
                if (!res.ok) throw new Error('list api status ' + res.status);
                return res.json();
            }).then(function(entries) {
                var ids = [];
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    if (e.type === 'directory' && isFiveDigit(e.name) && EXCLUDED_IDS.indexOf(e.name) === -1) {
                        ids.push(e.name);
                    }
                }
                ids.sort();
                ids.reverse();
                ids = ids.slice(0, MAX_ARTICLES);
                if (!ids.length) {
                    swapContent(container, function() {
                        container.innerHTML = '<p style="color:#999;">暂无文章</p>';
                    });
                    return;
                }
                return Promise.all(ids.map(function(id) {
                    return fetch(CDN_ARTICLES + '/' + id + '/content.html')
                        .then(function(r) { return r.ok ? r.text() : null; })
                        .catch(function() { return null; });
                })).then(function(htmls) {
                    swapContent(container, function() {
                        container.innerHTML = '';
                        for (var j = 0; j < ids.length; j++) {
                            var meta = htmls[j] ? parseContent(htmls[j]) : {};
                            renderRow(container, ids[j], meta);
                        }
                    });
                });
            }).catch(function() {
                swapContent(container, function() {
                    container.innerHTML = '<p style="color:#999;">文章加载失败</p>';
                });
            });
        }, 40);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
