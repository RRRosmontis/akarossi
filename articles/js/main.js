(function() {
    const rightLogo = document.querySelector('.right-logo');
    const dropdown = document.querySelector('.dropdown-menu');
    if(rightLogo && dropdown) {
        rightLogo.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        document.addEventListener('click', function(e) {
            if(!rightLogo.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }
    const hamburger = document.querySelector('.hamburger');
    if(hamburger) {
        hamburger.addEventListener('click', function() {
        });
    }
})();

(function() {
    var panel = document.getElementById('mobile-toc-panel');
    var toggle = document.getElementById('mobile-toc-toggle');
    var bar = document.getElementById('mobile-toc-bar');
    var currentLabel = document.getElementById('mobile-toc-current');
    if (!panel || !toggle) return;

    var tocInner = null;
    if (currentLabel) {
        tocInner = document.createElement('span');
        tocInner.className = 'toc-text';
        tocInner.textContent = currentLabel.textContent;
        currentLabel.textContent = '';
        currentLabel.appendChild(tocInner);
    }

    var progressEl = document.querySelector('.toc-progress-text');
    var lastProgress = -1;

    if (progressEl) {
        progressEl.textContent = '0%';
    }

    function setProgressText(text) {
        if (!progressEl || progressEl.textContent === text) return;
        var scrollingDown = window.scrollY > lastScrollY;
        var inStart = scrollingDown ? 'translateY(100%)' : 'translateY(-100%)';

        progressEl.style.transition = 'none';
        progressEl.style.transform = inStart;
        progressEl.style.opacity = '0';
        progressEl.textContent = text;

        void progressEl.offsetHeight;

        progressEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        progressEl.style.transform = 'translateY(0)';
        progressEl.style.opacity = '1';
    }

    function setDesktopProgress(text) {
        var card = document.querySelector('.toc-progress-card');
        if (!card) return;
        var bar = card.querySelector('.toc-progress-ring-bar');
        var percent = card.querySelector('.toc-progress-percent');
        var p = parseInt(text, 10) || 0;
        var CIRC = 97.4;
        if (bar) bar.style.strokeDashoffset = String(CIRC * (1 - p / 100));
        if (percent) percent.textContent = text;
    }

    var open = false;

    function closePanel() {
        open = false;
        panel.classList.remove('open');
        toggle.classList.remove('open');
    }

    toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        open = !open;
        if (open) {
            panel.classList.add('open');
            toggle.classList.add('open');
        } else {
            closePanel();
        }
    });

    document.addEventListener('click', function(e) {
        if (open && !bar.contains(e.target) && !panel.contains(e.target)) {
            closePanel();
        }
    });

    var headings = [];
    var fallbackText = '';
    var lastScrollY = window.scrollY;
    var tocAnimTimer = null;

    function setTocText(text) {
        if (!tocInner || tocInner.textContent === text) return;
        var scrollingDown = window.scrollY > lastScrollY;
        var inStart = scrollingDown ? 'translateY(100%)' : 'translateY(-100%)';

        if (tocAnimTimer) clearTimeout(tocAnimTimer);

        tocInner.style.transition = 'none';
        tocInner.style.transform = inStart;
        tocInner.style.opacity = '0';
        tocInner.textContent = text;

        void tocInner.offsetHeight;

        tocInner.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        tocInner.style.transform = 'translateY(0)';
        tocInner.style.opacity = '1';
    }

    window.updateMobileTOC = function(h2s, h1text) {
        headings = h2s;
        fallbackText = h1text || '';
        var html = '';
        for (var i = 0; i < headings.length; i++) {
            var h = headings[i];
            html += '<a href="#' + h.id + '" data-index="' + i + '">' + h.text + '</a>';
        }
        panel.innerHTML = html || '<span style="color:#aaa;">无分点</span>';
        var links = panel.querySelectorAll('a');
        for (var j = 0; j < links.length; j++) {
            links[j].addEventListener('click', function(e) {
                e.preventDefault();
                var target = document.getElementById(this.getAttribute('href').substring(1));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
                closePanel();
            });
        }
        if (currentLabel) {
            if (!tocInner || !tocInner.parentNode) {
                currentLabel.textContent = '';
                tocInner = document.createElement('span');
                tocInner.className = 'toc-text';
                currentLabel.appendChild(tocInner);
            }
            tocInner.textContent = fallbackText || '-';
        }
    };

    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                if (currentLabel) {
                    if (headings.length) {
                        var found = '';
                        for (var i = headings.length - 1; i >= 0; i--) {
                            var el = document.getElementById(headings[i].id);
                            if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) {
                                found = headings[i].text;
                                break;
                            }
                        }
                        setTocText(found || headings[0].text || fallbackText || '-');
                    }
                }
                lastScrollY = window.scrollY;

                var docEl = document.documentElement;
                var body = document.body;
                var maxScroll = Math.max(docEl.scrollHeight, body ? body.scrollHeight : 0) - window.innerHeight;
                var scrollPercent = maxScroll > 0 ? Math.floor((window.scrollY / maxScroll) * 100) : 100;
                if (window.innerHeight + window.scrollY >= maxScroll - 1) {
                    scrollPercent = 100;
                }
                scrollPercent = Math.min(100, Math.max(0, Math.floor(scrollPercent / 10) * 10));
                if (scrollPercent !== lastProgress) {
                    lastProgress = scrollPercent;
                    setProgressText(scrollPercent + '%');
                    setDesktopProgress(scrollPercent + '%');
                }

                ticking = false;
            });
            ticking = true;
        }
    });
})();

