/* SY Pretty Lucky — site behavior
   - mobile nav toggle
   - hover-to-play media slots (autoplay on visible when files present)
   - reservation calendar (owner toggle, persisted to localStorage)
   - inquiry form (posts to the Worker /inquiry endpoint, mailto fallback on error)
*/
(function(){
  "use strict";

  // Cloudflare Worker URL, shared by the inquiry form (/inquiry) and the chat assistant.
  // Declared at the top so both handlers can see it. The OpenRouter key lives ONLY in the Worker as a secret.
  var CHAT_WORKER_URL = "https://prettyluckychat.ericbelcastle.workers.dev";

  /* ---- mobile nav ---- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links){
    toggle.addEventListener('click', function(){ links.classList.toggle('open'); });
    links.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ links.classList.remove('open'); });
    });
  }

  /* ---- gallery images: reveal once loaded (adds .is-loaded) ---- */
  document.querySelectorAll('.media-slot__img, .pl-gallery__img').forEach(function(img){
    if (img.complete && img.naturalWidth > 0){ img.classList.add('is-loaded'); }
    else {
      img.addEventListener('load', function(){ img.classList.add('is-loaded'); });
      img.addEventListener('error', function(){ img.classList.add('is-loaded'); });
    }
  });

  /* ---- media: play on hover/visible ---- */
  document.querySelectorAll('.media-slot__video').forEach(function(v){
    v.addEventListener('mouseenter', function(){ v.play().catch(function(){}); });
    v.addEventListener('mouseleave', function(){ v.pause(); });
    if ('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(es){
        es.forEach(function(e){ if(e.isIntersecting && e.target.currentSrc){ e.target.play().catch(function(){}); } });
      }, {threshold:.4});
      io.observe(v);
    }
  });

  /* ---- reservation calendar ---- */
  var grid = document.getElementById('calGrid');
  var title = document.getElementById('calTitle');
  var prev = document.getElementById('calPrev');
  var next = document.getElementById('calNext');
  var KEY = 'prettylucky_bookings';
  var bookings = {};
  try { bookings = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ bookings = {}; }
  var now = new Date();
  var view = new Date(now.getFullYear(), now.getMonth(), 1);

  function ymd(d){ return d.toISOString().slice(0,10); }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(bookings)); } catch(e){} }

  function render(){
    if(!grid) return;
    grid.innerHTML = '';
    var dows = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    dows.forEach(function(d){ var e=document.createElement('div'); e.className='cal__dow'; e.textContent=d; grid.appendChild(e); });
    title.textContent = view.toLocaleString('en-US',{month:'long',year:'numeric'});
    var first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    var days = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
    for(var i=0;i<first;i++){ var blank=document.createElement('div'); blank.className='cal__cell empty'; grid.appendChild(blank); }
    for(var d=1; d<=days; d++){
      var cell = document.createElement('div');
      var date = new Date(view.getFullYear(), view.getMonth(), d);
      var key = ymd(date);
      cell.textContent = d;
      var isPast = date < new Date(now.getFullYear(),now.getMonth(),now.getDate());
      if(isPast){ cell.className='cal__cell past'; }
      else {
        cell.className = 'cal__cell ' + (bookings[key] ? 'booked' : 'free');
        cell.title = bookings[key] ? 'Booked (click to toggle)' : 'Available (click to toggle)';
        cell.addEventListener('click', (function(k){ return function(){
          bookings[k] = !bookings[k]; save(); render();
        }; })(key));
      }
      grid.appendChild(cell);
    }
  }
  if(prev) prev.addEventListener('click', function(){ view.setMonth(view.getMonth()-1); render(); });
  if(next) next.addEventListener('click', function(){ view.setMonth(view.getMonth()+1); render(); });
  render();

  /* ---- inquiry form ---- */
  var form = document.getElementById('inquiryForm');
  var status = document.getElementById('formStatus');
  if(form){
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var data = new FormData(form);
      var name = (data.get('name')||'').toString().trim();
      var email = (data.get('email')||'').toString().trim();
      var start = (data.get('start')||'').toString().trim();
      var guests = (data.get('guests')||'').toString().trim();
      var msg = (data.get('message')||'').toString().trim();
      if(!name){
        status.textContent = 'Please add your name so we know who to say hi to.';
        return;
      }
      // Inquiry: send to Worker -> Telegram (captures even without visitor email).
      // Email is OPTIONAL. Falls back to mailto if the Worker call fails.
      status.textContent = 'Sending your inquiry…';
      fetch(CHAT_WORKER_URL + '/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, start: start, guests: guests, message: msg })
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d && d.ok){
          status.textContent = '✅ Inquiry sent! We reply within 24 hours.';
          form.reset();
        } else {
          fallbackMailto();
        }
      }).catch(function(){ fallbackMailto(); });

      function fallbackMailto(){
        var subject = encodeURIComponent('SY Pretty Lucky charter inquiry — ' + (start || 'open dates'));
        var body = encodeURIComponent('Name: '+name+'\n'+(email ? 'Email: '+email+'\n' : '')+'Start: '+start+'\nGuests: '+guests+'\n\n'+msg);
        window.location.href = 'mailto:sailprettylucky@gmail.com?subject='+subject+'&body='+body;
        status.textContent = 'Couldn’t reach our server — opened your email app instead. If nothing opened, email sailprettylucky@gmail.com.' + (email ? '' : ' (No email entered — your mail app will use your own address.)');
        form.reset();
      }
      return;
    });
  }
  /* ---- chat assistant client ---- */
  (function(){
    var toggle = document.getElementById('plChatToggle');
    var panel = document.getElementById('plChatPanel');
    var close = document.getElementById('plChatClose');
    var log = document.getElementById('plChatLog');
    var form = document.getElementById('plChatForm');
    var input = document.getElementById('plChatInput');
    var SESSION_ID = "pl-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
    var history = [];

    function bubble(text, who){
      var m = document.createElement('div');
      m.className = 'chat__msg chat__msg--' + who;
      m.textContent = text;
      log.appendChild(m);
      log.scrollTop = log.scrollHeight;
      return m;
    }
    function openPanel(){
      panel.hidden = false;
      if(!log.dataset.greeted){
        bubble("Ahoy! 🌊 I'm the Pretty Lucky assistant. Thinking about a crewed charter in the Virgin Islands — or just want to chat? Tell me a little about your trip and I'll pass it to Wendy.", 'bot');
        log.dataset.greeted = "1";
      }
      input.focus();
    }
    var hadUser = false;
    if(toggle) toggle.addEventListener('click', openPanel);
    if(close) close.addEventListener('click', function(){ panel.hidden = true; });

    if(form){
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var text = (input.value || '').trim();
        if(!text) return;
        hadUser = true;
        bubble(text, 'user');
        history.push({ role:'user', content:text });
        input.value = '';
        var typing = bubble('Wendy’s assistant is typing…', 'typing');

        if(!CHAT_WORKER_URL || CHAT_WORKER_URL.indexOf('YOUR-SUBDOMAIN') !== -1){
          log.removeChild(typing);
          bubble("Chat isn't quite set up yet — please email sailprettylucky@gmail.com and Wendy will help right away.", 'bot');
          return;
        }

        fetch(CHAT_WORKER_URL, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ messages: history.slice(-12) })
        }).then(function(r){ return r.json(); }).then(function(d){
          log.removeChild(typing);
          var reply = d.reply || "Wendy will be right with you — please email sailprettylucky@gmail.com and she'll help right away.";
          bubble(reply, 'bot');
          history.push({ role:'assistant', content: reply });
        }).catch(function(){
          log.removeChild(typing);
          bubble("Our chat is taking a breather — please email sailprettylucky@gmail.com and she'll help right away.", 'bot');
        });
      });
    }
  })();

  /* ---- tabbed gallery + lightbox ---- */
  (function(){
    var root = document.querySelector('[data-pl-gallery]');
    var lightbox = document.getElementById('plLightbox');
    if(!root || !lightbox) return;

    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panel = document.getElementById('gal-panel');
    var items = Array.prototype.slice.call(root.querySelectorAll('.pl-gallery__item'));
    var placeholders = Array.prototype.slice.call(root.querySelectorAll('.pl-gallery__placeholder'));
    var imgEl = document.getElementById('plLightboxImg');
    var capEl = document.getElementById('plLightboxCaption');
    var countEl = document.getElementById('plLightboxCount');
    var lastFocus = null;
    var index = 0;
    var touchX = 0;
    var filter = 'all';

    function visibleButtons(){
      return items
        .filter(function(item){ return !item.classList.contains('is-hidden'); })
        .map(function(item){ return item.querySelector('.pl-gallery__btn'); })
        .filter(Boolean);
    }

    function applyFilter(next){
      filter = next;
      items.forEach(function(item){
        var show = (next === 'all' || item.getAttribute('data-category') === next);
        item.classList.toggle('is-hidden', !show);
      });
      placeholders.forEach(function(ph){
        var show = (next !== 'all' && ph.getAttribute('data-category') === next);
        ph.classList.toggle('is-hidden', !show);
        ph.hidden = !show;
      });
    }

    function selectTab(tab, opts){
      opts = opts || {};
      tabs.forEach(function(t){
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      if(panel) panel.setAttribute('aria-labelledby', tab.id);
      applyFilter(tab.getAttribute('data-filter') || 'all');
      if(opts.focus) tab.focus();
    }

    tabs.forEach(function(tab, i){
      tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1;
      tab.addEventListener('click', function(){ selectTab(tab); });
      tab.addEventListener('keydown', function(e){
        var next = -1;
        if(e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if(e.key === 'Home') next = 0;
        else if(e.key === 'End') next = tabs.length - 1;
        if(next !== -1){
          e.preventDefault();
          selectTab(tabs[next], {focus:true});
        }
      });
    });

    applyFilter('all');

    function setSlide(i, buttons){
      buttons = buttons || visibleButtons();
      if(!buttons.length) return;
      index = (i + buttons.length) % buttons.length;
      var btn = buttons[index];
      var src = btn.getAttribute('data-src');
      var caption = btn.getAttribute('data-caption') || '';
      var thumb = btn.querySelector('img');
      imgEl.src = src;
      imgEl.alt = (thumb && thumb.alt) || caption;
      capEl.textContent = caption;
      countEl.textContent = (index + 1) + ' / ' + buttons.length;
    }

    function openAt(btn){
      var buttons = visibleButtons();
      var i = buttons.indexOf(btn);
      if(i < 0) return;
      lastFocus = document.activeElement;
      setSlide(i, buttons);
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      var closeBtn = lightbox.querySelector('.pl-lightbox__close');
      if(closeBtn) closeBtn.focus();
    }

    function close(){
      if(lightbox.hidden) return;
      lightbox.hidden = true;
      document.body.style.overflow = '';
      imgEl.removeAttribute('src');
      if(lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    function prev(){ setSlide(index - 1); }
    function next(){ setSlide(index + 1); }

    items.forEach(function(item){
      var btn = item.querySelector('.pl-gallery__btn');
      if(btn) btn.addEventListener('click', function(){ openAt(btn); });
    });

    lightbox.addEventListener('click', function(e){
      if(e.target.hasAttribute('data-lightbox-close')) close();
    });
    var prevBtn = lightbox.querySelector('[data-lightbox-prev]');
    var nextBtn = lightbox.querySelector('[data-lightbox-next]');
    if(prevBtn) prevBtn.addEventListener('click', function(e){ e.stopPropagation(); prev(); });
    if(nextBtn) nextBtn.addEventListener('click', function(e){ e.stopPropagation(); next(); });

    document.addEventListener('keydown', function(e){
      if(lightbox.hidden) return;
      if(e.key === 'Escape'){ e.preventDefault(); close(); }
      else if(e.key === 'ArrowLeft'){ e.preventDefault(); prev(); }
      else if(e.key === 'ArrowRight'){ e.preventDefault(); next(); }
      else if(e.key === 'Tab'){
        var focusable = lightbox.querySelectorAll('button:not([hidden])');
        if(!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    });

    lightbox.addEventListener('touchstart', function(e){
      if(e.changedTouches && e.changedTouches[0]) touchX = e.changedTouches[0].clientX;
    }, {passive:true});
    lightbox.addEventListener('touchend', function(e){
      if(!e.changedTouches || !e.changedTouches[0] || lightbox.hidden) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if(Math.abs(dx) > 40){ if(dx < 0) next(); else prev(); }
    }, {passive:true});
  })();

})();
