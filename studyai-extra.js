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
      lastClubList = d.clubs || [];
      injectClubSearch();
      renderClubsList(lastClubList);
    }).catch(function (err) {
      q('exClubs').innerHTML = '<div class="empty"><div class="ico">&#9888;</div><div>' + e(err.message) + '</div></div>';
    });
  }

  function renderClubsList(list) {
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

  /* ============================================================
     8. USERNAME + QIDIRUV + SHAXSIY XABARLAR
     ============================================================ */
  var myUsername = LS.get('sai-username', '');
  var usernameOk = false;
  var msgPeer = null, msgTimer = null;

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ---- 8.1 Sozlamalarga username kartasi ---- */
  function injectUsernameCard() {
    var page = q('page-settings');
    if (!page) return;
    page.insertAdjacentHTML('afterbegin',
      '<div class="card" id="exUserCard">' +
      '<div class="card-title" id="exUserTitle"></div>' +
      '<div class="hint" id="exUserHint" style="margin-bottom:10px"></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><input id="exUsernameInput" maxlength="20" placeholder="masalan: azizbek_a"></div>' +
      '<div class="form-group"><button class="btn btn-gold" id="exUsernameSave" onclick="exSaveUsername()" style="width:100%"></button></div>' +
      '</div>' +
      '<div id="exUsernameStatus" style="font-size:12.5px;min-height:18px"></div>' +
      '</div>');
    var inp = q('exUsernameInput');
    inp.value = myUsername;
    inp.addEventListener('input', debounce(exCheckUsername, 450));
  }

  function exCheckUsername() {
    var inp = q('exUsernameInput'); if (!inp) return;
    var v = (inp.value || '').trim().toLowerCase();
    var box = q('exUsernameStatus');
    usernameOk = false;
    if (!v) { box.textContent = ''; return; }
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(v)) {
      box.innerHTML = '<span style="color:var(--undone)">' +
        L('3-20 belgi, harf bilan boshlanishi, faqat harf/raqam/_', '3-20 chars, must start with a letter, letters/digits/_ only') + '</span>';
      return;
    }
    if (v === myUsername) {
      box.innerHTML = '<span style="color:var(--done)">' + L('Bu — sizning joriy nomingiz', 'This is your current username') + '</span>';
      usernameOk = true; return;
    }
    box.textContent = '…';
    fetch('/api/username?check=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (d) {
      if (d.available) {
        box.innerHTML = '<span style="color:var(--done)">&#10003; ' + L('Bo\u2019sh, olsa bo\u2019ladi', 'Available') + '</span>';
        usernameOk = true;
      } else {
        box.innerHTML = '<span style="color:var(--undone)">&#10007; ' + L('Band, boshqa nom tanlang', 'Taken, choose another') + '</span>';
        usernameOk = false;
      }
    }).catch(function () { box.textContent = ''; });
  }

  window.exSaveUsername = function () {
    if (!hasUser()) { toast(L('Avval Google bilan kiring', 'Sign in with Google first'), 'err'); return; }
    var inp = q('exUsernameInput');
    var v = (inp.value || '').trim().toLowerCase();
    if (!v) { toast(L('Username kiriting', 'Enter a username'), 'err'); return; }
    if (v !== myUsername && !usernameOk) { toast(L('Avval mos va bo\u2019sh nom tanlang', 'Pick a valid, available username first'), 'err'); return; }
    var btn = q('exUsernameSave');
    busy(btn, true);
    fetch('/api/username', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userInfo.email, username: v })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      myUsername = v; LS.set('sai-username', v);
      toast(L('Saqlandi', 'Saved'), 'ok');
    }).catch(function (err) { toast(err.message, 'err'); })
      .then(function () { busy(btn, false, L('Saqlash', 'Save')); });
  };

  /* ---- 8.2 Xabarlar sahifasi ---- */
  function injectMessagesPage() {
    var main = document.querySelector('.main');
    if (!main) return;
    main.insertAdjacentHTML('beforeend',
      '<section class="page" id="page-messages">' +
      '<h1 class="page-header" id="exMsgH"></h1>' +
      '<div class="page-sub" id="exMsgSub"></div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="display:flex;min-height:58vh">' +
      '<div id="exConvList" style="width:100%;max-width:250px;border-right:1px solid var(--border);overflow-y:auto"></div>' +
      '<div id="exThreadWrap" style="flex:1;display:flex;flex-direction:column;min-width:0">' +
      '<div id="exThreadEmpty" class="empty" style="margin:auto"></div>' +
      '<div id="exThreadBody" style="display:none;flex-direction:column;flex:1;min-height:0">' +
      '<div id="exThreadHead" style="padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px"></div>' +
      '<div id="exThreadMsgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px"></div>' +
      '<div style="display:flex;gap:9px;padding:12px;border-top:1px solid var(--border)">' +
      '<input id="exMsgInput" maxlength="500" onkeydown="if(event.key===\'Enter\')exSendMsg()">' +
      '<button class="chat-send" onclick="exSendMsg()">&#10148;</button>' +
      '</div></div></div></div></div>' +
      '</section>');
  }

  function injectMessagesNav() {
    var hist = document.querySelector('.sidebar-nav .nav-item[data-page="history"]');
    if (hist) {
      hist.insertAdjacentHTML('afterend',
        '<div class="nav-item" data-page="messages" onclick="go(\'messages\')"><span class="nav-icon">&#128172;</span> <span id="exNavMsg"></span>' +
        '<span class="nav-badge" id="exMsgBadge" style="display:none">0</span></div>');
    }
    var row = document.querySelector('#mobileNav .row');
    var set = row && row.querySelector('[data-page="settings"]');
    if (row && set) {
      set.insertAdjacentHTML('beforebegin',
        '<button class="mnav" data-page="messages" onclick="go(\'messages\')"><span class="i">&#128172;</span><span id="exNavMsg2"></span></button>');
    }
  }

  function paintMsgLabels() {
    var set = function (id, t) { var el = q(id); if (el) el.textContent = t; };
    set('exMsgH', L('Xabarlar', 'Messages'));
    set('exMsgSub', L('Talabalar bilan bevosita yozishing.', 'Message other students directly.'));
    set('exNavMsg', L('Xabarlar', 'Messages'));
    set('exNavMsg2', L('Xabar', 'Chat'));
    var ph = q('exMsgInput'); if (ph) ph.placeholder = L('Xabar yozing…', 'Type a message…');
    var em = q('exThreadEmpty'); if (em) em.innerHTML = '<div class="ico">&#128172;</div><div>' +
      L('Suhbat tanlang yoki Reytingda username orqali qidiring.', 'Pick a conversation, or search by username on the Leaderboard page.') + '</div>';
  }

  function exUnreadPoll() {
    if (!hasUser()) return;
    fetch('/api/messages?email=' + encodeURIComponent(userInfo.email))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var badge = q('exMsgBadge');
        var n = d.unreadTotal || 0;
        if (badge) { badge.style.display = n ? 'inline-block' : 'none'; badge.textContent = n; }
        var page = q('page-messages');
        if (page && page.classList.contains('active')) exRenderConvList(d.list || []);
      }).catch(function () { });
  }

  function exRenderConvList(list) {
    var box = q('exConvList'); if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty" style="padding:20px 14px"><div class="ico">&#128172;</div><div style="font-size:12.5px">' +
        L('Hali suhbat yo\u2019q', 'No conversations yet') + '</div></div>';
      return;
    }
    box.innerHTML = list.map(function (c) {
      var active = msgPeer === c.username ? 'background:var(--gold-dim)' : '';
      var av = c.picture ? '<img src="' + e(c.picture) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover">' :
        '<div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-weight:700;flex-shrink:0">' +
        e((c.name || c.username || '?').charAt(0).toUpperCase()) + '</div>';
      return '<div onclick="exOpenThread(\'' + e(c.username) + '\')" data-name="' + e(c.name).replace(/"/g, '') + '" data-pic="' + e(c.picture) + '" ' +
        'style="display:flex;gap:10px;align-items:center;padding:11px 14px;cursor:pointer;border-bottom:1px solid var(--border);' + active + '">' +
        av + '<div style="min-width:0;flex:1">' +
        '<div style="font-size:13.5px;font-weight:600;display:flex;justify-content:space-between;gap:6px">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(c.name || ('@' + c.username)) + '</span>' +
        (c.unread ? '<span style="background:var(--gold);color:var(--on-gold);border-radius:99px;font-size:10px;padding:1px 6px;flex-shrink:0">' + c.unread + '</span>' : '') +
        '</div><div style="font-size:11.5px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(c.last || '') + '</div>' +
        '</div></div>';
    }).join('');
  }

  window.exOpenThread = function (username, name, picture) {
    if (!hasUser()) { toast(L('Avval Google bilan kiring', 'Sign in with Google first'), 'err'); return; }
    if (!name || !picture) {
      // Suhbatlar ro'yxatidan bosilgan bo'lsa, ma'lumot data-attributedan olinadi
      var row = document.querySelector('#exConvList [onclick*="' + username + '"]');
      if (row) { name = row.getAttribute('data-name') || ''; picture = row.getAttribute('data-pic') || ''; }
    }
    msgPeer = username;
    q('exThreadEmpty').style.display = 'none';
    q('exThreadBody').style.display = 'flex';
    q('exThreadHead').innerHTML =
      (picture ? '<img src="' + e(picture) + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover">' : '') +
      '<div><div style="font-weight:600;font-size:14px">' + e(name || ('@' + username)) + '</div>' +
      '<div style="font-size:11.5px;color:var(--text3)">@' + e(username) + '</div></div>';
    go('messages');
    exLoadThread();
    clearInterval(msgTimer);
    msgTimer = setInterval(exLoadThread, 4000);
  };

  function exLoadThread() {
    if (!msgPeer || !hasUser()) return;
    fetch('/api/messages?email=' + encodeURIComponent(userInfo.email) + '&withUsername=' + encodeURIComponent(msgPeer))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) return;
        var box = q('exThreadMsgs'); if (!box) return;
        var atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
        box.innerHTML = (d.thread || []).map(function (m) {
          return '<div style="display:flex;max-width:78%;align-self:' + (m.mine ? 'flex-end' : 'flex-start') + '">' +
            '<div style="background:' + (m.mine ? 'var(--gold)' : 'var(--surface2)') + ';color:' + (m.mine ? 'var(--on-gold)' : 'var(--text)') +
            ';border:1px solid ' + (m.mine ? 'transparent' : 'var(--border)') + ';border-radius:13px;padding:9px 13px;font-size:13.5px;word-break:break-word">' +
            e(m.body) + '</div></div>';
        }).join('');
        if (atBottom) box.scrollTop = box.scrollHeight;
        exUnreadPoll();
      }).catch(function () { });
  }

  window.exSendMsg = function () {
    var inp = q('exMsgInput'); if (!inp) return;
    var text = (inp.value || '').trim();
    if (!text || !msgPeer) return;
    if (!hasUser()) { toast(L('Avval Google bilan kiring', 'Sign in with Google first'), 'err'); return; }
    inp.value = '';
    fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: userInfo.email, toUsername: msgPeer, body: text })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      exLoadThread();
    }).catch(function (err) { toast(err.message, 'err'); inp.value = text; });
  };

  /* ---- 8.3 Reytingda username qidiruv ---- */
  function injectUserSearch() {
    var solo = q('exSolo');
    if (!solo) return;
    solo.insertAdjacentHTML('beforebegin',
      '<div class="form-group" style="margin-bottom:14px">' +
      '<input id="exUserSearch" placeholder="' + L('Username bo\u2019yicha qidirish…', 'Search by username…') + '">' +
      '</div><div id="exSearchResults"></div>');
    q('exUserSearch').addEventListener('input', debounce(exRunUserSearch, 400));
  }

  function exRunUserSearch() {
    var v = (q('exUserSearch').value || '').trim();
    var box = q('exSearchResults');
    if (v.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="empty" style="padding:14px"><span class="typing"><i></i><i></i><i></i></span></div>';
    fetch('/api/scores?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (d) {
      var list = d.list || [];
      if (!list.length) { box.innerHTML = '<div class="empty" style="padding:14px">' + L('Hech kim topilmadi', 'No one found') + '</div>'; return; }
      box.innerHTML = '<div class="card">' + list.map(function (u) {
        var av = u.picture ? '<img src="' + e(u.picture) + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover">' :
          '<div style="width:30px;height:30px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-weight:700">' +
          e((u.name || u.username).charAt(0).toUpperCase()) + '</div>';
        return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">' + av +
          '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">' + e(u.name || ('@' + u.username)) + '</div>' +
          '<div style="font-size:11.5px;color:var(--text3)">@' + e(u.username) + ' &middot; ' + u.xp + ' XP</div></div>' +
          '<button class="btn btn-ghost btn-sm" onclick="exOpenThread(\'' + e(u.username) + '\',\'' + e(u.name).replace(/'/g, '') + '\',\'' + e(u.picture) + '\')">' +
          L('Xabar', 'Message') + '</button></div>';
      }).join('') + '</div>';
    }).catch(function () { box.innerHTML = ''; });
  }

  /* ---- 8.4 Klublarni nomi bo'yicha qidirish ---- */
  var lastClubList = [];
  function injectClubSearch() {
    var box = q('exClubs');
    if (!box || q('exClubSearch')) return;
    box.insertAdjacentHTML('beforebegin',
      '<div class="form-group" style="margin-bottom:14px">' +
      '<input id="exClubSearch" placeholder="' + L('Klub nomi bo\u2019yicha qidirish…', 'Search clubs by name…') + '">' +
      '</div>');
    q('exClubSearch').addEventListener('input', function () {
      var v = (this.value || '').trim().toLowerCase();
      var filtered = !v ? lastClubList : lastClubList.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(v) >= 0 || (c.code || '').toLowerCase().indexOf(v) >= 0;
      });
      renderClubsList(filtered);
    });
  }

  /* ---- 8.5 Ulanish nuqtalari ---- */
  var _go2 = window.go;
  window.go = function (page) {
    _go2(page);
    if (page === 'messages') { exUnreadPoll(); }
    else { clearInterval(msgTimer); }
  };

  var _setLang2 = window.setLang;
  window.setLang = function (l) {
    _setLang2(l);
    paintMsgLabels();
    var us = q('exUserSearch'); if (us) us.placeholder = L('Username bo\u2019yicha qidirish…', 'Search by username…');
    var cs = q('exClubSearch'); if (cs) cs.placeholder = L('Klub nomi bo\u2019yicha qidirish…', 'Search clubs by name…');
    var title = q('exUserTitle'); if (title) title.textContent = '@ ' + L('Username (foydalanuvchi nomi)', 'Username');
    var hint = q('exUserHint'); if (hint) hint.textContent = L(
      'Boshqa talabalar sizni shu nom orqali topadi va xabar yoza oladi. Faqat lotin harf, raqam va pastki chiziq, 3-20 belgi.',
      'Other students find and message you by this name. Latin letters, digits and underscore only, 3-20 characters.');
    var sv = q('exUsernameSave'); if (sv) sv.textContent = L('Saqlash', 'Save');
  };

  /* ============================================================
     9. Ishga tushirish (8-bo'lim)
     ============================================================ */
  function start2() {
    try {
      injectMessagesPage();
      injectMessagesNav();
      injectUsernameCard();
      injectUserSearch();
      paintMsgLabels();
      if (hasUser()) setTimeout(exUnreadPoll, 3000);
    } catch (err) {
      if (window.console) console.warn('StudyAI extra (username/messages):', err);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start2);
  else start2();

  /* ============================================================
     10. ISHGA TUSHIRISH (asosiy 1-7 bo'lim) — pastda turadi
     ============================================================ */
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
