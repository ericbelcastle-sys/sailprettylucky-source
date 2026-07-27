/* SY Pretty Lucky — site behavior
   - mobile nav toggle
   - hover-to-play media slots (autoplay on visible when files present)
   - reservation calendar (owner toggle, persisted to localStorage)
   - inquiry form (no backend — sends mailto or shows confirmation)
*/
(function(){
  "use strict";

  /* ---- mobile nav ---- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links){
    toggle.addEventListener('click', function(){ links.classList.toggle('open'); });
    links.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ links.classList.remove('open'); });
    });
  }

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
      var name = data.get('name')||'';
      var email = data.get('email')||'';
      var start = data.get('start')||'';
      var guests = data.get('guests')||'';
      var msg = data.get('message')||'';
      var subject = encodeURIComponent('SY Pretty Lucky charter inquiry — ' + start);
      var body = encodeURIComponent('Name: '+name+'\nEmail: '+email+'\nStart: '+start+'\nGuests: '+guests+'\n\n'+msg);
      // Open mail client (owner receives). Falls back to on-page confirmation.
      window.location.href = 'mailto:charter@sailprettylucky.com?subject='+subject+'&body='+body;
      status.textContent = 'Opening your email app to send the inquiry… if nothing opened, email charter@sailprettylucky.com.';
      form.reset();
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
    // DEPLOY STEP: paste your Cloudflare Worker URL here (holds the HY3 key server-side).
    var WORKER_URL = "https://prettylucky-chat.YOUR-SUBDOMAIN.workers.dev";
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
        bubble("Ahoy! 🌊 I'm the Pretty Lucky assistant. Thinking about a crewed charter in the Virgin Islands? Tell me your dates, group size, or the occasion and I'll help you start planning — Wendy follows up personally.", 'bot');
        log.dataset.greeted = "1";
      }
      input.focus();
    }
    if(toggle) toggle.addEventListener('click', openPanel);
    if(close) close.addEventListener('click', function(){ panel.hidden = true; });

    if(form){
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var text = (input.value || '').trim();
        if(!text) return;
        bubble(text, 'user');
        history.push({ role:'user', content:text });
        input.value = '';
        var typing = bubble('Wendy’s assistant is typing…', 'typing');
        fetch(WORKER_URL, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ messages: history })
        }).then(function(r){ return r.json(); }).then(function(d){
          log.removeChild(typing);
          var reply = d.reply || "Wendy will be right with you — email wendyjbelanger@gmail.com or call 701-595-2920.";
          bubble(reply, 'bot');
          history.push({ role:'assistant', content: reply });
        }).catch(function(){
          log.removeChild(typing);
          bubble("Our chat is taking a breather — please email wendyjbelanger@gmail.com or call Wendy at 701-595-2920 and she'll help right away.", 'bot');
        });
      });
    }
  })();
})();
