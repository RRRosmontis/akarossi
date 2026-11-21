/* Delegated events support body.html being injected asynchronously. */
(function(){
  'use strict';
  var fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  var active = null;
  var popup = document.createElement('div');
  popup.id = 'about-game-preview';
  popup.className = 'about-game-preview';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', '游戏图片预览');
  popup.setAttribute('aria-hidden', 'true');
  var header = document.createElement('div');
  header.className = 'about-game-preview-header';
  var title = document.createElement('p');
  title.className = 'about-game-preview-title';
  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'about-game-preview-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭预览');
  var image = document.createElement('img');
  var status = document.createElement('p');
  status.className = 'about-game-preview-status';
  status.hidden = true;
  header.appendChild(title);header.appendChild(close);
  popup.appendChild(header);popup.appendChild(image);popup.appendChild(status);
  document.body.appendChild(popup);

  function triggerOf(target){
    return target && target.closest ? target.closest('#About .about-game-trigger') : null;
  }
  function hide(){
    if(active) active.setAttribute('aria-expanded', 'false');
    active = null;
    popup.classList.remove('is-visible');
    popup.setAttribute('aria-hidden', 'true');
  }
  function position(){
    if(!active) return;
    var rect = active.getBoundingClientRect();
    var width = popup.getBoundingClientRect().width;
    var height = popup.getBoundingClientRect().height;
    var left = fineHover.matches ? rect.left + rect.width/2 - width/2 : (innerWidth - width)/2;
    left = Math.max(16, Math.min(left, innerWidth - width - 16));
    var top = rect.bottom + 12;
    if(top + height > innerHeight - 16 && rect.top - height - 12 >= 16) top = rect.top - height - 12;
    top = Math.max(16, Math.min(top, innerHeight - height - 16));
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }
  function show(trigger){
    if(active === trigger){ position();return; }
    if(active) active.setAttribute('aria-expanded', 'false');
    active = trigger;
    active.setAttribute('aria-expanded', 'true');
    title.textContent = trigger.textContent.trim();
    var source = trigger.getAttribute('data-game-image');
    image.alt = title.textContent + ' 图片';
    image.hidden = !source;
    status.hidden = !!source;
    status.textContent = source ? '' : 'NO IMAGE';
    if(source) image.src = source;
    popup.setAttribute('aria-hidden', 'false');
    popup.classList.add('is-visible');
    requestAnimationFrame(position);
  }
  image.addEventListener('load', position);
  image.addEventListener('error', function(){
    image.hidden = true;status.hidden = false;status.textContent = 'NO IMAGE';position();
  });
  close.addEventListener('click', hide);
  popup.addEventListener('pointerleave', function(event){
    if(event.pointerType !== 'touch' && fineHover.matches && !triggerOf(event.relatedTarget)) hide();
  });
  document.addEventListener('pointerover', function(event){
    var trigger = triggerOf(event.target);
    if(trigger && event.pointerType !== 'touch' && fineHover.matches) show(trigger);
  });
  document.addEventListener('pointerout', function(event){
    var trigger = triggerOf(event.target);
    if(!trigger || event.pointerType === 'touch' || !fineHover.matches) return;
    if(trigger.contains(event.relatedTarget) || popup.contains(event.relatedTarget)) return;
    hide();
  });
  document.addEventListener('click', function(event){
    var trigger = triggerOf(event.target);
    if(trigger){
      // Touchscreens use tap-to-toggle instead of sticky emulated hover.
      if(!fineHover.matches || event.pointerType === 'touch'){ active === trigger ? hide() : show(trigger); }
    } else if(!popup.contains(event.target)) hide();
  });
  document.addEventListener('focusin', function(event){
    var trigger = triggerOf(event.target);
    if(trigger && fineHover.matches) show(trigger);
  });
  document.addEventListener('focusout', function(event){
    if(active && triggerOf(event.target) && !popup.contains(event.relatedTarget) && !triggerOf(event.relatedTarget)) hide();
  });
  document.addEventListener('keydown', function(event){ if(event.key === 'Escape') hide(); });
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, {passive:true});
})();
