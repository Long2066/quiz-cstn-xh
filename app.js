/* ===== STATE ===== */
let state = {
  currentScreen: 'home',
  quizQuestions: [],
  currentIndex: 0,
  answers: {},
  mode: 'practice', // practice | exam
  subject: null,
  examDe: 1,
  timerSeconds: 0,
  timerMax: 0,
  timerInterval: null,
  startTime: null,
  submitted: false,
  reviewFilter: 'all',
  history: JSON.parse(localStorage.getItem('quiz_history') || '[]')
};

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hide');
  }, 1500);
  initTheme();
  renderHome();
  updateStats();
});

/* ===== THEME ===== */
function initTheme() {
  const t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

/* ===== RENDER HOME ===== */
function renderHome() {
  const grid = document.getElementById('subject-grid');
  const totalQ = QUESTION_BANK.length;
  document.getElementById('total-q-count').textContent = totalQ;
  
  grid.innerHTML = SUBJECTS.map(s => {
    const count = QUESTION_BANK.filter(q => q.subject === s.id).length;
    const done = getSubjectProgress(s.id);
    const pct = count > 0 ? Math.round((done / count) * 100) : 0;
    return `<div class="subject-card" style="--card-color:${s.color}" onclick="startPractice('${s.id}')">
      <div class="card-icon" style="background:${s.color}15;color:${s.color}">${s.icon}</div>
      <div class="card-title">${s.name}</div>
      <div class="card-count">${count} câu hỏi • ${s.desc}</div>
      <div class="card-progress"><div class="card-progress-fill" style="width:${pct}%;background:${s.color}"></div></div>
      <div class="card-btn">Bắt đầu ôn tập →</div>
    </div>`;
  }).join('');

  renderHistory();
}

function getSubjectProgress(sid) {
  const done = JSON.parse(localStorage.getItem('progress_' + sid) || '[]');
  return done.length;
}

function markProgress(sid, qid) {
  const key = 'progress_' + sid;
  let done = JSON.parse(localStorage.getItem(key) || '[]');
  if (!done.includes(qid)) { done.push(qid); localStorage.setItem(key, JSON.stringify(done)); }
}

/* ===== STATS ===== */
function updateStats() {
  const total = QUESTION_BANK.length;
  let done = 0;
  SUBJECTS.forEach(s => { done += getSubjectProgress(s.id); });
  document.getElementById('stats-text').textContent = `${Math.min(done, total)}/${total}`;
}

/* ===== SCREENS ===== */
function showScreen(id) {
  ['home-screen', 'quiz-screen', 'result-screen'].forEach(s => {
    document.getElementById(s).style.display = s === id + '-screen' ? '' : 'none';
  });
  document.getElementById('main-header').style.display = id === 'quiz' ? 'none' : '';
  window.scrollTo(0, 0);
}

function showHome() {
  clearTimer();
  state.submitted = false;
  showScreen('home');
  renderHome();
  updateStats();
}

/* ===== START PRACTICE ===== */
function startPractice(subjectId) {
  const questions = QUESTION_BANK.filter(q => q.subject === subjectId);
  if (!questions.length) return;
  state.mode = 'practice';
  state.subject = SUBJECTS.find(s => s.id === subjectId);
  state.quizQuestions = shuffleArray([...questions]);
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.startTime = Date.now();
  
  document.getElementById('quiz-title').textContent = state.subject.name;
  document.getElementById('quiz-subtitle').textContent = `Ôn tập • ${questions.length} câu`;
  document.getElementById('quiz-timer').style.display = 'none';
  
  showScreen('quiz');
  buildQuestionMap();
  renderQuestion();
}

/* ===== EXAM ===== */
function selectDe(btn) {
  document.querySelectorAll('.exam-de-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.examDe = parseInt(btn.dataset.de);
}

function setExamTime(mins) {
  document.getElementById('exam-time').value = mins;
  document.querySelectorAll('.time-presets button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

function startExam() {
  const mins = parseInt(document.getElementById('exam-time').value) || 60;
  // Mỗi lần bấm thi đều tạo seed ngẫu nhiên mới → đảo câu + đảo đáp án khác nhau
  const seed = state.examDe * 12345 + Date.now();
  
  // Generate 50 questions shuffled, đảm bảo không trùng lặp
  let allQ = QUESTION_BANK.map(q => ({...q, options: [...q.options]}));
  allQ = seededShuffle(allQ, seed);
  // Loại trùng theo ID
  const seen = new Set();
  const unique = [];
  for (const q of allQ) {
    if (!seen.has(q.id)) { seen.add(q.id); unique.push(q); }
    if (unique.length >= 50) break;
  }
  const examQ = unique.map((q, idx) => {
    const newQ = {...q, options: [...q.options]};
    const optMap = [0,1,2,3];
    seededShuffleInPlace(optMap, seed + idx * 9973);
    newQ.options = optMap.map(i => q.options[i]);
    newQ.answer = optMap.indexOf(q.answer);
    return newQ;
  });
  
  state.mode = 'exam';
  state.quizQuestions = examQ;
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.startTime = Date.now();
  state.timerMax = mins * 60;
  state.timerSeconds = mins * 60;
  
  document.getElementById('quiz-title').textContent = `Đề thi ${state.examDe}`;
  document.getElementById('quiz-subtitle').textContent = `50 câu • ${mins} phút`;
  document.getElementById('quiz-timer').style.display = 'flex';
  
  showScreen('quiz');
  buildQuestionMap();
  renderQuestion();
  startTimer();
}

/* ===== TIMER ===== */
function startTimer() {
  clearTimer();
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearTimer();
      alert('⏰ Hết giờ! Bài thi sẽ được nộp tự động.');
      submitQuiz(true);
    }
  }, 1000);
}

function clearTimer() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
}

