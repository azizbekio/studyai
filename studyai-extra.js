/* ============================================================
   StudyAI — qo'shimcha modul (extra) v1.0
   Ichida: fan bo'yicha testlar + daraja (A+/A/B/C),
           tanga tizimi, umumiy reyting, klublar.

   QAYERGA: repo ILDIZIGA (index.html yonida), nomi: studyai-extra.js
   ULANISHI: index.html ichida, eng oxirida </body> dan OLDIN:
       <script src="/studyai-extra.js"></script>

   MUHIM: bu fayl index.html'dagi asosiy <script> dan KEYIN turishi shart.
   Asosiy fayldagi hech narsa o'zgartirilmaydi — bu modul ustidan qo'shiladi.
============================================================ */
(function () {

  /* ---------- 0. Kichik yordamchilar ---------- */
  function L(uz, en) { return (typeof lang !== 'undefined' && lang === 'en') ? en : uz; }
  function q(id) { return document.getElementById(id); }
  function e(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(x) { return Number(x) || 0; }
  function hasUser() { return !!(typeof userInfo !== 'undefined' && userInfo && userInfo.email); }

  /* ---------- 1. Tanga (coins) ---------- */
  var coins = LS.get('sai-coins', 0);

  function paintCoins() {
    var a = q('exCoinBox');
    if (a) a.innerHTML = '<span style="font-size:14px">&#129689;</span> <b>' + coins + '</b> <span style="color:var(--text3)">' + L('tanga', 'coins') + '</span>';
    var b = q('exStatCoins');
    if (b) b.textContent = coins;
  }

  /* addXP ustiga qo'shamiz: har XP bilan birga tanga ham beriladi */
  var _addXP = window.addXP;
  window.addXP = function (amount) {
    _addXP(amount);
    if (amount > 0) {
      coins += Math.max(1, Math.floor(amount / 5));
      LS.set('sai-coins', coins);
      paintCoins();
    }
    queueScore();
  };

  /* ---------- 2. Ballarni serverga yuborish ---------- */
  var scoreTimer = null, myRow = null, myClub = LS.get('sai-club', null);

  function queueScore() {
    if (!hasUser()) return;
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(pushScore, 4000);
  }

  function pushScore() {
    if (!hasUser()) return Promise.resolve();
    var st = { streak: 0 };
    try { st = calcStreak(); } catch (err) { }
    return fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || '',
        xp: n(xp),
        level: levelOf(xp),
        coins: coins,
        streak: n(st.streak),
        tasks_done: allTasks.filter(function (t) { return t.status === 'done'; }).length,
        quizzes: LS.get('sai-quizcount', 0)
      })
    }).catch(function () { });
  }

  /* ---------- 3. Fanlar ---------- */
  var SUBJECTS = [
    { id: 'math', ico: '&#128208;', uz: 'Matematika', en: 'Mathematics', t: "Matematika (maktab dasturi): algebra, geometriya, funksiyalar, progressiya, ehtimollik", te: "School mathematics: algebra, geometry, functions, sequences, probability" },
    { id: 'bio', ico: '&#129516;', uz: 'Biologiya', en: 'Biology', t: "Biologiya (maktab dasturi): hujayra, genetika, odam anatomiyasi, ekologiya, botanika", te: "School biology: cell, genetics, human anatomy, ecology, botany" },
    { id: 'chem', ico: '&#128300;', uz: 'Kimyo', en: 'Chemistry', t: "Kimyo (maktab dasturi): atom tuzilishi, davriy jadval, reaksiyalar, eritmalar, organik kimyo", te: "School chemistry: atomic structure, periodic table, reactions, solutions, organic chemistry" },
    { id: 'phys', ico: '&#9889;', uz: 'Fizika', en: 'Physics', t: "Fizika (maktab dasturi): mexanika, issiqlik, elektr, optika, atom fizikasi", te: "School physics: mechanics, thermodynamics, electricity, optics, atomic physics" },
    { id: 'eng', ico: '&#128172;', uz: 'Ingliz tili', en: 'English', t: "Ingliz tili: grammatika (tenses, articles, prepositions), lug'at, gap tuzilishi", te: "English language: grammar (tenses, articles, prepositions), vocabulary, sentence structure" },
    { id: 'ielts', ico: '&#127891;', uz: 'IELTS', en: 'IELTS', t: "IELTS: academic vocabulary, reading comprehension, grammar for writing, collocations", te: "IELTS: academic vocabulary, reading comprehension, grammar for writing, collocations" },
    { id: 'sat', ico: '&#128202;', uz: 'SAT', en: 'SAT', t: "SAT: math (problem solving, data analysis, algebra) and evidence-based reading & writing", te: "SAT: math (problem solving, data analysis, algebra) and evidence-based reading & writing" }
  ];
  var curSubject = null;
  var subjStats = LS.get('sai-subjects', {});
  var wrongList = [];

  function gradeOf(p) { return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : '—'; }
  function gradeColor(p) { return p >= 80 ? 'var(--done)' : p >= 60 ? 'var(--half)' : 'var(--undone)'; }
  function subjById(id) { for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i]; return null; }

  window.exPickSubject = function (id, el) {
    var wrap = el.parentNode;
    wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
    el.classList.add('active');
    curSubject = id;
    var box = q('quizTopic');
    if (!box) return;
    if (!id) { box.value = ''; box.focus(); return; }
    var s = subjById(id);
    box.value = L(s.t, s.te);
  };

  function injectSubjects() {
    var setup = q('quizSetup');
    if (!setup) return;
    var title = setup.querySelector('.card-title');
    if (!title) return;
    var chips = SUBJECTS.map(function (s) {
      return '<button class="chip" onclick="exPickSubject(\'' + s.id + '\',this)">' + s.ico + ' ' + e(L(s.uz, s.en)) + '</button>';
    }).join('');
    title.insertAdjacentHTML('afterend',
      '<div style="margin-bottom:14px">' +
      '<div class="form-label" id="exSubjLabel"></div>' +
      '<div class="chips" id="exSubjChips">' + chips +
      '<button class="chip active" onclick="exPickSubject(null,this)" id="exSubjFree"></button>' +
      '</div></div>');
    q('exSubjLabel').textContent = L('Fan tanlang (ixtiyoriy)', 'Pick a subject (optional)');
    q('exSubjFree').textContent = L('O\u2019zim yozaman', 'My own topic');
  }

  function saveSubject(id, pct, right, total) {
    var r = subjStats[id] || { tries: 0, best: 0, last: 0, right: 0, total: 0 };
    r.tries++; r.last = pct; r.best = Math.max(r.best, pct);
    r.right += right; r.total += total; r.at = todayKey();
    subjStats[id] = r;
    LS.set('sai-subjects', subjStats);
  }

  function injectSubjectCard() {
    var wrap = q('learn-quiz');
    if (!wrap) return;
    wrap.insertAdjacentHTML('beforeend', '<div id="exSubjCard"></div>');
    renderSubjects();
  }

  function renderSubjects() {
    var box = q('exSubjCard');
    if (!box) return;
    var ids = Object.keys(subjStats);
    if (!ids.length) { box.innerHTML = ''; return; }
    var rows = SUBJECTS.filter(function (s) { return subjStats[s.id]; }).map(function (s) {
      var r = subjStats[s.id];
      var avg = r.total ? Math.round(r.right / r.total * 100) : 0;
      return '<tr><td>' + s.ico + ' ' + e(L(s.uz, s.en)) + '</td>' +
        '<td>' + r.tries + '</td>' +
        '<td>' + r.last + '%</td>' +
        '<td style="color:var(--gold);font-weight:700">' + r.best + '%</td>' +
        '<td style="color:' + gradeColor(avg) + ';font-weight:700;font-size:15px">' + gradeOf(avg) + '</td></tr>';
    }).join('');
    box.innerHTML = '<div class="card"><div class="card-title">' +
      L('Fan bo\u2019yicha darajangiz', 'Your level by subject') + '</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>' + L('Fan', 'Subject') + '</th><th>' + L('Test', 'Quizzes') + '</th>' +
      '<th>' + L('Oxirgi', 'Last') + '</th><th>' + L('Eng yaxshi', 'Best') + '</th>' +
      '<th>' + L('Daraja', 'Grade') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="hint">' + L(
        'Daraja o\u2019rtacha natijadan chiqariladi: 90%+ A+, 80%+ A, 70%+ B, 60%+ C. Bu taxminiy baho, rasmiy sertifikat emas.',
        'The grade comes from your average score: 90%+ A+, 80%+ A, 70%+ B, 60%+ C. This is an estimate, not an official certificate.'
      ) + '</div></div>';
  }

  /* Test tugaganda: daraja + xatolar tahlili */
  var _makeQuiz = window.makeQuiz;
  window.makeQuiz = function () {
    wrongList = [];
    return _makeQuiz.apply(null, arguments);
  };

  var _answer = window.answer;
  window.answer = function (i) {
    try {
      var cur = quiz[qi];
      if (cur && Number(cur.answer) !== Number(i)) {
        wrongList.push({ q: cur.q, right: cur.options[Number(cur.answer)], mine: cur.options[i] });
      }
    } catch (err) { }
    return _answer(i);
  };

  var _endQuiz = window.endQuiz;
  window.endQuiz = function (exit) {
    var total = (quiz && quiz.length) || 0, right = n(qScore);
    _endQuiz(exit);
    if (exit || !total) return;
    var pct = Math.round(right / total * 100);
    if (curSubject) { saveSubject(curSubject, pct, right, total); renderSubjects(); }
    var box = q('quizResult');
    if (!box) return;
    var sName = curSubject ? L(subjById(curSubject).uz, subjById(curSubject).en) : '';
    box.insertAdjacentHTML('beforeend',
      '<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:16px;text-align:center">' +
      (curSubject ?
        '<div style="font-size:12.5px;color:var(--text3)">' + e(sName) + ' &middot; ' + L('taxminiy daraja', 'estimated grade') + '</div>' +
        '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:38px;font-weight:700;color:' + gradeColor(pct) + '">' + gradeOf(pct) + '</div>'
        : '') +
      (wrongList.length ?
        '<button class="btn btn-ghost btn-sm" id="exAnalyzeBtn" onclick="exAnalyzeWrong(this)">&#129302; ' +
        L('Xatolarimni tahlil qil', 'Analyse my mistakes') + '</button>' : '') +
      '<div class="ai-content" id="exQuizAnalysis" style="text-align:left;margin-top:12px"></div></div>');
    queueScore();
  };

  window.exAnalyzeWrong = function (btn) {
    if (!wrongList.length) return;
    busy(btn, true);
    var lines = wrongList.slice(0, 12).map(function (w, i) {
      return (i + 1) + ') ' + w.q + ' | ' + L('to\u2019g\u2019ri javob', 'correct') + ': ' + w.right + ' | ' + L('men', 'mine') + ': ' + w.mine;
    }).join('\n');
    callAI("A student got these questions wrong:\n" + lines +
      "\n\nIn 120 words max: name the 2-3 weak sub-topics, and give 3 concrete practice steps. Use short headings." +
      (typeof lang !== 'undefined' && lang === 'en' ? " In English." : " O'zbek tilida yoz."),
      { max_tokens: 700 })
      .then(function (t) { q('exQuizAnalysis').innerHTML = md(t); })
      .catch(function (err) { q('exQuizAnalysis').innerHTML = '<p style="color:var(--undone)">' + e(err.message) + '</p>'; })
      .then(function () { busy(btn, false, '&#129302; ' + L('Xatolarimni tahlil qil', 'Analyse my mistakes')); });
  };

  /* ---------- 3.5 XATO TUZATISH: kartochka "necha kunda" ko'rsatkichi ----------
     Muammo: eski kod ba'zida bugun qaytishi kerak bo'lgan kartochkani
     "1 kunda" deb ko'rsatib qo'yardi ("Hozir navbatda" o'rniga).
     Sabab: sana solishtirish aniq emas edi. Bu yerda kalendar kunlarini
     to'g'ridan-to'g'ri (soat/vaqt zonasi ta'sirisiz) solishtiramiz. */
  function exDaysBetween(dueStr, todayStr) {
    var a = dueStr.split('-').map(Number), b = todayStr.split('-').map(Number);
    var da = Date.UTC(a[0], a[1] - 1, a[2]);
    var db = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((da - db) / 86400000);
  }
  window.cardStageLabel = function (c) {
    if (c.box >= STEP.length - 1) return L('O\u2019zlashtirilgan', 'Mastered');
    var left = exDaysBetween(c.due, todayKey());
    if (left <= 0) return L('Hozir navbatda', 'Due now');
    var stageTxt = L((c.box + 1) + '-bosqich', 'stage ' + (c.box + 1));
    return (lang === 'en' ? ('in ' + left + ' d') : (left + ' kunda')) + ' \u00b7 ' + stageTxt;
  };

  /* ---------- 4. Reyting sahifasi ---------- */
  function injectRankPage() {
    var main = document.querySelector('.main');
    if (!main) return;
    main.insertAdjacentHTML('beforeend',
      '<section class="page" id="page-rank">' +
      '<h1 class="page-header" id="exRankH"></h1>' +
      '<div class="page-sub" id="exRankSub"></div>' +
      '<div class="stats-row" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat-card"><div class="stat-num" id="exStatRank" style="color:var(--gold)">&mdash;</div><div class="stat-label" id="exLbRank"></div></div>' +
      '<div class="stat-card"><div class="stat-num" id="exStatXp">0</div><div class="stat-label" id="exLbXp"></div></div>' +
      '<div class="stat-card"><div class="stat-num" id="exStatCoins" style="color:var(--half)">0</div><div class="stat-label" id="exLbCoins"></div></div>' +
      '</div>' +
      '<div class="chips" style="margin-bottom:14px">' +
      '<button class="chip active" id="exTab1" onclick="exTab(\'solo\',this)"></button>' +
      '<button class="chip" id="exTab2" onclick="exTab(\'clubs\',this)"></button>' +
      '<button class="chip" id="exTab3" onclick="exTab(\'my\',this)"></button>' +
      '</div>' +
      '<div id="exSolo"></div>' +
      '<div id="exClubs" style="display:none"></div>' +
      '<div id="exMy" style="display:none"></div>' +
      '</section>');
  }

  function injectNav() {
    var hist = document.querySelector('.sidebar-nav .nav-item[data-page="history"]');
    if (hist) {
      hist.insertAdjacentHTML('afterend',
        '<div class="nav-item" data-page="rank" onclick="go(\'rank\')"><span class="nav-icon">&#127942;</span> <span id="exNavLabel"></span></div>');
    }
    var row = document.querySelector('#mobileNav .row');
    var set = row && row.querySelector('[data-page="settings"]');
    if (row && set) {
      set.insertAdjacentHTML('beforebegin',
        '<button class="mnav" data-page="rank" onclick="go(\'rank\')"><span class="i">&#127942;</span><span id="exNavLabel2"></span></button>');
    }
    var sb = document.querySelector('.sidebar-bottom');
    if (sb) {
      sb.insertAdjacentHTML('afterbegin',
        '<div id="exCoinBox" style="font-size:12px;color:var(--text2);padding:7px 10px;margin-bottom:8px;' +
        'background:var(--surface2);border:1px solid var(--border);border-radius:10px;text-align:center"></div>');
    }
  }

  function paintLabels() {
    var set = function (id, txt) { var el = q(id); if (el) el.textContent = txt; };
    set('exNavLabel', L('Reyting', 'Leaderboard'));
    set('exNavLabel2', L('Reyting', 'Rank'));
    set('exRankH', L('Reyting', 'Leaderboard'));
    set('exRankSub', L('Boshqa talabalar bilan solishtiring va klub tuzing.', 'See how you compare and join a club.'));
    set('exLbRank', L('Mening o\u2019rnim', 'My position'));
    set('exLbXp', 'XP');
    set('exLbCoins', L('Tanga', 'Coins'));
    set('exTab1', L('Talabalar', 'Students'));
    set('exTab2', L('Klublar', 'Clubs'));
    set('exTab3', L('Mening klubim', 'My club'));
    var sl = q('exSubjLabel'); if (sl) sl.textContent = L('Fan tanlang (ixtiyoriy)', 'Pick a subject (optional)');
    var sf = q('exSubjFree'); if (sf) sf.textContent = L('O\u2019zim yozaman', 'My own topic');
    paintCoins();
    renderSubjects();
  }

  var curTab = 'solo';
  window.exTab = function (which, el) {
    curTab = which;
    if (el) {
      el.parentNode.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      el.classList.add('active');
    }
    q('exSolo').style.display = which === 'solo' ? 'block' : 'none';
    q('exClubs').style.display = which === 'clubs' ? 'block' : 'none';
    q('exMy').style.display = which === 'my' ? 'block' : 'none';
    if (which === 'clubs') loadClubs();
    if (which === 'my') loadMyClub();
  };

  function loading(id) {
    var el = q(id);
    if (el) el.innerHTML = '<div class="empty"><span class="typing"><i></i><i></i><i></i></span></div>';
  }

  function guestBox() {
    return '<div class="empty"><div class="ico">&#128274;</div><div>' +
      L('Reytingda qatnashish uchun Google bilan kiring.', 'Sign in with Google to join the leaderboard.') +
      '</div></div>';
  }

  function loadRank() {
    paintCoins();
    var xpEl = q('exStatXp'); if (xpEl) xpEl.textContent = n(xp);
    if (!hasUser()) { q('exSolo').innerHTML = guestBox(); return; }
    loading('exSolo');
    pushScore().then(function () {
      return fetch('/api/scores?top=100&email=' + encodeURIComponent(userInfo.email));
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      myRow = d.me || null;
      if (myRow && myRow.club) { myClub = myRow.club; LS.set('sai-club', myClub); }
      q('exStatRank').textContent = d.rank ? '#' + d.rank : '—';
      renderSolo(d.list || []);
    }).catch(function (err) {
      q('exSolo').innerHTML = '<div class="empty"><div class="ico">&#9888;</div><div>' + e(err.message) + '</div></div>';
    });
  }

  function medal(i) { return i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1); }

  function renderSolo(list) {
    if (!list.length) {
      q('exSolo').innerHTML = '<div class="empty"><div class="ico">&#127942;</div><div>' +
        L('Hali hech kim ball to\u2019plamagan. Birinchi bo\u2019ling!', 'Nobody has scored yet. Be the first.') + '</div></div>';
      return;
    }
    var rows = list.map(function (u, i) {
      var mine = u.me ? 'background:var(--gold-dim)' : '';
      var av = u.picture
        ? '<img src="' + e(u.picture) + '" alt="" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:7px">'
        : '<span style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--surface3);font-size:11px;vertical-align:middle;margin-right:7px">' +
        e((u.name || '?').charAt(0).toUpperCase()) + '</span>';
      return '<tr style="' + mine + '"><td style="font-weight:700">' + medal(i) + '</td>' +
        '<td>' + av + e(u.name || L('Nomsiz', 'Unnamed')) + (u.me ? ' <span style="color:var(--gold);font-size:11px">&#9679; ' + L('siz', 'you') + '</span>' : '') + '</td>' +
        '<td style="color:var(--gold);font-weight:700">' + n(u.xp) + '</td>' +
        '<td>' + n(u.level) + '</td>' +
        '<td>&#129689; ' + n(u.coins) + '</td>' +
        '<td>&#128293; ' + n(u.streak) + '</td>' +
        '<td>' + (u.club ? e(u.club) : '—') + '</td></tr>';
    }).join('');
    q('exSolo').innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th>#</th><th>' + L('Talaba', 'Student') + '</th><th>XP</th><th>' + L('Daraja', 'Level') + '</th>' +
      '<th>' + L('Tanga', 'Coins') + '</th><th>Streak</th><th>' + L('Klub', 'Club') + '</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="hint">' + L('Ro\u2019yxat har ochilganda yangilanadi.', 'The list refreshes each time you open it.') + '</div></div>';
  }

  /* ---------- 5. Klublar ---------- */
  function loadClubs() {
    loading('exClubs');
    fetch('/api/clubs?view=top').then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      var list = d.clubs || [];
      if (!list.length) {
        q('exClubs').innerHTML = '<div class="empty"><div class="ico">&#127963;</div><div>' +
          L('Hali klub yo\u2019q. Birinchisini siz tuzing.', 'No clubs yet. Create the first one.') + '</div></div>';
        return;
      }
      var rows = list.map(function (c, i) {
        var mine = (myClub && c.code === myClub) ? 'background:var(--gold-dim)' : '';
        return '<tr style="' + mine + '"><td style="font-weight:700">' + medal(i) + '</td>' +
          '<td>' + e(c.name) + '<div style="font-size:11px;color:var(--text3)">' + e(c.code) + '</div></td>' +
          '<td>' + n(c.members) + '</td>' +
          '<td style="color:var(--gold);font-weight:700">' + n(c.xp) + '</td>' +
          '<td>' + n(c.avg) + '</td></tr>';
      }).join('');
      q('exClubs').innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        '<th>#</th><th>' + L('Klub', 'Club') + '</th><th>' + L('A\u2019zolar', 'Members') + '</th>' +
        '<th>' + L('Jami XP', 'Total XP') + '</th><th>' + L('O\u2019rtacha', 'Average') + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).catch(function (err) {
      q('exClubs').innerHTML = '<div class="empty"><div class="ico">&#9888;</div><div>' + e(err.message) + '</div></div>';
    });
  }

  function loadMyClub() {
    if (!hasUser()) { q('exMy').innerHTML = guestBox(); return; }
    loading('exMy');
    fetch('/api/clubs?view=my&email=' + encodeURIComponent(userInfo.email))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message);
        if (!d.club) { myClub = null; LS.set('sai-club', null); renderNoClub(); return; }
        myClub = d.club.code; LS.set('sai-club', myClub);
        var rows = (d.members || []).map(function (m, i) {
          return '<tr><td style="font-weight:700">' + (i + 1) + '</td><td>' + e(m.name || L('Nomsiz', 'Unnamed')) +
            (m.me ? ' <span style="color:var(--gold);font-size:11px">&#9679; ' + L('siz', 'you') + '</span>' : '') + '</td>' +
            '<td style="color:var(--gold);font-weight:700">' + n(m.xp) + '</td>' +
            '<td>&#128293; ' + n(m.streak) + '</td></tr>';
        }).join('');
        q('exMy').innerHTML =
          '<div class="card"><div class="card-title">&#127963; ' + e(d.club.name) + '</div>' +
          '<div style="font-size:13px;color:var(--text2)">' + L('Klub kodi', 'Club code') +
          ': <b style="color:var(--gold);letter-spacing:1px">' + e(d.club.code) + '</b></div>' +
          '<div class="hint">' + L('Bu kodni do\u2019stlaringizga yuboring — ular klubga qo\u2019shiladi.',
            'Send this code to friends so they can join.') + '</div>' +
          '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px">' +
          '<button class="btn btn-ghost btn-sm" onclick="exCopyCode(\'' + e(d.club.code) + '\')">' + L('Kodni nusxalash', 'Copy code') + '</button>' +
          '<button class="btn btn-danger btn-sm" onclick="exLeaveClub()">' + L('Klubdan chiqish', 'Leave club') + '</button>' +
          '</div></div>' +
          '<div class="card"><div class="card-title">' + L('A\u2019zolar', 'Members') + ' (' + (d.members || []).length + ')</div>' +
          '<div class="table-wrap"><table><thead><tr><th>#</th><th>' + L('Ism', 'Name') + '</th><th>XP</th><th>Streak</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div></div>';
      }).catch(function (err) {
        q('exMy').innerHTML = '<div class="empty"><div class="ico">&#9888;</div><div>' + e(err.message) + '</div></div>';
      });
  }

  function renderNoClub() {
    q('exMy').innerHTML =
      '<div class="card"><div class="card-title">' + L('Klub tuzish', 'Create a club') + '</div>' +
      '<div class="form-group"><input id="exClubName" placeholder="' + L('Klub nomi: 11-A sinf', 'Club name: Group 11-A') + '"></div>' +
      '<button class="btn btn-gold" id="exCreateBtn" onclick="exCreateClub(this)">' + L('Tuzish', 'Create') + '</button>' +
      '<div class="hint">' + L('Klub tuzsangiz, sizga kod beriladi. Kodni do\u2019stlaringizga yuborasiz.',
        'You get a code when you create a club. Share it with your friends.') + '</div></div>' +
      '<div class="card"><div class="card-title">' + L('Klubga qo\u2019shilish', 'Join a club') + '</div>' +
      '<div class="form-group"><input id="exClubCode" placeholder="' + L('Klub kodi', 'Club code') + '" style="text-transform:uppercase"></div>' +
      '<button class="btn btn-ghost" id="exJoinBtn" onclick="exJoinClub(this)">' + L('Qo\u2019shilish', 'Join') + '</button></div>';
  }

  function clubPost(body, btn, done) {
    if (btn) busy(btn, true);
    fetch('/api/clubs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      done(d);
    }).catch(function (err) { toast(err.message, 'err'); })
      .then(function () { if (btn) busy(btn, false); });
  }

  window.exCreateClub = function (btn) {
    if (!hasUser()) { toast(L('Avval Google bilan kiring.', 'Sign in with Google first.'), 'err'); return; }
    var name = (q('exClubName').value || '').trim();
    if (!name) { toast(L('Klub nomini yozing', 'Enter a club name'), 'err'); return; }
    clubPost({ action: 'create', email: userInfo.email, name: userInfo.name || '', clubName: name }, btn, function (d) {
      toast(L('Klub tuzildi: ', 'Club created: ') + d.code, 'ok');
      myClub = d.code; LS.set('sai-club', myClub);
      loadMyClub();
    });
  };

  window.exJoinClub = function (btn) {
    if (!hasUser()) { toast(L('Avval Google bilan kiring.', 'Sign in with Google first.'), 'err'); return; }
    var code = (q('exClubCode').value || '').trim().toUpperCase();
    if (!code) { toast(L('Kodni yozing', 'Enter the code'), 'err'); return; }
    clubPost({ action: 'join', email: userInfo.email, name: userInfo.name || '', code: code }, btn, function (d) {
      toast(L('Klubga qo\u2019shildingiz', 'You joined the club'), 'ok');
      myClub = d.code; LS.set('sai-club', myClub);
      loadMyClub();
    });
  };

  window.exLeaveClub = function () {
    if (!confirm(L('Klubdan chiqasizmi?', 'Leave this club?'))) return;
    clubPost({ action: 'leave', email: userInfo.email }, null, function () {
      myClub = null; LS.set('sai-club', null);
      toast(L('Klubdan chiqdingiz', 'You left the club'));
      loadMyClub();
    });
  };

  window.exCopyCode = function (code) {
    navigator.clipboard.writeText(code).then(function () { toast(L('Nusxa olindi', 'Copied'), 'ok'); });
  };

  /* ---------- 6. Ulanish nuqtalari ---------- */
  var _go = window.go;
  window.go = function (page) {
    _go(page);
    if (page === 'rank') { loadRank(); exTab(curTab, null); if (curTab === 'clubs') loadClubs(); if (curTab === 'my') loadMyClub(); }
  };

  var _setLang = window.setLang;
  window.setLang = function (l) {
    _setLang(l);
    paintLabels();
    if (q('page-rank') && q('page-rank').classList.contains('active')) loadRank();
  };

  var _complete = window.completeRegistration;
  window.completeRegistration = function () {
    _complete();
    setTimeout(pushScore, 1500);
  };

  /* ---------- 7. Ishga tushirish ---------- */
  function start() {
    try {
      injectRankPage();
      injectNav();
      injectSubjects();
      injectSubjectCard();
      paintLabels();
      if (hasUser()) setTimeout(pushScore, 2500);
      if (location.hash.slice(1) === 'rank') go('rank');
      try { renderCards(); } catch (err) { } // kartochka yorlig'ini darrov yangilash
    } catch (err) {
      if (window.console) console.warn('StudyAI extra:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})();