(function() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var container = document.getElementById('article-content');
    if (!container) return;

    var loading = document.getElementById('article-loading');
    var error = document.getElementById('article-error');

    if (!id) {
        // 无 id 参数：留在本页，文章列表由 list.js 负责渲染，不再跳回主站
        return;
    }

    var xhr = new XMLHttpRequest();
    var cdnArticleUrl = 'https://cdn.rrrosmontis.icu/articles/' + id + '/content.html';
    xhr.open('GET', cdnArticleUrl);
    xhr.onload = function() {
        if (xhr.status === 200) {
            container.innerHTML = xhr.responseText;
            if (window.hljs) {
                var codeBlocks = container.querySelectorAll('pre code');
                for (var ci = 0; ci < codeBlocks.length; ci++) {
                    hljs.highlightElement(codeBlocks[ci]);
                }
            }
            if (window.renderMathInElement) {
                renderMathInElement(container, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            }
            var toc = container.querySelector('.article-toc');
            if (toc && !toc.parentNode.classList.contains('article-sidebar')) {
                var sidebar = document.createElement('div');
                sidebar.className = 'article-sidebar';
                var progressCard = document.createElement('div');
                progressCard.className = 'toc-progress-card';
                progressCard.innerHTML = '<div class="toc-progress-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="toc-progress-ring-track" cx="18" cy="18" r="15.5" fill="none" stroke="#e5e5e5" stroke-width="3"></circle><circle class="toc-progress-ring-bar" cx="18" cy="18" r="15.5" fill="none" stroke="#888888" stroke-width="3" stroke-linecap="round" stroke-dasharray="97.4" stroke-dashoffset="97.4"></circle></svg></div><span class="toc-progress-label">阅读进度 · <span class="toc-progress-percent">0%</span></span>';
                toc.parentNode.insertBefore(sidebar, toc);
                sidebar.appendChild(progressCard);
                sidebar.appendChild(toc);
                progressCard.classList.add('anim-enter');
            }
            var contentBox = container.querySelector('.additional-box');
            if (toc) toc.classList.add('anim-enter');
            if (contentBox) contentBox.classList.add('anim-enter');
            var h1 = container.querySelector('h1');
            var h1text = '';
            if (h1) {
                h1text = h1.textContent;
                document.title = h1text + ' - Royirin Rosmontis Presents';
            }
            var anchors = container.querySelectorAll('.article-toc a[href^="#"]');
            for (var i = 0; i < anchors.length; i++) {
                anchors[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    var target = container.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            }
            var h2s = container.querySelectorAll('.additional-box h2[id]');
            var h2Data = [];
            for (var j = 0; j < h2s.length; j++) {
                h2Data.push({ id: h2s[j].id, text: h2s[j].textContent });
            }
            if (typeof updateMobileTOC === 'function') {
                updateMobileTOC(h2Data, h1text);
            }
        } else {
            window.location.replace('/articles/' + id + '/content.html?ref=' + encodeURIComponent(window.location.href));
        }
    };
    xhr.onerror = function() {
        window.location.replace('/articles/' + id + '/content.html?ref=' + encodeURIComponent(window.location.href));
    };
    xhr.send();
})();