function updateTimerDisplay() {
  const m = Math.floor(Math.max(0, state.timerSeconds) / 60);
  const s = Math.max(0, state.timerSeconds) % 60;
  const display = document.getElementById('timer-display');
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const timer = document.getElementById('quiz-timer');
  timer.classList.toggle('warning', state.timerSeconds <= 60 && state.timerSeconds > 0);
}

/* ===== RENDER QUESTION ===== */
function renderQuestion() {
  const q = state.quizQuestions[state.currentIndex];
  const total = state.quizQuestions.length;
  const idx = state.currentIndex;
  
  document.getElementById('question-badge').textContent = `Câu ${idx + 1}`;
  document.getElementById('question-topic').textContent = q.subjectName;
  document.getElementById('question-text').textContent = q.question;
  document.getElementById('quiz-progress-text').textContent = `${idx + 1}/${total}`;
  document.getElementById('quiz-progress-fill').style.width = `${((idx + 1) / total) * 100}%`;
  
  const labels = ['A', 'B', 'C', 'D'];
  const userAnswer = state.answers[idx];
  const isAnswered = userAnswer !== undefined;
  const showResult = state.submitted || (state.mode === 'practice' && isAnswered);
  
  document.getElementById('options-list').innerHTML = q.options.map((opt, i) => {
    let cls = 'option-btn';
    if (showResult) {
      cls += ' disabled';
      if (i === q.answer) cls += ' correct';
      if (isAnswered && userAnswer === i && i !== q.answer) cls += ' wrong';
    } else {
      if (userAnswer === i) cls += ' selected';
    }
    return `<button class="${cls}" onclick="selectAnswer(${i})" ${showResult ? 'disabled' : ''}>
      <span class="option-label">${labels[i]}</span>
      <span class="option-content">${opt}</span>
    </button>`;
  }).join('');
  
  // Explanation
  const expBox = document.getElementById('explanation-box');
  if (showResult && q.explanation) {
    expBox.style.display = '';
    document.getElementById('explanation-content').textContent = q.explanation;
  } else {
    expBox.style.display = 'none';
  }
  
  // Nav buttons
  document.getElementById('btn-prev').disabled = idx === 0;
  const isLast = idx === total - 1;
  document.getElementById('btn-next').style.display = isLast ? 'none' : '';
  document.getElementById('btn-submit').style.display = isLast && !state.submitted ? '' : 'none';
  
  updateQuestionMap();
  updateFabBadge();
}

/* ===== SELECT ANSWER ===== */
function selectAnswer(optIdx) {
  if (state.submitted) return;
  const idx = state.currentIndex;
  const q = state.quizQuestions[idx];
  
  if (state.mode === 'practice' && state.answers[idx] !== undefined) return;
  
  state.answers[idx] = optIdx;
  markProgress(q.subject, q.id);
  renderQuestion();
}

