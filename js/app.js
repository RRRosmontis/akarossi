
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        const hasHash = window.location.hash && window.location.hash !== '#';
        if (hasHash) {
            document.body.classList.add('is-played');
            sessionStorage.setItem("introPlayed", "true");
        } else if (!sessionStorage.getItem("introPlayed")) {
            document.body.classList.add('is-loading');
            window.scrollTo(0, 0);
        } else {
            document.body.classList.add('is-played');
        }

        // Notify index.html that the intro state is initialized before it reveals the body.
        window.__akarosIntroStateReady = true;
        if (typeof window.__akarosRevealBody === 'function') window.__akarosRevealBody();
    

        // Logo 点击行为：直接走 <a href="/"> 跳转主页，不再触发下拉菜单（hover 旋转由 CSS 保留）

        document.addEventListener('click', function(e) {
            const dropdown = e.target.closest('.program-dropdown');
            if (!dropdown) return;
            document.querySelectorAll('.program-dropdown.open').forEach(function(d) {
                if (d !== dropdown) {
                    d.classList.remove('open');
                    const box = d.closest('.article-title-box');
                    if (box) box.style.zIndex = '';
                }
            });
            dropdown.classList.toggle('open');
            const box = dropdown.closest('.article-title-box');
            if (dropdown.classList.contains('open')) {
                if (box) { box.style.position = 'relative'; box.style.zIndex = '10'; }
            } else {
                if (box) box.style.zIndex = '';
            }
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.program-dropdown')) {
                document.querySelectorAll('.program-dropdown.open').forEach(function(d) {
                    d.classList.remove('open');
                    const box = d.closest('.article-title-box');
                    if (box) box.style.zIndex = '';
                });
            }
        });

        document.addEventListener('DOMContentLoaded', function() {
            const quoteEls = Array.from(document.querySelectorAll('.footer-quote'));
            const footerSep = document.querySelector('.footer-sep');
            if (!quoteEls.length) return;
            if (footerSep) footerSep.style.opacity = 0;

            let isTyping = false;
            let lines = [];
            let lastIndex = -1;

            fetch('https://cdn.rrrosmontis.icu/dict.txt')
                .then(response => response.text())
                .then(data => {
                    lines = data.split('\n').filter(line => line.trim() !== '');
                    startPresentation();
                })
                .catch(error => console.error('文件加载失败:', error));

            function render(html) {
                quoteEls.forEach(el => {
                    el.innerHTML = html;
                    el.getBoundingClientRect();
                });
            }

            function getRandomLine() {
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * lines.length);
                } while (newIndex === lastIndex && lines.length > 1);
                lastIndex = newIndex;
                return newIndex;
            }

            function startPresentation() {
                if (isTyping || !lines.length) return;

                quoteEls.forEach(el => {
                    el.style.opacity = 0;
                    el.getBoundingClientRect();
                });

                setTimeout(() => {
                    const randomIndex = getRandomLine();
                    const currentLine = lines[randomIndex];

                    render('');
                    quoteEls.forEach(el => {
                        el.style.opacity = 1;
                        el.getBoundingClientRect();
                    });
                    if (footerSep) footerSep.style.opacity = 1;
                    isTyping = true;

                    let charIndex = 0;
                    function typeCharacter() {
                        if (charIndex < currentLine.length) {
                            render(currentLine.substring(0, charIndex) +
                                '<span class="typing-cursor">|</span>');
                            charIndex++;
                            setTimeout(typeCharacter, 50);
                        } else {
                            render(currentLine);
                            setTimeout(() => {
                                if (footerSep) footerSep.style.opacity = 0;
                                deleteCharacter(currentLine, currentLine.length);
                            }, 3000);
                        }
                    }
                    typeCharacter();
                }, 500);
            }

            function deleteCharacter(line, remaining) {
                if (remaining > 0) {
                    render(line.substring(0, remaining - 1) + '<span class="typing-cursor">|</span>');
                    setTimeout(() => deleteCharacter(line, remaining - 1), 20);
                } else {
                    render('');
                    isTyping = false;
                    requestAnimationFrame(startPresentation);
                }
            }
});

    

        function initRainEffect() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.style.position = 'fixed';
            canvas.style.top = 0;
            canvas.style.left = 0;
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = 1;
            document.body.appendChild(canvas);
        
            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            resize();
            window.addEventListener('resize', resize);
        
            const raindrops = [];
            const isMobileViewport = document.documentElement.dataset.device === 'mobile' || window.matchMedia('(max-width: 767px)').matches;
            const maxDrops = isMobileViewport ? 45 : 100; // PC keeps the original density.
            const spawnChance = isMobileViewport ? 0.15 : 0.3;
        
            class Raindrop {
                constructor() {
                    this.reset();
                }
        
                reset() {
                    this.x = Math.random() * canvas.width;
                    this.y = -20;
                    this.speed = 5 + Math.random() * 5;
                    this.size = 2 + Math.random() * 2;
                    this.alpha = 0.6;
                }
        
                update() {
                    this.y += this.speed;
                    if (this.y > canvas.height) this.reset();
                }
        
                draw() {
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.x + this.size/2, this.y + this.size*2);
                    ctx.strokeStyle = `rgba(0, 162, 255, ${this.alpha})`;
                    ctx.lineWidth = this.size;
                    ctx.stroke();
                }
            }
        
            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if(raindrops.length < maxDrops && Math.random() < spawnChance) {
                    raindrops.push(new Raindrop());
                }
        
                raindrops.forEach((drop, index) => {
                    drop.update();
                    drop.draw();
                    if (drop.y > canvas.height) {
                        raindrops.splice(index, 1);
                    }
                });
        
                requestAnimationFrame(animate);
            }
        
            animate();
        }
        
        if (document.getElementById('body-content')) {
            if (document.body.classList.contains('is-played')) {
                initRainEffect();
            } else {
                const rainObserver = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            if (document.body.classList.contains('is-played')) {
                                rainObserver.disconnect();
                                initRainEffect();
                            }
                        }
                    });
                });
                rainObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            }
        }
      
        document.addEventListener('DOMContentLoaded', function() {
            function updateDialogPositions() {
                const dialogs = document.querySelectorAll('.dialog-box');
                dialogs.forEach(dialog => {
                    const footer = document.querySelector('.footer');
                    if (footer) {
                        dialog.style.bottom = `${footer.offsetHeight + 40}px`;
                    }
                });
            }
        
            const elements = {
                fixedImage: document.querySelector('.fixed-image'),
                fixedImageMobile: document.querySelector('.fixed-image-mobile'),
                dialogBox: document.querySelector('.main-dialog'),
                loadingDialog: document.querySelector('.loading-dialog'),
                resultDialog: document.querySelector('.result-dialog'),
                dialogInput: document.querySelector('.dialog-input'),
                dialogButton: document.querySelector('.dialog-button'), 
                confirmButton: document.querySelector('.confirm-button'),
                resultContent: document.querySelector('.result-content')
            };
        
            elements.fixedImage.addEventListener('click', function(e) {
                e.stopPropagation();
                elements.dialogBox.classList.toggle('active');
                elements.dialogInput.value = ''; 
                updateDialogPositions();
            });

            if (elements.fixedImageMobile) {
                elements.fixedImageMobile.addEventListener('click', function(e) {
                    e.stopPropagation();
                    window.location.href = '/AIChatMobile.html';
                });
            }

            elements.dialogBox.addEventListener('click', e => e.stopPropagation());
    
            document.addEventListener('click', function(e) {
                if (!elements.dialogBox.contains(e.target)) {
                    elements.dialogBox.classList.remove('active');
                }
            });
        
            function showError(message) {
                elements.loadingDialog.classList.remove('active');
                elements.resultContent.innerHTML = `
                    <div class="error-title">${message.split('\n')[0]}</div>
                    <div class="error-solution">${message.split('\n')[1] || ''}</div>
                `;
                elements.resultDialog.classList.add('active');
            }
        
            const chatHistory = {
            getValidHistory() {
                const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
                const now = Date.now();
                return history.filter(entry => now - entry.timestamp < 86400000);
            },

            addRecord(userInput, apiResponse) {
                const history = this.getValidHistory();
                history.push({
                    userInput,
                    apiResponse,
                    timestamp: Date.now()
                });
                localStorage.setItem('chatHistory', JSON.stringify(history));
            },

        };

            async function handleAPIRequest(inputText) {
            try {
                const getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString('zh-CN', { 
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
            }) + ` (${now.toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ')[2]})`;
        };

                const fullInput = `${inputText}\n[当前用户所在地区时间为 ${getLocalTime()}，非必要无需对时间信息进行特地回复。无需对提供的时间信息做出质疑，它是准确的。]`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                const response = await fetch('https://api.rrrosmontis.icu/v1/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: fullInput,
                        history: chatHistory.getValidHistory()
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                if (!response.ok) {
                    let errorText = `API Error: ${response.status}`;
                    try {
                        const errorData = await response.json();
                        if (errorData.error) errorText = errorData.error;
                    } catch (e) {}
                    throw new Error(errorText);
                }
                const data = await response.json();
                if (!data.success) throw new Error(data.error || '请求失败');
                const responseText = data.reply;

                chatHistory.addRecord(inputText, responseText);
                
                return responseText;
            } catch (error) {
                if (error.name === 'AbortError') throw new Error('请求超时\n请检查网络连接');
                throw error;
            }
        }

        window.addEventListener('beforeunload', () => {
            const validHistory = chatHistory.getValidHistory();
            localStorage.setItem('chatHistory', JSON.stringify(validHistory));
        });
                
            elements.dialogButton.addEventListener('click', async function() {
                const inputText = elements.dialogInput.value.trim();
                if (!inputText) return;
        
                elements.dialogBox.classList.remove('active');
                elements.loadingDialog.classList.add('active');
                updateDialogPositions();
        
                try {
                    const responseText = await handleAPIRequest(inputText);
                    elements.loadingDialog.classList.remove('active');
                    elements.resultContent.innerHTML = responseText.replace(/\n/g, '<br>');
                    elements.resultDialog.classList.add('active');
                    elements.dialogInput.value = ''; 
                } catch (error) {
                    showError(error.message.includes('\n') ? error.message : `${error.message}\n请稍后重试`);
                }
            });
        
            elements.confirmButton.addEventListener('click', () => {
                elements.resultDialog.classList.remove('active');
            });
        
            window.addEventListener('resize', updateDialogPositions);
            updateDialogPositions();
        });

        document.addEventListener('click', function(e) {
            const button = e.target.closest('.close-button');
            if (!button) return;
            const targetId = button.getAttribute('data-target');
            const contentBox = document.getElementById(targetId);
            if (!contentBox) return;
            if (contentBox.classList.contains('visible')) {
                contentBox.style.maxHeight = contentBox.scrollHeight + 'px';
                requestAnimationFrame(() => {
                    contentBox.style.maxHeight = '0px';
                    contentBox.style.opacity = '0';
                });
            } else {
                contentBox.classList.add('visible');
                contentBox.style.maxHeight = '0px';
                contentBox.style.opacity = '';
                requestAnimationFrame(() => {
                    contentBox.style.maxHeight = contentBox.scrollHeight + 'px';
                });
            }
            contentBox.ontransitionend = function(ev) {
                if (ev.propertyName !== 'max-height') return;
                contentBox.ontransitionend = null;
                if (contentBox.classList.contains('visible')) {
                    if (contentBox.style.maxHeight !== '0px') {
                        contentBox.style.maxHeight = 'none';
                    } else {
                        contentBox.classList.remove('visible');
                        contentBox.style.maxHeight = '';
                        contentBox.style.opacity = '';
                    }
                }
            };
            let rotation = parseInt(button.dataset.rot || '0', 10) + 45;
            button.dataset.rot = rotation;
            button.style.transform = `rotate(${rotation}deg)`;
        });
        
        document.addEventListener("DOMContentLoaded", function() {
            const layers = document.querySelectorAll('.intro-layer');
            if (layers.length === 0) return;
            const imageUrls = [];

            function applyResponsiveImages(isInitialLoad = false) {
                const device = document.documentElement.dataset.device;
                const isPortrait = device ? (device === 'mobile') : (window.innerHeight > window.innerWidth || window.innerWidth <= 768);

                layers.forEach(layer => {
                    // A repeat visit skips the intro: don't download its hidden images.
                    if (document.body.classList.contains('is-played') &&
                        (layer.style.display === 'none' || !layer.classList.contains('layer-3'))) return;
                    const targetUrl = isPortrait ? layer.getAttribute('data-bg-mobile') : layer.getAttribute('data-bg-pc');
                    if (targetUrl && targetUrl !== "") {
                        layer.style.backgroundImage = `url('${targetUrl}')`;
                        if (isInitialLoad) {
                            imageUrls.push(targetUrl);
                        }
                    }
                });
            }

            applyResponsiveImages(true);
            window.addEventListener('resize', function() {
                applyResponsiveImages(false);
            });

            if (document.body.classList.contains('is-loading')) {
                let loadedCount = 0;
                let hasStarted = false;
                
                const startTime = Date.now();
                const minLoadingTime = 0;
                function triggerAnimation() {
                    if (hasStarted) return;
                    hasStarted = true;

                    document.body.classList.remove('is-loading');
                    document.body.classList.add('is-animating');

                    setTimeout(() => {
                        document.body.classList.remove('is-animating');
                        document.body.classList.add('is-played');
                        sessionStorage.setItem("introPlayed", "true");
                        if ('scrollRestoration' in history) {
                            history.scrollRestoration = 'auto';
                        }
                    }, 2000);
                }
                function tryStart() {
                    const elapsed = Date.now() - startTime;
                    const remainingTime = Math.max(0, minLoadingTime - elapsed);
                    setTimeout(triggerAnimation, remainingTime);
                }

                if (imageUrls.length > 0) {
                    imageUrls.forEach(url => {
                        const img = new Image();
                        img.onload = img.onerror = () => {
                            loadedCount++;
                            if (loadedCount === imageUrls.length) {
                                tryStart();
                            }
                        };
                        img.src = url;
                    });
                } else {
                    tryStart();
                }
                setTimeout(triggerAnimation, 10000);

            } else {
                if (window.location.hash && window.location.hash !== '#') {
                    setTimeout(() => {
                        const target = document.querySelector(window.location.hash);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 800);
                }
            }
        });
    

        (function() {
            const PC_URLS = [
                'https://cdn.rrrosmontis.icu/background-2.png',
                'https://cdn.rrrosmontis.icu/background-1.jpg'
            ];
            const MOBILE_URLS = [
                'https://cdn.rrrosmontis.icu/background-mobile-2.png',
                'https://cdn.rrrosmontis.icu/background-mobile-1.jpg'
            ];

            let currentIndex = 0;
            let intervalId = null;
            let timeoutId = null;
            let layer3Hidden = false;
            let isTransitioning = false;

            const bgLayer0 = document.getElementById('bg-layer-0');
            const bgLayer1 = document.getElementById('bg-layer-1');
            if (!bgLayer0 || !bgLayer1) return;

            function isMobile() {
                const device = document.documentElement.dataset.device;
                if (device === 'mobile') return true;
                if (device === 'pad' || device === 'pc') return false;
                // 无 data-device 的旧设备页按文件名回退，保持原有行为
                const path = (window.location.pathname || '').toLowerCase();
                if (/mobile\.html$/.test(path)) return true;
                if (/pad\.html$/.test(path) || /pc\.html$/.test(path)) return false;
                return window.matchMedia('(max-width: 1200px)').matches || 'ontouchstart' in window;
            }

            function getCurrentUrls() {
                return isMobile() ? MOBILE_URLS : PC_URLS;
            }

            function setBackgroundImage(element, url) {
                element.style.backgroundImage = `url('${url}')`;
                element.style.backgroundSize = 'cover';
                element.style.backgroundPosition = 'center';
                element.style.backgroundRepeat = 'no-repeat';
            }

            const backgroundLoads = new Map();
            function loadBackground(url) {
                if (backgroundLoads.has(url)) return backgroundLoads.get(url);
                const pending = new Promise(resolve => {
                    const img = new Image();
                    img.fetchPriority = 'low';
                    const timeout = setTimeout(() => {
                        img.onload = img.onerror = null;
                        img.removeAttribute('src');
                        resolve(false);
                    }, 20000);
                    const finish = loaded => {
                        clearTimeout(timeout);
                        resolve(loaded);
                    };
                    img.onload = () => finish(true);
                    img.onerror = () => finish(false);
                    img.src = url;
                });
                backgroundLoads.set(url, pending);
                pending.then(loaded => {
                    if (!loaded) backgroundLoads.delete(url); // Allow a later rotation to retry.
                });
                return pending;
            }

            let activeLayer = 0;
            async function crossfadeToNext() {
                if (isTransitioning) return;
                const urls = getCurrentUrls();
                if (urls.length === 0) return;
                const nextUrl = urls[currentIndex % urls.length];
                isTransitioning = true;
                // Never fade into an image that the deferred preloader hasn't finished yet.
                if (!await loadBackground(nextUrl)) {
                    isTransitioning = false;
                    return;
                }
                currentIndex++;

                const nextLayer = activeLayer === 0 ? bgLayer1 : bgLayer0;
                const currentLayer = activeLayer === 0 ? bgLayer0 : bgLayer1;
                if (!currentLayer.style.backgroundImage) {
                    const introLayer = document.querySelector('#intro-animation .layer-3');
                    const introUrl = introLayer && introLayer.getAttribute(isMobile() ? 'data-bg-mobile' : 'data-bg-pc');
                    setBackgroundImage(currentLayer, introUrl || nextUrl);
                }

                setBackgroundImage(nextLayer, nextUrl);
                nextLayer.style.opacity = '0';
                nextLayer.style.display = 'block';
                currentLayer.style.opacity = '1';
                
                nextLayer.style.transition = 'opacity 1s ease-in-out';
                currentLayer.style.transition = 'opacity 1s ease-in-out';
                
                requestAnimationFrame(() => {
                    nextLayer.style.opacity = '1';
                    currentLayer.style.opacity = '0';
                    hideLayer3();
                });

                setTimeout(() => {
                    currentLayer.style.opacity = '0';
                    activeLayer = activeLayer === 0 ? 1 : 0;
                    isTransitioning = false;
                }, 1000);
            }

            function startRotation() {
                if (layer3Hidden) {
                    if (intervalId) clearInterval(intervalId);
                    crossfadeToNext();
                    intervalId = setInterval(crossfadeToNext, 10000);
                } else {
                    if (timeoutId) clearTimeout(timeoutId);
                    if (intervalId) clearInterval(intervalId);
                    timeoutId = setTimeout(() => {
                        crossfadeToNext();
                        intervalId = setInterval(crossfadeToNext, 10000);
                    }, 15000);
                }
            }

            function hideLayer3() {
                if (layer3Hidden) return;
                const layer3 = document.querySelector('#intro-animation .layer-3');
                if (layer3) {
                    layer3.style.display = 'none';
                }
                layer3Hidden = true;
            }

            async function preloadCurrentBackgrounds() {
                const urls = getCurrentUrls();
                // Download only this device's backgrounds, one at a time and at low priority.
                for (const url of urls) {
                    const loaded = await loadBackground(url);
                    if (loaded && url === urls[0] && !bgLayer0.style.backgroundImage && !isTransitioning) {
                        setBackgroundImage(bgLayer0, url);
                        bgLayer0.style.opacity = '1';
                        bgLayer1.style.opacity = '0';
                    }
                }
            }

            function preloadAfterIntro() {
                function schedule() {
                    // Let the unchanged 0.8s entry animations and their delays finish first.
                    setTimeout(() => {
                        const warm = () => { void preloadCurrentBackgrounds(); };
                        if (window.requestIdleCallback) window.requestIdleCallback(warm, {timeout: 1500});
                        else warm();
                    }, 1200);
                }
                if (document.body.classList.contains('is-played')) {
                    schedule();
                } else {
                    const observer = new MutationObserver(() => {
                        if (document.body.classList.contains('is-played')) {
                            observer.disconnect();
                            schedule();
                        }
                    });
                    observer.observe(document.body, {attributes: true, attributeFilter: ['class']});
                }
            }

            if (document.body.classList.contains('is-played')) {
                hideLayer3();
                const initUrls = getCurrentUrls();
                if (initUrls.length) {
                    setBackgroundImage(bgLayer0, initUrls[0]);
                    bgLayer0.style.opacity = '1';
                    bgLayer1.style.opacity = '0';
                    currentIndex = 1;
                }
                startRotation();
            } else {
                // The intro's layer-3 already supplies the visible background until rotation.
                // Don't fetch the same-looking rotation images during the critical intro path.
                currentIndex = 1;
                preloadAfterIntro();
                startRotation();
            }

            window.addEventListener('resize', function() {
                if (!layer3Hidden) return; // A viewport resize must not bypass deferred loading.
                const urls = getCurrentUrls();
                if (urls.length) {
                    const currentActiveLayer = activeLayer === 0 ? bgLayer0 : bgLayer1;
                    const currentBgUrl = currentActiveLayer.style.backgroundImage;
                    if (!currentBgUrl || currentBgUrl === 'none') {
                        setBackgroundImage(bgLayer0, urls[0]);
                        bgLayer0.style.opacity = '1';
                        bgLayer1.style.opacity = '0';
                        activeLayer = 0;
                    }
                }
            });
        })();
    

        // #body-content is included directly in index.html; no asynchronous injection needed.
    