/* ===== NAVIGATION ===== */
function nextQuestion() {
  if (state.currentIndex < state.quizQuestions.length - 1) {
    state.currentIndex++;
    renderQuestion();
    window.scrollTo(0, 0);
  }
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderQuestion();
    window.scrollTo(0, 0);
  }
}

function goToQuestion(idx) {
  state.currentIndex = idx;
  renderQuestion();
  window.scrollTo(0, 0);
}

/* ===== QUESTION MAP ===== */
function buildQuestionMap() {
  const total = state.quizQuestions.length;
  const html = Array.from({length: total}, (_, i) => 
    `<button class="qmap-btn" onclick="goToQuestion(${i})">${i + 1}</button>`
  ).join('');
  document.getElementById('question-map').innerHTML = html;
  document.getElementById('question-map-mobile').innerHTML = html;
  updateQuestionMap();
}

function updateQuestionMap() {
  ['question-map', 'question-map-mobile'].forEach(mapId => {
    const btns = document.getElementById(mapId).querySelectorAll('.qmap-btn');
    btns.forEach((btn, i) => {
      btn.className = 'qmap-btn';
      if (i === state.currentIndex) btn.classList.add('current');
      else if (state.answers[i] !== undefined) btn.classList.add('answered');
      
      if (state.submitted) {
        const q = state.quizQuestions[i];
        if (state.answers[i] === q.answer) btn.classList.add('correct-review');
        else if (state.answers[i] !== undefined) btn.classList.add('wrong-review');
      }
    });
  });
}

function updateFabBadge() {
  const unanswered = state.quizQuestions.length - Object.keys(state.answers).length;
  document.getElementById('fab-badge').textContent = unanswered;
}

function toggleMobileMap() {
  document.getElementById('mobile-map-overlay').classList.toggle('show');
  document.getElementById('mobile-map-panel').classList.toggle('show');
}

/* ===== SUBMIT ===== */
function submitQuiz(force) {
  if (!force) {
    const answered = Object.keys(state.answers).length;
    const total = state.quizQuestions.length;
    const unanswered = total - answered;
    showDialog(
      'Nộp bài?',
      unanswered > 0 
        ? `Bạn còn ${unanswered} câu chưa trả lời. Bạn có chắc muốn nộp bài?`
        : 'Bạn đã trả lời tất cả câu hỏi. Nộp bài ngay?',
      () => { closeDialog(); doSubmit(); }
    );
    return;
  }
  doSubmit();
}

function doSubmit() {
  clearTimer();
  state.submitted = true;
  
  let correct = 0, wrong = 0, skipped = 0;
  state.quizQuestions.forEach((q, i) => {
    if (state.answers[i] === undefined) skipped++;
    else if (state.answers[i] === q.answer) correct++;
    else wrong++;
  });
  
  const total = state.quizQuestions.length;
  const score = Math.round((correct / total) * 10 * 10) / 10;
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const em = Math.floor(elapsed / 60);
  const es = elapsed % 60;
  
  // Save history
  const entry = {
    date: new Date().toLocaleString('vi-VN'),
    mode: state.mode,
    title: state.mode === 'exam' ? `Đề thi ${state.examDe}` : state.subject.name,
    score, correct, wrong, skipped, total,
    time: `${String(em).padStart(2,'0')}:${String(es).padStart(2,'0')}`
  };
  state.history.unshift(entry);
  if (state.history.length > 20) state.history = state.history.slice(0, 20);
  localStorage.setItem('quiz_history', JSON.stringify(state.history));
  
  // Show result
  showScreen('result');
  
  document.getElementById('stat-correct').textContent = correct;
  document.getElementById('stat-wrong').textContent = wrong;
  document.getElementById('stat-skipped').textContent = skipped;
  document.getElementById('stat-time').textContent = entry.time;
  document.getElementById('result-score').textContent = score;
  
  // Animate ring
  const ring = document.getElementById('result-ring');
  const circumference = 339.292;
  const offset = circumference - (circumference * (score / 10));
  setTimeout(() => { ring.style.strokeDashoffset = offset; ring.style.transition = 'stroke-dashoffset 1.5s ease'; }, 100);
  
  // Color
  const circle = document.getElementById('result-circle');
  if (score >= 8) circle.style.color = 'var(--success)';
  else if (score >= 5) circle.style.color = 'var(--primary)';
  else circle.style.color = 'var(--danger)';
  
  // Title
  const titles = ['Xuất sắc! 🎉', 'Tốt lắm! 👏', 'Khá tốt! 💪', 'Cần cố gắng thêm 📚', 'Hãy ôn lại nhé! 📖'];
  const titleIdx = score >= 9 ? 0 : score >= 7 ? 1 : score >= 5 ? 2 : score >= 3 ? 3 : 4;
  document.getElementById('result-title').textContent = titles[titleIdx];
  document.getElementById('result-desc').textContent = 
    `Bạn trả lời đúng ${correct}/${total} câu (${Math.round(correct/total*100)}%)`;
  
  document.getElementById('review-section').style.display = 'none';
}

/* ===== REVIEW ===== */
function reviewAnswers() {
  document.getElementById('review-section').style.display = '';
  renderReview();
  document.getElementById('review-section').scrollIntoView({behavior: 'smooth'});
}

function filterReview(filter, btn) {
  state.reviewFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderReview();
}

function renderReview() {
  const labels = ['A', 'B', 'C', 'D'];
  const list = document.getElementById('review-list');
  
  let items = state.quizQuestions.map((q, i) => {
    const userAns = state.answers[i];
    let status;
    if (userAns === undefined) status = 'skipped';
    else if (userAns === q.answer) status = 'correct';
    else status = 'wrong';
    return {q, i, userAns, status};
  });
  
  if (state.reviewFilter !== 'all') {
    items = items.filter(it => it.status === state.reviewFilter);
  }
  
  list.innerHTML = items.map(({q, i, userAns, status}) => {
    const statusText = status === 'correct' ? '✓ Đúng' : status === 'wrong' ? '✗ Sai' : '— Bỏ qua';
    
    const optsHtml = q.options.map((opt, oi) => {
      let cls = 'review-opt';
      let icon = '';
      if (oi === q.answer) { cls += ' is-correct'; icon = '✓'; }
      else if (userAns === oi) { cls += ' is-wrong'; icon = '✗'; }
      return `<div class="${cls}">
        <span class="opt-icon">${icon}</span>
        <span>${labels[oi]}. ${opt}</span>
      </div>`;
    }).join('');
    
    return `<div class="review-item ${status}">
      <div class="review-q-header">
        <span class="review-badge">Câu ${i + 1}</span>
        <span class="review-badge">${statusText}</span>
        <span class="question-topic">${q.subjectName}</span>
      </div>
      <div class="review-q-text">${q.question}</div>
      <div class="review-options">${optsHtml}</div>
      ${q.explanation ? `<div class="explanation-box" style="display:block">
        <div class="explanation-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span>Giải thích</span>
        </div>
        <div class="explanation-content">${q.explanation}</div>
      </div>` : ''}
    </div>`;
  }).join('');
  
  if (!items.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text3);padding:20px">Không có câu hỏi nào</p>';
  }
}

/* ===== HISTORY ===== */
function renderHistory() {
  const section = document.getElementById('history-section');
  if (!state.history.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  
  document.getElementById('history-list').innerHTML = state.history.slice(0, 10).map(h => {
    const scoreColor = h.score >= 8 ? 'var(--success)' : h.score >= 5 ? 'var(--primary)' : 'var(--danger)';
    return `<div class="history-item">
      <div>
        <strong>${h.title}</strong>
        <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${h.date} • ${h.time} • ${h.correct}/${h.total} đúng</div>
      </div>
      <div class="history-score" style="color:${scoreColor}">${h.score}</div>
    </div>`;
  }).join('');
}

/* ===== DIALOG ===== */
function showDialog(title, message, onConfirm) {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-message').textContent = message;
  document.getElementById('dialog-confirm').onclick = onConfirm;
  document.getElementById('dialog-overlay').style.display = '';
}

function closeDialog() {
  document.getElementById('dialog-overlay').style.display = 'none';
}

function confirmExit() {
  if (state.submitted) { showHome(); return; }
  showDialog('Thoát bài làm?', 'Tiến trình làm bài sẽ bị mất. Bạn có chắc muốn thoát?', () => {
    closeDialog(); showHome();
  });
}

/* ===== SHUFFLE UTILS ===== */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
}

function seededShuffle(arr, seed) {
  const rng = seededRandom(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function seededShuffleInPlace(arr, seed) {
  const rng = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
