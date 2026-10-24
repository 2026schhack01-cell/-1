/**
 * Studium Mobile - 학생 맞춤형 AI 학습 플래너 & 순공 타이머
 * Mobile-First Single Page Application Logic
 */

// ==========================================
// 1. Initial State & Data Models
// ==========================================

const DEFAULT_PROFILE = {
  name: '민수',
  grade: '고2',
  target: '목표 대학 합격 & 전과목 1~2등급 달성',
  dailyHours: 6,
  grades: {
    korean: '3',
    math: '4',
    english: '2',
    history: '2',
    science: '3',
    society: '3'
  },
  weakSubject: '수학',
  isSetup: false,
  apiKey: '',
  // 학생이 직접 설정하는 순공시간 목표 그래프 모델
  customGoals: {
    dailyTargetHours: 6.0,
    weekdayTargetHours: 5.5,
    weekendTargetHours: 8.0,
    useCustomDayGoals: true
  }
};

// Global State
let state = {
  profile: JSON.parse(localStorage.getItem('studium_profile')) || DEFAULT_PROFILE,
  tasks: JSON.parse(localStorage.getItem('studium_tasks')) || [],
  logs: JSON.parse(localStorage.getItem('studium_logs')) || {},
  currentTimer: {
    taskId: null,
    subject: '수학',
    mode: 'pure',
    isRunning: false,
    startTime: null,
    elapsedSeconds: 0,
    targetSeconds: 3600,
    lastTickTime: null,
    intervalId: null
  },
  activeTab: 'planner'
};

// Ensure customGoals structure exists for backwards compatibility
if (!state.profile.customGoals) {
  state.profile.customGoals = {
    dailyTargetHours: state.profile.dailyHours || 6.0,
    weekdayTargetHours: 5.5,
    weekendTargetHours: 8.0,
    useCustomDayGoals: true
  };
}

// Subject Color Palette (Extended Subjects)
const SUBJECT_THEMES = {
  '수학': { bg: 'bg-indigo-500', text: 'text-indigo-600', lightBg: 'bg-indigo-50', border: 'border-indigo-200', hex: '#6366f1' },
  '국어': { bg: 'bg-rose-500', text: 'text-rose-600', lightBg: 'bg-rose-50', border: 'border-rose-200', hex: '#f43f5e' },
  '영어': { bg: 'bg-amber-500', text: 'text-amber-600', lightBg: 'bg-amber-50', border: 'border-amber-200', hex: '#f59e0b' },
  '한국사': { bg: 'bg-orange-500', text: 'text-orange-600', lightBg: 'bg-orange-50', border: 'border-orange-200', hex: '#ea580c' },
  '과학': { bg: 'bg-teal-500', text: 'text-teal-600', lightBg: 'bg-teal-50', border: 'border-teal-200', hex: '#0d9488' },
  '사회': { bg: 'bg-sky-500', text: 'text-sky-600', lightBg: 'bg-sky-50', border: 'border-sky-200', hex: '#0284c7' },
  '정보': { bg: 'bg-purple-500', text: 'text-purple-600', lightBg: 'bg-purple-50', border: 'border-purple-200', hex: '#a855f7' },
  '기타': { bg: 'bg-slate-500', text: 'text-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200', hex: '#64748b' }
};

function getSubjectTheme(subjectName) {
  for (const [key, val] of Object.entries(SUBJECT_THEMES)) {
    if (subjectName.includes(key)) return val;
  }
  return SUBJECT_THEMES['기타'];
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFormattedToday() {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();
  return `${now.getMonth() + 1}.${now.getDate()} (${days[now.getDay()]})`;
}

// ==========================================
// 2. Lifecycle & Initialization
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  // 1. 더미/예시 기록(42시간 등)이 들어있던 경우 오늘 순공 시작에 맞추어 자동 청소
  cleanupDummyLogs();

  if (!state.profile.isSetup) {
    openProfileModal(true);
  } else {
    if (state.tasks.length === 0) {
      generateAiPlan(false);
    }
  }

  updateProfileUI();
  updateDateBadges();
  renderPlanner();
  updateTotalHeaderPureStudy();
  initTimerSubjectSelect();
  initCharts();

  if (state.profile.apiKey) {
    document.getElementById('inputGeminiApiKey').value = state.profile.apiKey;
    const btnLabel = document.getElementById('apiKeyBtnLabel');
    if (btnLabel) btnLabel.innerText = 'Gemini 연동됨 ✓';
  }

  updateTimerUI();
});

// 더미/샘플 데이터 청소 (오늘 첫 시작하는 학생을 위해 0초부터 시작)
function cleanupDummyLogs() {
  const todayKey = getTodayDateKey();
  let hasDummy = false;

  // 오늘 외의 과거 요일에 총 30시간 이상의 대용량 예시 데이터가 남아있는지 확인
  let pastSec = 0;
  for (const [dateKey, dayLog] of Object.entries(state.logs)) {
    if (dateKey !== todayKey) {
      for (const sec of Object.values(dayLog)) {
        pastSec += sec;
      }
    }
  }

  // 예시 데이터(42시간 등)가 채워져 있었다면 오늘 이외의 과거 더미 로그를 청소
  if (pastSec > 25 * 3600) {
    const todayLogs = state.logs[todayKey] || {};
    state.logs = {};
    if (Object.keys(todayLogs).length > 0) {
      state.logs[todayKey] = todayLogs;
    }
    saveLogs();
    console.log('Dummy weekly data cleared. Reset to real study time.');
  }
}

// 학생 수동 순공시간 전체 초기화 (0시간 0분부터 시작)
function resetAllStudyData() {
  if (confirm('모든 순공시간 기록을 0초로 초기화하시겠습니까?\n(처음부터 정확한 순공시간을 측정할 수 있습니다)')) {
    if (state.currentTimer.isRunning) {
      pauseTimer();
    }
    state.logs = {};
    state.currentTimer.elapsedSeconds = 0;
    state.tasks.forEach(t => t.spentSeconds = 0);

    saveLogs();
    saveTasks();

    updateProfileUI();
    renderPlanner();
    updateTotalHeaderPureStudy();
    updateTimerUI();
    updateTimerStatsSummary();
    renderWeeklyChart();
    renderSubjectPieChart();

    alert('🎉 모든 순공시간이 0초로 깔끔하게 초기화되었습니다!\n이제부터 측정한 순공시간이 1초씩 정확하게 올라갑니다.');
  }
}

function updateDateBadges() {
  const badge = document.getElementById('plannerDateBadge');
  if (badge) badge.innerText = getFormattedToday();
}

function updateProfileUI() {
  const p = state.profile;
  const nameEl = document.getElementById('headerStudentName');
  const greetingEl = document.getElementById('plannerGreeting');
  const chartGoalBadge = document.getElementById('chartGoalBadge');

  if (nameEl) nameEl.innerText = `${p.name} 학생 · ${p.grade}`;
  if (greetingEl) greetingEl.innerText = `${p.name} 학생의 오늘의 맞춤 플랜`;
  if (chartGoalBadge) chartGoalBadge.innerText = `${p.customGoals?.dailyTargetHours || p.dailyHours}시간`;
}

// ==========================================
// 3. AI Planner Generator Algorithm
// ==========================================

function generateAiPlan(notify = true) {
  const p = state.profile;
  const totalMinutes = p.dailyHours * 60;

  // Base weights for extended subjects: 수학, 국어, 영어, 한국사, 과학, 사회
  let weights = {
    '수학': 0.28,
    '국어': 0.22,
    '영어': 0.20,
    '과학': 0.12,
    '사회': 0.10,
    '한국사': 0.08
  };

  if (p.weakSubject && weights[p.weakSubject]) {
    weights[p.weakSubject] += 0.15;
    const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k in weights) {
      weights[k] = weights[k] / totalW;
    }
  }

  const topicsData = {
    '수학': {
      '고1': ['공통수학 이차방정식과 판별식 기출 15제', '함수의 그래프와 최대최소 유형 훈련'],
      '고2': ['수학I 지수/로그함수 킬러 문항 5제', '수학II 미분계수와 도함수의 활용 집중'],
      '고3': ['미적분 극대/극소 & 준킬러 4점 문항 완성', '수능 기출 오답노트 2회독 및 피드백'],
      'default': ['핵심 개념 원리 정리 및 필수 예제 20문항', '취약 단원 오답 분석 및 유사 문항 풀이']
    },
    '국어': {
      '고1': ['현대시/고전시가 빈출 개념어 분석 및 3지문 독해', '문법 맞춤법 & 음운 변동 정리'],
      '고2': ['독서(비문학) 과학/기술 제재 구조도 분석 2세트', '문학 고전소설 갈등 구조 파악'],
      '고3': ['독서 경제/철학 고난도 지문 시간 관리 훈련', '문학 EBS 연계교재 핵심 작품 총정리'],
      'default': ['비문학 지문 문단별 요약 훈련', '기출 문학 갈래별 핵심 출제 포인트']
    },
    '영어': {
      '고1': ['필수 구문독해 50문장 분석 & 고난도 단어 60개', '어법 핵심 유형 5선 풀이'],
      '고2': ['수능 기출 빈칸추론 & 순서배열 정답 근거 도출', 'EBS 수능특강 4지문 정밀 분석'],
      '고3': ['빈칸추론 31~34번 논리 전개 패턴 분석', '주간 실전 모의고사 1회 풀이 및 오답'],
      'default': ['수능/내신 빈출 어휘 50개 암기 및 테스트', '어법 및 구문 독해 연습']
    },
    '한국사': {
      '고1': ['고려-조선 통치 체제 비교 및 핵심 사건 연표 정리', '근현대사 개항기 주요 조약과 개혁 운동'],
      '고2': ['일제 강점기 무단통치·문화통치 핵심 사료 분석', '대한민국 임시정부 및 광복 이후 현대사'],
      '고3': ['수능 한국사 빈출 10대 핵심 테마 총정리', '기출 모의고사 사료 해석 연습'],
      'default': ['시대별 흐름 연표 백지 복습', '빈출 사료 키워드 암기 및 문제 풀이']
    },
    '과학': {
      '고1': ['통합과학 역학적 시스템 중력과 운동 공식 암기', '생명 시스템 및 화학 결합 핵심 원리'],
      '고2': ['물리학/화학/생명과학/지구과학 킬러 단원 기출 풀이', '도표 및 실험 데이터 정밀 해석'],
      '고3': ['과탐 수능특강 킬러 유형 심화 훈련', '모의고사 1회 풀이 및 오답 개념 단권화'],
      'default': ['핵심 과학 개념 마인드맵 정리', '단원별 기출 실험 탐구 문제 풀이']
    },
    '사회': {
      '고1': ['통합사회 인권과 헌법, 시장 경제와 금융 정리', '정의로운 사회와 지속 가능한 발전'],
      '고2': ['사회문화/생활과윤리/한국지리 핵심 도표 분석', '사상가별 입장 차이 비교 및 함정 선지 분석'],
      '고3': ['사탐 수능완성 고난도 킬러 문항 대비', '실전 모의고사 1회 풀이 및 오답 노트'],
      'default': ['핵심 사회 개념 구조도 완성', '사례 중심 선지 판별 연습']
    }
  };

  const newTasks = [];
  // 주요 집중 과목 (취약 과목 포함 4~5개 우선 편성하여 하루 부담 조절)
  const allSubjs = ['수학', '국어', '영어', '한국사', '과학', '사회'];
  
  // 편성할 과목: 취약 과목 + 국/영/수 + 과학/사회/한국사 중 순차 순환
  const chosenSubjs = [p.weakSubject, '수학', '국어', '영어', '한국사', '과학', '사회'].filter((v, i, a) => a.indexOf(v) === i);
  // 하루 최대 5과목으로 집중도 유지
  const activePlanSubjs = chosenSubjs.slice(0, 5);

  let activeWeights = {};
  activePlanSubjs.forEach(s => activeWeights[s] = weights[s] || 0.15);
  const sumWeights = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  for (const s in activeWeights) activeWeights[s] /= sumWeights;

  activePlanSubjs.forEach((subj, idx) => {
    const rawMinutes = Math.round((totalMinutes * activeWeights[subj]) / 10) * 10;
    const targetMin = Math.max(25, rawMinutes);

    const gradeKey = topicsData[subj] && topicsData[subj][p.grade] ? p.grade : 'default';
    const topicList = (topicsData[subj] && topicsData[subj][gradeKey]) || ['핵심 개념 정리 및 기출 문제 풀이'];
    const chosenTopic = topicList[idx % topicList.length];

    newTasks.push({
      id: 'task_' + Date.now() + '_' + idx,
      subject: subj,
      topic: chosenTopic,
      targetMinutes: targetMin,
      spentSeconds: 0,
      completed: false,
      isWeak: subj === p.weakSubject
    });
  });

  state.tasks = newTasks;
  saveTasks();
  renderPlanner();
  initTimerSubjectSelect();

  const adviceEl = document.getElementById('plannerAiAdvice');
  if (adviceEl) {
    adviceEl.innerText = `${p.name} 학생의 성취 목표("${p.target}")와 취약 과목(${p.weakSubject})에 맞추어 하루 ${p.dailyHours}시간의 순공 계획이 최적화되었습니다.`;
  }

  if (notify) {
    alert('✨ 확장된 과목(국어, 수학, 영어, 한국사, 과학, 사회)에 맞춘 새로운 AI 플랜이 생성되었습니다!');
  }
}

function regenerateAiPlan() {
  if (confirm('현재 플래너를 학생의 최신 성적과 목표에 맞추어 AI 플랜으로 다시 작성하시겠습니까?')) {
    generateAiPlan(true);
  }
}

// ==========================================
// 4. Planner UI Rendering
// ==========================================

function renderPlanner() {
  const container = document.getElementById('plannerCardsContainer');
  if (!container) return;

  if (state.tasks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 bg-white rounded-3xl border border-dashed border-slate-300">
        <i data-lucide="calendar-plus" class="w-10 h-10 text-slate-400 mx-auto mb-2"></i>
        <p class="text-xs font-bold text-slate-700">작성된 플래너가 없습니다.</p>
        <button onclick="generateAiPlan(true)" class="mt-2 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow hover:bg-indigo-700 transition">
          AI 맞춤 플랜 생성하기
        </button>
      </div>
    `;
    lucide.createIcons();
    updateOverallProgress();
    return;
  }

  let html = '';
  state.tasks.forEach(task => {
    const theme = getSubjectTheme(task.subject);
    const targetSec = task.targetMinutes * 60;
    const progressPercent = Math.min(100, Math.round((task.spentSeconds / targetSec) * 100));
    const isStudyingNow = state.currentTimer.isRunning && state.currentTimer.taskId === task.id;

    html += `
      <div class="bg-white rounded-2xl border ${isStudyingNow ? 'studying-card-glow border-indigo-500' : 'border-slate-200/90'} p-4 shadow-sm transition">
        <div>
          <!-- Card Header -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-lg ${theme.lightBg} ${theme.text} text-[11px] font-extrabold border ${theme.border}">
                ${task.subject}
              </span>
              ${task.isWeak ? '<span class="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.2 rounded-full font-bold border border-red-200">집중보완</span>' : ''}
              ${task.completed ? '<span class="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded-full font-bold border border-emerald-200">완료</span>' : ''}
            </div>

            <div class="flex items-center gap-1">
              <button onclick="toggleTaskComplete('${task.id}')" title="완료 체크" class="p-1 text-slate-400 hover:text-emerald-600 transition">
                <i data-lucide="${task.completed ? 'check-circle-2' : 'circle'}" class="w-4 h-4 ${task.completed ? 'text-emerald-500 fill-emerald-100' : ''}"></i>
              </button>
              <button onclick="deleteTask('${task.id}')" title="삭제" class="p-1 text-slate-300 hover:text-rose-500 transition">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Topic -->
          <h4 class="text-xs font-bold ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'} mb-2.5 leading-snug">
            ${task.topic}
          </h4>

          <!-- Progress -->
          <div class="space-y-1 mb-3">
            <div class="flex justify-between items-center text-[11px] text-slate-500 font-mono">
              <span id="taskSpent_${task.id}" class="font-bold text-slate-700">${formatTime(task.spentSeconds)}</span>
              <span id="taskPct_${task.id}">목표 ${task.targetMinutes}분 (${progressPercent}%)</span>
            </div>
            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div id="taskBar_${task.id}" class="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-300" style="width: ${progressPercent}%"></div>
            </div>
          </div>
        </div>

        <!-- Start Study Button -->
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[10px] text-slate-400">
            ${isStudyingNow ? '🔥 순공 측정 중...' : '순공 타이머 연결'}
          </span>
          <button onclick="startStudyForTask('${task.id}')" class="px-3 py-1.5 ${isStudyingNow ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-900 hover:bg-indigo-600 text-white'} rounded-xl text-[11px] font-bold transition flex items-center gap-1 shadow-sm">
            <i data-lucide="${isStudyingNow ? 'pause' : 'play'}" class="w-3 h-3 fill-current"></i>
            <span>${isStudyingNow ? '타이머 확인' : '공부 시작'}</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons();
  updateOverallProgress();
}

function updateOverallProgress() {
  let totalTargetSec = 0;
  let totalSpentSec = 0;

  state.tasks.forEach(t => {
    totalTargetSec += t.targetMinutes * 60;
    totalSpentSec += t.spentSeconds;
  });

  const percent = totalTargetSec > 0 ? Math.min(100, Math.round((totalSpentSec / totalTargetSec) * 100)) : 0;
  
  const textEl = document.getElementById('overallProgressText');
  const barEl = document.getElementById('overallProgressBar');

  if (textEl) {
    const spentMin = Math.floor(totalSpentSec / 60);
    const targetMin = Math.floor(totalTargetSec / 60);
    textEl.innerText = `${percent}% 달성 (${spentMin}분 / 목표 ${targetMin}분)`;
  }
  if (barEl) {
    barEl.style.width = `${percent}%`;
  }
}

function toggleTaskComplete(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    renderPlanner();
  }
}

function deleteTask(taskId) {
  if (confirm('이 과목 플랜을 삭제하시겠습니까?')) {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    saveTasks();
    renderPlanner();
    initTimerSubjectSelect();
  }
}

function openAddSubjectModal() {
  document.getElementById('addSubjectModal').classList.remove('hidden');
}
function closeAddSubjectModal() {
  document.getElementById('addSubjectModal').classList.add('hidden');
}

function handleAddSubjectSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('newSubjectName').value.trim();
  const goal = document.getElementById('newSubjectGoal').value.trim();
  const minutes = parseInt(document.getElementById('newSubjectMinutes').value) || 60;

  state.tasks.push({
    id: 'task_' + Date.now(),
    subject: name,
    topic: goal,
    targetMinutes: minutes,
    spentSeconds: 0,
    completed: false,
    isWeak: false
  });

  saveTasks();
  renderPlanner();
  initTimerSubjectSelect();
  closeAddSubjectModal();
  document.getElementById('newSubjectName').value = '';
  document.getElementById('newSubjectGoal').value = '';
}

// ==========================================
// 5. Accurate Pure Study Timer
// ==========================================

function initTimerSubjectSelect() {
  const select = document.getElementById('timerSubjectSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '';

  const subjects = state.tasks.length > 0
    ? [...new Set(state.tasks.map(t => t.subject))]
    : ['수학', '국어', '영어', '한국사', '과학', '사회'];

  subjects.forEach(subj => {
    const opt = document.createElement('option');
    opt.value = subj;
    opt.innerText = subj;
    select.appendChild(opt);
  });

  if (subjects.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = subjects[0];
  }

  onTimerSubjectChange(select.value);
}

function onTimerSubjectChange(subject) {
  state.currentTimer.subject = subject;
  
  const task = state.tasks.find(t => t.subject === subject);
  if (task) {
    state.currentTimer.taskId = task.id;
    state.currentTimer.targetSeconds = task.targetMinutes * 60;
  } else {
    state.currentTimer.taskId = null;
    state.currentTimer.targetSeconds = 60 * 60;
  }

  const theme = getSubjectTheme(subject);
  const badge = document.getElementById('currentSubjectColorBadge');
  if (badge) badge.className = `w-3.5 h-8 rounded-full ${theme.bg}`;

  const targetMin = Math.round(state.currentTimer.targetSeconds / 60);
  const targetDisplay = document.getElementById('timerTargetDisplay');
  if (targetDisplay) targetDisplay.innerText = `${targetMin}분`;

  updateTimerStatsSummary();
  updateTimerUI();
}

function startStudyForTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  switchTab('timer');

  const select = document.getElementById('timerSubjectSelect');
  if (select) {
    select.value = task.subject;
    onTimerSubjectChange(task.subject);
  }

  state.currentTimer.taskId = task.id;
  if (!state.currentTimer.isRunning) {
    startTimer();
  }
}

function startTimer() {
  if (state.currentTimer.isRunning) return;

  state.currentTimer.isRunning = true;
  state.currentTimer.lastTickTime = Date.now();

  const statusText = document.getElementById('timerStatusText');
  const statusDot = document.getElementById('timerStatusDot');
  const startBtn = document.getElementById('btnTimerStart');
  const pauseBtn = document.getElementById('btnTimerPause');
  const stopBtn = document.getElementById('btnTimerStop');
  const ping = document.getElementById('activeTimerIndicator');

  if (statusText) statusText.innerText = '순공 집중 중...';
  if (statusDot) statusDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
  if (startBtn) startBtn.classList.add('hidden');
  if (pauseBtn) pauseBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.remove('hidden');
  if (ping) ping.classList.remove('hidden');

  let autoSaveCounter = 0;

  state.currentTimer.intervalId = setInterval(() => {
    const now = Date.now();
    const deltaSeconds = (now - state.currentTimer.lastTickTime) / 1000;
    state.currentTimer.lastTickTime = now;

    state.currentTimer.elapsedSeconds += deltaSeconds;

    // 1. 해당 과목 Task 실시간 누적 & UI 갱신
    if (state.currentTimer.taskId) {
      const task = state.tasks.find(t => t.id === state.currentTimer.taskId);
      if (task) {
        task.spentSeconds += deltaSeconds;

        // 플래너 카드의 해당 과목 시간/게이지 1초마다 실시간 카운트업
        const taskSpentEl = document.getElementById(`taskSpent_${task.id}`);
        const taskPctEl = document.getElementById(`taskPct_${task.id}`);
        const taskBarEl = document.getElementById(`taskBar_${task.id}`);

        const targetSec = task.targetMinutes * 60;
        const progressPct = Math.min(100, Math.round((task.spentSeconds / targetSec) * 100));

        if (taskSpentEl) taskSpentEl.innerText = formatTime(task.spentSeconds);
        if (taskPctEl) taskPctEl.innerText = `목표 ${task.targetMinutes}분 (${progressPct}%)`;
        if (taskBarEl) taskBarEl.style.width = `${progressPct}%`;
      }
    }

    // 2. 오늘의 과목별 누적 로그에 1초마다 즉시 반영
    const todayKey = getTodayDateKey();
    if (!state.logs[todayKey]) state.logs[todayKey] = {};
    if (!state.logs[todayKey][state.currentTimer.subject]) {
      state.logs[todayKey][state.currentTimer.subject] = 0;
    }
    state.logs[todayKey][state.currentTimer.subject] += deltaSeconds;

    // 3. 모든 화면의 순공시간 텍스트 실시간 카운트업 갱신
    updateTimerUI();              // 타이머 중앙 시계 & 원형 서클
    updateTotalHeaderPureStudy(); // 앱 상단 헤더 오늘 순공
    updateTimerStatsSummary();    // 타이머 화면 하단 실시간 통계
    updateOverallProgress();      // 플래너 상단 총 달성률 바

    // 4. 3초마다 로컬스토리지에 안전하게 자동 저장
    autoSaveCounter++;
    if (autoSaveCounter >= 3) {
      autoSaveCounter = 0;
      saveTasks();
      saveLogs();
    }
  }, 1000);

  renderPlanner();
}

function pauseTimer() {
  if (!state.currentTimer.isRunning) return;

  clearInterval(state.currentTimer.intervalId);
  state.currentTimer.isRunning = false;

  const statusText = document.getElementById('timerStatusText');
  const statusDot = document.getElementById('timerStatusDot');
  const startBtn = document.getElementById('btnTimerStart');
  const startBtnLabel = document.getElementById('btnTimerStartLabel');
  const pauseBtn = document.getElementById('btnTimerPause');
  const ping = document.getElementById('activeTimerIndicator');

  if (statusText) statusText.innerText = '휴식 중 (정지)';
  if (statusDot) statusDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
  if (startBtn) startBtn.classList.remove('hidden');
  if (startBtnLabel) startBtnLabel.innerText = '순공 다시 시작';
  if (pauseBtn) pauseBtn.classList.add('hidden');
  if (ping) ping.classList.add('hidden');

  saveTasks();
  saveLogs();
  renderPlanner();
  updateTimerStatsSummary();
}

function finishSession() {
  pauseTimer();
  const totalMin = Math.round(state.currentTimer.elapsedSeconds / 60);
  playChime();

  alert(`🎉 [학습 세션 완료]\n과목: ${state.currentTimer.subject}\n측정된 순공시간: ${formatTime(state.currentTimer.elapsedSeconds)} (${totalMin}분)\n\n오늘의 학습 기록에 저장되었습니다!`);

  state.currentTimer.elapsedSeconds = 0;
  
  const stopBtn = document.getElementById('btnTimerStop');
  const startBtnLabel = document.getElementById('btnTimerStartLabel');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (startBtnLabel) startBtnLabel.innerText = '순공 시작하기';

  updateTimerUI();
  updateTimerStatsSummary();
  renderWeeklyChart();
}

function resetTimer() {
  if (confirm('현재 측정 중인 시간을 초기화할까요?')) {
    pauseTimer();
    state.currentTimer.elapsedSeconds = 0;
    const stopBtn = document.getElementById('btnTimerStop');
    const startBtnLabel = document.getElementById('btnTimerStartLabel');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (startBtnLabel) startBtnLabel.innerText = '순공 시작하기';
    updateTimerUI();
  }
}

function updateTimerUI() {
  const display = document.getElementById('timerDisplayMain');
  const percentDisplay = document.getElementById('timerPercentDisplay');
  const circle = document.getElementById('timerProgressCircle');

  const totalElapsed = state.currentTimer.elapsedSeconds;
  if (display) display.innerText = formatTime(totalElapsed);

  const circumference = 276.46;
  const targetSec = state.currentTimer.targetSeconds || 3600;
  const percent = Math.min(100, Math.round((totalElapsed / targetSec) * 100));

  if (percentDisplay) percentDisplay.innerText = `${percent}%`;

  if (circle) {
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = percent >= 100 ? '#10b981' : '#4f46e5';
  }
}

function updateTimerStatsSummary() {
  const todayKey = getTodayDateKey();
  const todayLogs = state.logs[todayKey] || {};
  
  const subjSec = todayLogs[state.currentTimer.subject] || 0;
  const allSec = Object.values(todayLogs).reduce((a, b) => a + b, 0);

  const statSubj = document.getElementById('statSubjectTodayPure');
  const statAll = document.getElementById('statAllTodayPure');

  if (statSubj) statSubj.innerText = formatTime(subjSec);
  if (statAll) statAll.innerText = formatTime(allSec);
}

function updateTotalHeaderPureStudy() {
  const todayKey = getTodayDateKey();
  const todayLogs = state.logs[todayKey] || {};
  const allSec = Object.values(todayLogs).reduce((a, b) => a + b, 0);

  const headerEl = document.getElementById('headerTotalPureStudy');
  if (headerEl) headerEl.innerText = formatTime(allSec);
}

function playChime() {
  const audio = document.getElementById('timerChime');
  if (audio) audio.play().catch(() => {});
}

// ==========================================
// 6. Student Configurable Goal Graph (목표 그래프 설정)
// ==========================================

function openGoalSettingModal() {
  const modal = document.getElementById('goalSettingModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const goals = state.profile.customGoals || {
    dailyTargetHours: state.profile.dailyHours || 6.0,
    weekdayTargetHours: 5.5,
    weekendTargetHours: 8.0,
    useCustomDayGoals: true
  };

  const slider = document.getElementById('inputCustomDailyGoal');
  const sliderDisplay = document.getElementById('customDailyGoalDisplay');
  const weekdayInput = document.getElementById('inputWeekdayGoal');
  const weekendInput = document.getElementById('inputWeekendGoal');

  if (slider) slider.value = goals.dailyTargetHours;
  if (sliderDisplay) sliderDisplay.innerText = `${goals.dailyTargetHours}시간`;
  if (weekdayInput) weekdayInput.value = goals.weekdayTargetHours;
  if (weekendInput) weekendInput.value = goals.weekendTargetHours;
}

function closeGoalSettingModal() {
  const modal = document.getElementById('goalSettingModal');
  if (modal) modal.classList.add('hidden');
}

function updateGoalSliderDisplay(val) {
  const display = document.getElementById('customDailyGoalDisplay');
  if (display) display.innerText = `${val}시간`;
}

function handleGoalSettingSubmit(e) {
  e.preventDefault();

  const dailyGoal = parseFloat(document.getElementById('inputCustomDailyGoal').value) || 6.0;
  const weekdayGoal = parseFloat(document.getElementById('inputWeekdayGoal').value) || 5.5;
  const weekendGoal = parseFloat(document.getElementById('inputWeekendGoal').value) || 8.0;

  state.profile.customGoals = {
    dailyTargetHours: dailyGoal,
    weekdayTargetHours: weekdayGoal,
    weekendTargetHours: weekendGoal,
    useCustomDayGoals: true
  };

  state.profile.dailyHours = dailyGoal;
  saveProfile();
  updateProfileUI();
  closeGoalSettingModal();

  // Re-render chart immediately with new target line
  renderWeeklyChart();

  alert(`🎯 순공시간 목표치가 성공적으로 적용되었습니다!\n- 기본 목표: 하루 ${dailyGoal}시간\n- 평일: ${weekdayGoal}시간 / 주말: ${weekendGoal}시간\n\n주간 그래프에서 빨간색 목표 기준선을 확인해보세요.`);
}

// ==========================================
// 7. Weekly Analytics & Chart.js Visuals
// ==========================================

let weeklyBarChartInstance = null;
let subjectPieChartInstance = null;

function initCharts() {
  renderWeeklyChart();
  renderSubjectPieChart();
}

function getPast7Days() {
  const result = [];
  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    const dayOfWeekIdx = d.getDay();
    const isWeekend = dayOfWeekIdx === 0 || dayOfWeekIdx === 6;

    result.push({
      key: key,
      label: `${d.getMonth() + 1}/${d.getDate()} (${daysOfWeek[dayOfWeekIdx]})`,
      shortLabel: `${daysOfWeek[dayOfWeekIdx]}`,
      isToday: i === 0,
      isWeekend: isWeekend
    });
  }
  return result;
}

function renderWeeklyChart() {
  const ctx = document.getElementById('weeklyBarChart');
  if (!ctx) return;

  const past7Days = getPast7Days();
  const subjects = ['수학', '국어', '영어', '한국사', '과학', '사회', '기타'];

  // 1. 과목별 누적 막대 데이터 (Stacked Bars)
  const barDatasets = subjects.map(subj => {
    const theme = getSubjectTheme(subj);
    const data = past7Days.map(day => {
      const dayLog = state.logs[day.key] || {};
      const sec = dayLog[subj] || 0;
      return +(sec / 3600).toFixed(2);
    });

    return {
      type: 'bar',
      label: subj,
      data: data,
      backgroundColor: theme.hex,
      borderRadius: 4,
      stack: 'studyStack'
    };
  });

  // 2. 학생 설정 목표 순공시간 기준선 (Student Target Goal Line)
  const goals = state.profile.customGoals || {
    dailyTargetHours: 6.0,
    weekdayTargetHours: 5.5,
    weekendTargetHours: 8.0,
    useCustomDayGoals: true
  };

  const targetLineData = past7Days.map(day => {
    if (goals.useCustomDayGoals) {
      return day.isWeekend ? goals.weekendTargetHours : goals.weekdayTargetHours;
    }
    return goals.dailyTargetHours;
  });

  const targetLineDataset = {
    type: 'line',
    label: '🎯 학생 설정 목표시간',
    data: targetLineData,
    borderColor: '#ef4444', // Red-500
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 2.5,
    borderDash: [5, 4],
    pointBackgroundColor: '#ef4444',
    pointBorderColor: '#ffffff',
    pointRadius: 4,
    pointHoverRadius: 6,
    fill: false,
    tension: 0.2,
    order: 0 // Draw on top
  };

  const allDatasets = [targetLineDataset, ...barDatasets];
  const labels = past7Days.map(d => `${d.shortLabel} (${d.key.slice(5)})`);

  if (weeklyBarChartInstance) {
    weeklyBarChartInstance.destroy();
  }

  weeklyBarChartInstance = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: allDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 10,
            padding: 8,
            font: { family: 'Pretendard', size: 10, weight: '700' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.parsed.y || 0;
              const h = Math.floor(val);
              const m = Math.round((val - h) * 60);
              if (context.dataset.type === 'line') {
                return `🎯 목표 순공시간: ${val}시간 (${h}시간 ${m}분)`;
              }
              return `${context.dataset.label}: ${h}시간 ${m}분`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Pretendard', size: 10 } }
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: '시간 (h)',
            font: { family: 'Pretendard', size: 10 }
          },
          beginAtZero: true,
          grid: { color: '#f8fafc' },
          ticks: { font: { family: 'Pretendard', size: 10 } }
        }
      }
    }
  });

  updateWeeklyKpis(past7Days, targetLineData);
}

function renderSubjectPieChart() {
  const ctx = document.getElementById('subjectPieChart');
  if (!ctx) return;

  const past7Days = getPast7Days();
  const subjects = ['수학', '국어', '영어', '한국사', '과학', '사회', '기타'];
  const totals = {};
  subjects.forEach(s => totals[s] = 0);

  past7Days.forEach(day => {
    const dayLog = state.logs[day.key] || {};
    for (const s of subjects) {
      totals[s] += (dayLog[s] || 0);
    }
  });

  const dataValues = subjects.map(s => +(totals[s] / 3600).toFixed(1));
  const colors = subjects.map(s => getSubjectTheme(s).hex);

  if (subjectPieChartInstance) {
    subjectPieChartInstance.destroy();
  }

  subjectPieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: subjects,
      datasets: [{
        data: dataValues,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '66%'
    }
  });

  const legendEl = document.getElementById('subjectRatioLegend');
  if (legendEl) {
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    let legHtml = '';

    subjects.forEach((subj) => {
      const sec = totals[subj];
      const pct = grandTotal > 0 ? Math.round((sec / grandTotal) * 100) : 0;
      const theme = getSubjectTheme(subj);

      legHtml += `
        <div class="flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${theme.hex}"></span>
            <span class="font-medium text-slate-700">${subj}</span>
          </div>
          <div class="font-mono text-slate-500">
            <span class="font-bold text-slate-800">${(sec / 3600).toFixed(1)}시간</span> (${pct}%)
          </div>
        </div>
      `;
    });
    legendEl.innerHTML = legHtml;
  }
}

function updateWeeklyKpis(past7Days, targetLineData) {
  let weeklyTotalSec = 0;
  const subjectTotals = {};

  past7Days.forEach(day => {
    const dayLog = state.logs[day.key] || {};
    let daySec = 0;
    for (const [subj, sec] of Object.entries(dayLog)) {
      daySec += sec;
      subjectTotals[subj] = (subjectTotals[subj] || 0) + sec;
    }
    weeklyTotalSec += daySec;
  });

  const totalH = Math.floor(weeklyTotalSec / 3600);
  const totalM = Math.round((weeklyTotalSec % 3600) / 60);
  const avgSec = Math.round(weeklyTotalSec / 7);
  const avgH = Math.floor(avgSec / 3600);
  const avgM = Math.round((avgSec % 3600) / 60);

  // Calculate sum of student custom targets
  const totalGoalHours = targetLineData.reduce((a, b) => a + b, 0);
  const totalGoalSec = totalGoalHours * 3600;
  const goalPct = totalGoalSec > 0 ? Math.min(100, Math.round((weeklyTotalSec / totalGoalSec) * 100)) : 0;

  let topSubj = '수학';
  let topSubjSec = 0;
  for (const [s, sec] of Object.entries(subjectTotals)) {
    if (sec > topSubjSec) {
      topSubjSec = sec;
      topSubj = s;
    }
  }

  const totalEl = document.getElementById('weeklyTotalPureStudy');
  const avgEl = document.getElementById('weeklyDailyAverage');
  const goalPctEl = document.getElementById('weeklyGoalPercent');
  const topSubjBadge = document.getElementById('weeklyTopSubjectBadge');

  if (totalEl) totalEl.innerText = `${totalH}시간 ${totalM}분`;
  if (avgEl) avgEl.innerText = `${avgH}시간 ${avgM}분`;
  if (goalPctEl) goalPctEl.innerText = `${goalPct}%`;
  if (topSubjBadge) topSubjBadge.innerText = `최다 집중: ${topSubj} (${(topSubjSec / 3600).toFixed(1)}h)`;

  // Generate In-Depth AI Mentoring Report automatically
  renderWeeklyAiMentoringReport(past7Days, targetLineData, subjectTotals, weeklyTotalSec);
}

// ==========================================
// 7-1. AI 1:1 In-Depth Weekly Mentoring System
// ==========================================

async function generateWeeklyAiMentoring(isManual = false) {
  const container = document.getElementById('aiWeeklyMentoringContainer');
  if (!container) return;

  if (isManual) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-300 space-y-2">
        <div class="w-7 h-7 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mx-auto"></div>
        <p class="text-xs font-bold text-white">AI 학습 멘토가 지난 1주일간의 순공 데이터를 심층 분석 중입니다...</p>
        <p class="text-[10px] text-slate-400">목표 달성률, 과목별 밸런스, 요일별 학습 패턴을 종합 진단합니다.</p>
      </div>
    `;
    await new Promise(r => setTimeout(r, 650));
  }

  const past7Days = getPast7Days();
  const goals = state.profile.customGoals || {
    dailyTargetHours: 6.0,
    weekdayTargetHours: 5.5,
    weekendTargetHours: 8.0,
    useCustomDayGoals: true
  };

  const targetLineData = past7Days.map(day => {
    if (goals.useCustomDayGoals) {
      return day.isWeekend ? goals.weekendTargetHours : goals.weekdayTargetHours;
    }
    return goals.dailyTargetHours;
  });

  const subjectTotals = {};
  let weeklyTotalSec = 0;
  past7Days.forEach(day => {
    const dayLog = state.logs[day.key] || {};
    for (const [subj, sec] of Object.entries(dayLog)) {
      subjectTotals[subj] = (subjectTotals[subj] || 0) + sec;
      weeklyTotalSec += sec;
    }
  });

  renderWeeklyAiMentoringReport(past7Days, targetLineData, subjectTotals, weeklyTotalSec);

  if (isManual) {
    alert('✨ 1주일간의 학습 데이터를 반영한 AI 심층 멘토링 리포트가 갱신되었습니다!');
  }
}

function renderWeeklyAiMentoringReport(past7Days, targetLineData, subjectTotals, weeklyTotalSec) {
  const container = document.getElementById('aiWeeklyMentoringContainer');
  if (!container) return;

  const p = state.profile;
  const totalH = Math.floor(weeklyTotalSec / 3600);
  const totalM = Math.round((weeklyTotalSec % 3600) / 60);
  const avgHours = +(weeklyTotalSec / 3600 / 7).toFixed(1);

  // Day with max study time
  let bestDay = past7Days[0];
  let bestDaySec = 0;
  let belowGoalDays = [];
  let achievedDays = [];

  past7Days.forEach((day, idx) => {
    const dayLog = state.logs[day.key] || {};
    const dayTotalSec = Object.values(dayLog).reduce((a, b) => a + b, 0);
    const dayGoalSec = targetLineData[idx] * 3600;

    if (dayTotalSec > bestDaySec) {
      bestDaySec = dayTotalSec;
      bestDay = day;
    }

    if (dayTotalSec >= dayGoalSec && dayGoalSec > 0) {
      achievedDays.push(day.shortLabel);
    } else {
      belowGoalDays.push(day.shortLabel);
    }
  });

  const bestDayHours = (bestDaySec / 3600).toFixed(1);

  // Top Subject Analysis
  let sortedSubjs = Object.entries(subjectTotals).sort((a, b) => b[1] - a[1]);
  const topSubjName = sortedSubjs[0] ? sortedSubjs[0][0] : '수학';
  const topSubjSec = sortedSubjs[0] ? sortedSubjs[0][1] : 0;
  const topSubjPct = weeklyTotalSec > 0 ? Math.round((topSubjSec / weeklyTotalSec) * 100) : 0;

  // Weak Subject Analysis
  const weakSubj = p.weakSubject || '수학';
  const weakSubjSec = subjectTotals[weakSubj] || 0;
  const weakSubjHours = (weakSubjSec / 3600).toFixed(1);
  const weakSubjPct = weeklyTotalSec > 0 ? Math.round((weakSubjSec / weeklyTotalSec) * 100) : 0;

  // Total Goal calculation
  const totalGoalHours = targetLineData.reduce((a, b) => a + b, 0);
  const totalGoalSec = totalGoalHours * 3600;
  const goalAchieveRate = totalGoalSec > 0 ? Math.round((weeklyTotalSec / totalGoalSec) * 100) : 0;

  container.innerHTML = `
    <!-- 1. 잘한 점 & 성취 칭찬 -->
    <div class="p-3 bg-white/5 border border-emerald-500/20 rounded-2xl space-y-1">
      <div class="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
        <i data-lucide="award" class="w-3.5 h-3.5"></i>
        <span>🌟 이번 주 돋보인 성취 & 칭찬</span>
      </div>
      <p class="text-slate-300 text-[11px] leading-relaxed">
        ${p.name} 학생, 이번 주 가장 집중력이 높았던 날은 <b>${bestDay.shortLabel}요일 (${bestDayHours}시간)</b>이었습니다! 
        특히 <b>${topSubjName}</b> 과목에 총 <b>${(topSubjSec / 3600).toFixed(1)}시간 (${topSubjPct}%)</b>의 순공을 쏟아부으며 몰입감을 증명했습니다.
        ${achievedDays.length > 0 ? `목표를 달성한 [${achievedDays.join(', ')}]요일의 성공 패턴을 기억하세요!` : '시작이 반입니다. 꾸준함이 붙고 있습니다.'}
      </p>
    </div>

    <!-- 2. 데이터 심층 진단 -->
    <div class="p-3 bg-white/5 border border-amber-500/20 rounded-2xl space-y-1">
      <div class="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
        <i data-lucide="search" class="w-3.5 h-3.5"></i>
        <span>🔍 7일간 순공 패턴 정밀 진단</span>
      </div>
      <p class="text-slate-300 text-[11px] leading-relaxed">
        • <b>목표 달성률</b>: 학생 설정 주간 목표(${totalGoalHours.toFixed(1)}시간) 대비 <b>${goalAchieveRate}%</b>를 달성했습니다.<br>
        • <b>취약 과목 점검</b>: 보완 1순위로 지정한 <b>'${weakSubj}'</b>에 이번 주 <b>${weakSubjHours}시간 (${weakSubjPct}%)</b>을 투자했습니다. 
        ${weakSubjPct < 30 ? `취약 과목 비중이 다소 낮아(권장 35% 이상) 성적 반등을 위해 투입 시간 증대가 필요합니다.` : `취약 과목에 집중적으로 시간을 잘 할애하고 있습니다.`}
        ${belowGoalDays.length > 0 ? `<br>• <b>미달 요일</b>: [${belowGoalDays.join(', ')}]요일에는 계획보다 순공시간이 적었습니다.` : ''}
      </p>
    </div>

    <!-- 3. 다음 주 실천 전략 솔루션 -->
    <div class="p-3 bg-white/5 border border-indigo-400/20 rounded-2xl space-y-1">
      <div class="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px]">
        <i data-lucide="compass" class="w-3.5 h-3.5"></i>
        <span>🎯 다음 주 1주일 맞춤 처방전</span>
      </div>
      <ul class="text-slate-300 text-[11px] leading-relaxed space-y-0.5 list-disc list-inside">
        <li><b>취약 과목 골든 타임 배치</b>: '${weakSubj}'을 하루 중 집중력이 가장 높은 첫 순공 과목으로 배치하세요.</li>
        <li><b>자투리 30분 규칙</b>: 목표 미달 요일에는 거창한 계획보다 타이머를 켜고 30분만 먼저 앉는 루틴을 만드세요.</li>
        <li><b>과목 밸런스 유지</b>: 최다 공부 과목(${topSubjName}) 외에 영단어/국어 어휘 등 암기 과목을 취침 전 30분 고정하세요.</li>
      </ul>
    </div>

    <!-- 4. 멘토의 따뜻한 한마디 응원 -->
    <div class="p-3 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-white/10 rounded-2xl">
      <div class="flex items-center gap-1.5 text-violet-300 font-bold text-[11px] mb-1">
        <i data-lucide="heart" class="w-3.5 h-3.5 text-rose-400"></i>
        <span>💌 멘토의 따뜻한 한마디</span>
      </div>
      <p class="text-slate-200 text-[11px] leading-relaxed italic">
        "${p.name} 학생, 이번 주에 타이머를 켜고 정직하게 기록한 <b>${totalH}시간 ${totalM}분</b>의 순공시간은 절대 배신하지 않는 실력이 됩니다. 
        목표인 <b>'${p.target}'</b>에 점점 더 가까워지고 있으니 자신감을 갖고 다음 주도 힘차게 달려봅시다! 응원합니다!"
      </p>
    </div>
  `;

  lucide.createIcons();
}

function askAiAboutWeeklyProgress() {
  const p = state.profile;
  const prompt = `내 이번 주 1주일간 순공 기록을 바탕으로 다음 주 공부 계획과 취약 과목('${p.weakSubject}') 극복 방법을 더 자세히 상담해줘!`;
  
  switchTab('ai');
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = prompt;
    handleAiChatSubmit(new Event('submit'));
  }
}

function fillSampleWeeklyData() {
  const past7Days = getPast7Days();
  const sampleMap = [
    { '수학': 2.5 * 3600, '국어': 1.5 * 3600, '영어': 1.0 * 3600, '탐구': 1.2 * 3600 },
    { '수학': 3.0 * 3600, '국어': 1.2 * 3600, '영어': 1.5 * 3600, '탐구': 0.8 * 3600 },
    { '수학': 2.0 * 3600, '국어': 2.0 * 3600, '영어': 1.0 * 3600, '탐구': 1.0 * 3600 },
    { '수학': 3.5 * 3600, '국어': 1.0 * 3600, '영어': 1.2 * 3600, '탐구': 1.5 * 3600 },
    { '수학': 2.2 * 3600, '국어': 1.8 * 3600, '영어': 1.5 * 3600, '탐구': 1.0 * 3600 },
    { '수학': 4.0 * 3600, '국어': 2.0 * 3600, '영어': 2.0 * 3600, '탐구': 2.0 * 3600 },
    { '수학': 1.5 * 3600, '국어': 1.0 * 3600, '영어': 1.0 * 3600, '탐구': 0.5 * 3600 }
  ];

  past7Days.forEach((day, idx) => {
    if (day.isToday && state.logs[day.key]) {
      // keep
    } else {
      state.logs[day.key] = sampleMap[idx];
    }
  });

  saveLogs();
  renderWeeklyChart();
  renderSubjectPieChart();

  alert('📊 과목별 순공시간 예시 데이터가 주간 그래프에 채워졌습니다!\n설정하신 목표 기준선과 비교해보세요.');
}

// ==========================================
// 8. AI Study Mentor (Q&A)
// ==========================================

function sendQuickPrompt(promptText) {
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = promptText;
    handleAiChatSubmit(new Event('submit'));
  }
}

async function handleAiChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('aiChatInput');
  const userText = input.value.trim();
  if (!userText) return;

  input.value = '';
  appendChatMessage('user', userText);

  const typingId = appendTypingIndicator();

  try {
    let reply = '';
    if (state.profile.apiKey) {
      reply = await callGeminiApi(userText);
    } else {
      reply = await generateBuiltinAiResponse(userText);
    }

    removeTypingIndicator(typingId);
    appendChatMessage('bot', reply);
  } catch (err) {
    console.error(err);
    removeTypingIndicator(typingId);
    appendChatMessage('bot', '⚠️ 답변 생성 중 문제가 발생했습니다. 잠시 후 다시 질문해주세요.');
  }
}

function appendChatMessage(sender, text) {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;

  const isUser = sender === 'user';
  const div = document.createElement('div');
  div.className = `flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`;

  const avatar = isUser
    ? `<div class="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">${state.profile.name[0] || '나'}</div>`
    : `<div class="w-7 h-7 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="bot" class="w-3.5 h-3.5"></i></div>`;

  const bubbleClass = isUser ? 'chat-bubble-user' : 'chat-bubble-bot';

  const formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');

  div.innerHTML = `
    ${avatar}
    <div class="${bubbleClass} max-w-[85%]">
      ${formattedText}
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function appendTypingIndicator() {
  const container = document.getElementById('aiChatMessages');
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'flex items-start gap-2';
  div.innerHTML = `
    <div class="w-7 h-7 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5">
      <i data-lucide="bot" class="w-3.5 h-3.5"></i>
    </div>
    <div class="bg-slate-100 rounded-2xl rounded-tl-sm p-3 flex items-center gap-1.5 text-xs text-slate-500">
      <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.2s"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.4s"></span>
      <span class="text-[10px] ml-1">AI 멘토 작성 중...</span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

async function generateBuiltinAiResponse(prompt) {
  await new Promise(r => setTimeout(r, 600));

  const p = state.profile;
  const q = prompt.toLowerCase();

  if (q.includes('대학') || q.includes('어디가') || q.includes('합격') || q.includes('수시') || q.includes('정시') || q.includes('입시')) {
    const studentAvg = calculateStudentAvgGrade();
    return `**🏛️ ${p.name} 학생을 위한 대학어디가(Adiga) 기반 입시 합격 전략**\n\n` +
      `현재 학생의 6과목 환산 평균 성적은 **${studentAvg}등급**입니다.\n\n` +
      `1. **수시 vs 정시 유불리 진단**:\n` +
      `   - 내신 등급이 모의고사보다 안정적이라면 **'학생부위주(교과/종합)'** 전형을 주력으로 4~5장 지원하고,\n` +
      `   - 정시 수능 경쟁력이 높다면 상위 1~2개 대학을 **소신/상향 도전**으로 구성하는 것이 정석입니다.\n\n` +
      `2. **취약 과목('${p.weakSubject}') 등급 상승 효과**:\n` +
      `   - 주요 대학은 국·수·탐 표준점수/백분위 비중이 매우 큽니다. 취약 과목('${p.weakSubject}')을 1등급만 상승시켜도 대학 라인이 건동홍숙에서 서성한 라인으로 수직 도약할 수 있습니다.\n\n` +
      `3. **추천 액션**:\n` +
      `   - 하단 **[대학추천]** 탭에서 안정/적정/소신 대학 리스트를 확인하시고, 원하는 대학을 **[내 목표로 설정]**해보세요! 플래너가 해당 목표에 맞추어 재구성됩니다.`;
  }

  if (q.includes('순공') || q.includes('일주일') || q.includes('1주일') || q.includes('상담') || q.includes('계획') || q.includes('피드백')) {
    const past7 = getPast7Days();
    let totalSec = 0;
    const subTotals = {};
    past7.forEach(d => {
      const dLog = state.logs[d.key] || {};
      for (const [s, sec] of Object.entries(dLog)) {
        subTotals[s] = (subTotals[s] || 0) + sec;
        totalSec += sec;
      }
    });
    const totalH = Math.floor(totalSec / 3600);
    const totalM = Math.round((totalSec % 3600) / 60);
    const weakSec = subTotals[p.weakSubject] || 0;
    const weakH = (weakSec / 3600).toFixed(1);

    return `**📊 ${p.name} 학생의 1주일 순공 데이터 기반 1:1 심층 코칭**\n\n` +
      `지난 7일간 기록된 총 순공시간은 **${totalH}시간 ${totalM}분**입니다!\n\n` +
      `1. **취약 과목('${p.weakSubject}') 분석**: 일주일간 ${weakH}시간을 투자하셨습니다. 성적 상승의 열쇠는 취약 과목에 있으므로, 다음 주는 하루 순공의 40% 이상을 ${p.weakSubject}에 우선 배정하는 것을 강력히 추천합니다.\n` +
      `2. **요일별 루틴 점검**: 공부 시간이 들쑥날쑥하기보다는 주중에도 최소 목표선을 꾸준히 넘기는 습관이 수능/내신 실전 집중력을 키워줍니다.\n` +
      `3. **추천 액션**: 주간 성취 그래프에서 [목표 순공 설정]을 다시 점검하시고, 내일 아침 첫 60분을 ${p.weakSubject} 개념/오답 정리에 투자해보세요!\n\n` +
      `💡 더 구체적으로 어떤 과목이나 단원이 고민되시나요? 언제든 편하게 말씀해주세요!`;
  }

  if (q.includes('수학') || q.includes('시간') || q.includes('킬러')) {
    return `**📐 ${p.name} 학생을 위한 수학 시간단축 & 킬러 공략법**\n\n` +
      `1. **조건 기호화**: 긴 지문에서 핵심 조건을 즉시 좌표평면이나 수식으로 도식화하세요.\n` +
      `2. **3분 룰**: 안 풀리는 문제는 3분 이상 붙잡지 말고 별표 후 넘어간 뒤, 2회독 때 다시 보세요.\n` +
      `3. **발상 노트**: 해설지를 베끼지 말고 *"내가 어떤 조건을 놓쳐서 접근하지 못했는가?"*를 한 줄로 적는 습관이 1등급을 만듭니다.`;
  }

  if (q.includes('영단어') || q.includes('암기') || q.includes('망각곡선')) {
    return `**📖 에빙하우스 망각곡선 활용 영단어 암기법**\n\n` +
      `1. **1일 3회 짧게 보기 (10분씩)**: 아침 훑기 → 점심 인출 테스트 → 자기 전 틀린 단어 복습.\n` +
      `2. **복습 주기**: 1일차 암기 후 **3일차, 7일차, 14일차**에 복습하면 장기 기억으로 전이됩니다.\n` +
      `3. 단어 단독이 아닌 **연어(Collocation)** 덩어리로 외우면 독해 속도가 2배 빨라집니다.`;
  }

  if (q.includes('집중') || q.includes('멘탈') || q.includes('잡생각') || q.includes('슬럼프')) {
    return `**🧠 수험생 집중력 & 멘탈 케어 팁**\n\n` +
      `1. **브레인 덤프**: 공부 시작 전 머릿속 잡생각과 걱정을 빈 종이에 모조리 적고 덮어두세요.\n` +
      `2. **시야에서 스마트폰 치우기**: 휴대폰을 시야 밖(서랍/다른 방)에 두는 것만으로 작업 기억력이 20% 향상됩니다.\n` +
      `3. 슬럼프는 성장이 멈춘 게 아니라 뇌가 지식을 정리하는 시간입니다. 조급해하지 말고 순공 타이머를 켜고 25분만 몰입해보세요!`;
  }

  if (q.includes('비문학') || q.includes('국어') || q.includes('독해')) {
    return `**📝 국어 비문학/독서 구조도 독해법**\n\n` +
      `1. **1문단 화제 잡기**: 글 전체가 무엇을 질문하고 있는지 네모 박스로 체크하세요.\n` +
      `2. **비례 관계 메모**: 과학/경제 지문의 'A가 증가할 때 B는 감소'는 여백에 [A↑ → B↓]로 적어두면 선지 판단이 빨라집니다.\n` +
      `3. 지문 속 정답 근거 문장에 형광펜으로 밑줄 긋는 습관을 들이세요.`;
  }

  return `**💡 AI 학습 멘토의 조언입니다**\n\n` +
    `질문해주신 **"${prompt}"**에 대해 안내해 드립니다.\n\n` +
    `현재 ${p.grade} 학년에서 **"${p.target}"** 목표를 달성하기 위해서는 취약 과목(${p.weakSubject})에 순공시간을 꾸준히 투자하는 것이 핵심입니다.\n\n` +
    `오늘 플래너의 과목을 순공 타이머와 함께 하나씩 완료해보세요. 더 구체적인 질문이 있다면 언제든 물어보세요!`;
}

async function callGeminiApi(prompt) {
  const apiKey = state.profile.apiKey;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Calculate past 7 days stats for AI Context
  const past7 = getPast7Days();
  let weeklySec = 0;
  const subStats = {};
  past7.forEach(d => {
    const log = state.logs[d.key] || {};
    for (const [s, sec] of Object.entries(log)) {
      subStats[s] = (subStats[s] || 0) + sec;
      weeklySec += sec;
    }
  });
  const weeklyH = (weeklySec / 3600).toFixed(1);
  const subSummary = Object.entries(subStats).map(([s, sec]) => `${s}: ${(sec/3600).toFixed(1)}시간`).join(', ');

  const systemContext = `당신은 학생 전담 수험/학습 전문 AI 멘토입니다.
학생 이름: ${state.profile.name} (${state.profile.grade})
성취 목표: ${state.profile.target}
취약 과목: ${state.profile.weakSubject}
하루 설정 순공 목표: ${state.profile.dailyHours}시간
[최근 1주일간 실제 학습 순공 데이터]: 총 ${weeklyH}시간 (${subSummary || '기록 시작 중'})

학생의 1주일간 공부 데이터를 면밀히 관찰하고, 칭찬할 점, 개선할 점, 다음 주 실천 전략을 친절하고 열정적인 어조의 마크다운 형식으로 알기 쉽게 조언하세요.`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: systemContext + '\n\n학생 질문: ' + prompt }]
      }
    ]
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('API 호출 실패');
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 불러오지 못했습니다.';
}

function openApiKeyModal() {
  document.getElementById('apiKeyModal').classList.remove('hidden');
}
function closeApiKeyModal() {
  document.getElementById('apiKeyModal').classList.add('hidden');
}
function saveApiKey() {
  const key = document.getElementById('inputGeminiApiKey').value.trim();
  state.profile.apiKey = key;
  saveProfile();
  closeApiKeyModal();

  const label = document.getElementById('apiKeyBtnLabel');
  if (label) label.innerText = key ? 'Gemini 연동됨 ✓' : 'Gemini 연동';
  alert(key ? 'Gemini API 키가 연동되었습니다!' : 'API 키가 해제되었습니다.');
}
function clearApiKey() {
  state.profile.apiKey = '';
  document.getElementById('inputGeminiApiKey').value = '';
  saveProfile();
  closeApiKeyModal();
  const label = document.getElementById('apiKeyBtnLabel');
  if (label) label.innerText = 'Gemini 연동';
  alert('API 키가 제거되었습니다.');
}

// ==========================================
// 9. Navigation & Tab Switching
// ==========================================

function switchTab(tabId) {
  state.activeTab = tabId;

  const tabs = ['planner', 'timer', 'stats', 'university', 'ai'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (el) {
      if (t === tabId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    if (navBtn) {
      if (t === tabId) {
        navBtn.classList.add('active');
      } else {
        navBtn.classList.remove('active');
      }
    }
  });

  if (tabId === 'stats') {
    renderWeeklyChart();
    renderSubjectPieChart();
  } else if (tabId === 'university') {
    renderUniversityRecommendations();
  }
}

// ==========================================
// 10. Profile Onboarding Modal Handling
// ==========================================

function openProfileModal(isInitial = false) {
  const modal = document.getElementById('profileModal');
  const title = document.getElementById('profileModalTitle');
  if (modal) modal.classList.remove('hidden');

  if (title) {
    title.innerText = isInitial ? '환영합니다! 학생 맞춤 설정 & 목표' : '학생 목표 & 성적 수정';
  }

  const p = state.profile;
  document.getElementById('inputStudentName').value = p.name;
  document.getElementById('inputStudentGrade').value = p.grade;
  document.getElementById('inputStudentTarget').value = p.target;

  const grades = p.grades || {};
  document.getElementById('gradeKorean').value = grades.korean || '3';
  document.getElementById('gradeMath').value = grades.math || '4';
  document.getElementById('gradeEnglish').value = grades.english || '2';
  document.getElementById('gradeHistory').value = grades.history || '2';
  document.getElementById('gradeScience').value = grades.science || '3';
  document.getElementById('gradeSociety').value = grades.society || '3';
  document.getElementById('inputWeakSubject').value = p.weakSubject || '수학';
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('hidden');
}

function handleProfileSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('inputStudentName').value.trim();
  const grade = document.getElementById('inputStudentGrade').value;
  const target = document.getElementById('inputStudentTarget').value.trim();

  const grades = {
    korean: document.getElementById('gradeKorean').value,
    math: document.getElementById('gradeMath').value,
    english: document.getElementById('gradeEnglish').value,
    history: document.getElementById('gradeHistory').value,
    science: document.getElementById('gradeScience').value,
    society: document.getElementById('gradeSociety').value
  };

  const weakSubject = document.getElementById('inputWeakSubject').value;

  state.profile = {
    ...state.profile,
    name,
    grade,
    target,
    grades,
    weakSubject,
    isSetup: true
  };

  saveProfile();
  updateProfileUI();
  closeProfileModal();
  generateAiPlan(false);
  renderUniversityRecommendations();

  alert(`환영합니다, ${name} 학생! 성적과 목표에 맞춤화된 AI 플래너와 대학 추천 리스트가 업데이트되었습니다.`);
}

// ==========================================
// 11. Persistence (LocalStorage)
// ==========================================

function saveProfile() {
  localStorage.setItem('studium_profile', JSON.stringify(state.profile));
}

function saveTasks() {
  localStorage.setItem('studium_tasks', JSON.stringify(state.tasks));
}

function saveLogs() {
  localStorage.setItem('studium_logs', JSON.stringify(state.logs));
}

// ==========================================
// 12. 대학어디가(Adiga) 스타일 성적 맞춤 수시·정시 대학 추천 엔진
// ==========================================

const UNIVERSITY_DATABASE = [
  // 1등급 극상위권
  {
    name: '서울대학교',
    region: '서울 관악',
    symbol: 'SNU',
    colorHex: '#0f0f70',
    major: '컴퓨터공학부',
    track: 'engineering',
    susi: {
      type: '학생부종합 (지균·일반)',
      cutGrade: 1.15,
      minCriteria: '3개 합 7등급 이내',
      competition: '4.8 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '98.5%',
      cutGrade: 1.10,
      weights: '국 33.3% / 수 40.0% / 탐 26.7%',
      competition: '3.4 : 1'
    },
    info: '국내 최고 연구역량, 수시 심층면접 / 정시 과탐 필수 반영'
  },
  {
    name: '연세대학교',
    region: '서울 신촌',
    symbol: '연세',
    colorHex: '#00205b',
    major: '인공지능학과',
    track: 'engineering',
    susi: {
      type: '학생부추천형 (교과·학종)',
      cutGrade: 1.30,
      minCriteria: '수능최저 없음 (면접 40%)',
      competition: '6.2 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '97.2%',
      cutGrade: 1.25,
      weights: '국 22.2% / 수 44.4% / 탐 33.3%',
      competition: '4.9 : 1'
    },
    info: 'AI 융합 첨단 학부, 정시 수학 비중 44.4%로 압도적'
  },
  {
    name: '고려대학교',
    region: '서울 안암',
    symbol: '고려',
    colorHex: '#860010',
    major: '경영대학',
    track: 'social',
    susi: {
      type: '학생부교과(학교추천) / 학업우수',
      cutGrade: 1.35,
      minCriteria: '4개 합 8등급 이내 (높은 최저)',
      competition: '5.1 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '96.8%',
      cutGrade: 1.30,
      weights: '국 35.7% / 수 35.7% / 탐 28.6%',
      competition: '3.8 : 1'
    },
    info: '국내 최상위 명문 경영, 수시 높은 수능최저 충족이 당락 좌우'
  },
  {
    name: '가톨릭대학교(성의)',
    region: '서울 서초',
    symbol: 'CMC',
    colorHex: '#004b87',
    major: '의예과',
    track: 'medical',
    susi: {
      type: '학생부종합 (가톨릭지도자추천)',
      cutGrade: 1.08,
      minCriteria: '3개 합 4등급 이내',
      competition: '18.4 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '99.2%',
      cutGrade: 1.05,
      weights: '국 30% / 수 40% / 탐 30%',
      competition: '4.2 : 1'
    },
    info: '국내 메이저 빅5 서울성모병원 연계, 최상위권 의대'
  },

  // 1등급 중반 ~ 2등급 초반
  {
    name: '성균관대학교',
    region: '경기 수원',
    symbol: '성균',
    colorHex: '#003323',
    major: '반도체시스템공학과',
    track: 'engineering',
    susi: {
      type: '학생부종합 (학과모집)',
      cutGrade: 1.60,
      minCriteria: '수능최저 없음 (서류 100%)',
      competition: '7.5 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '95.5%',
      cutGrade: 1.55,
      weights: '국 25% / 수 40% / 탐 35%',
      competition: '3.9 : 1'
    },
    info: '삼성전자 계약학과, 장학금 전액 및 졸업 후 입사 연계'
  },
  {
    name: '서강대학교',
    region: '서울 마포',
    symbol: '서강',
    colorHex: '#b11116',
    major: '경제학부',
    track: 'social',
    susi: {
      type: '학생부교과(지역균형) / 일반',
      cutGrade: 1.80,
      minCriteria: '3개 영역 각 3등급 이내',
      competition: '6.8 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '94.2%',
      cutGrade: 1.75,
      weights: '국 36.7% / 수 43.3% / 탐 20%',
      competition: '4.6 : 1'
    },
    info: '자유로운 다전공 제도, 정시 수학 가중치(43.3%) 최상위'
  },
  {
    name: '한양대학교',
    region: '서울 성동',
    symbol: '한양',
    colorHex: '#003b71',
    major: '미래자동차공학과',
    track: 'engineering',
    susi: {
      type: '학생부종합 (서류형)',
      cutGrade: 1.75,
      minCriteria: '수능최저 없음',
      competition: '8.1 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '94.8%',
      cutGrade: 1.70,
      weights: '국 20% / 수 35% / 탐 35% (과탐 3% 가산)',
      competition: '4.8 : 1'
    },
    info: '현대차 산학협력, 수시 무최저 학종 명문 / 정시 과탐 가산점'
  },
  {
    name: '중앙대학교',
    region: '서울 동작',
    symbol: '중앙',
    colorHex: '#004c97',
    major: '소프트웨어학부',
    track: 'engineering',
    susi: {
      type: '학생부교과(지역균형) / CAU융합인재',
      cutGrade: 2.05,
      minCriteria: '3개 합 7등급 이내',
      competition: '7.2 : 1'
    },
    jeongsi: {
      group: '다군',
      cutPercentile: '93.5%',
      cutGrade: 1.95,
      weights: '국 25% / 수 40% / 탐 35%',
      competition: '18.5 : 1 (다군 강세)'
    },
    info: '정시 다군 최상위 인기 학과로 충원율이 매우 높음'
  },
  {
    name: '경희대학교',
    region: '서울 동대문',
    symbol: '경희',
    colorHex: '#7f1416',
    major: '경영학부',
    track: 'social',
    susi: {
      type: '학생부종합 (네오르네상스)',
      cutGrade: 2.15,
      minCriteria: '수능최저 없음 (면접 30%)',
      competition: '6.5 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '92.0%',
      cutGrade: 2.10,
      weights: '국 35% / 수 25% / 탐 25%',
      competition: '4.2 : 1'
    },
    info: '인문계 수시 학종 서류 탄탄한 학생 유리, 정시 국어 비중 높음'
  },
  {
    name: '서울시립대학교',
    region: '서울 동대문',
    symbol: '시립',
    colorHex: '#1b3b88',
    major: '도시행정학과',
    track: 'social',
    susi: {
      type: '학생부교과(지역균형) / 종합',
      cutGrade: 2.10,
      minCriteria: '3개 합 7등급 이내',
      competition: '5.9 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '92.5%',
      cutGrade: 2.00,
      weights: '국 30% / 수 30% / 탐 30%',
      competition: '3.9 : 1'
    },
    info: '국내 유일 도시과학 특성화, 행정고시 강세 / 저렴한 반값 등록금'
  },
  {
    name: '이화여자대학교',
    region: '서울 서대문',
    symbol: '이화',
    colorHex: '#004b32',
    major: '국어교육과',
    track: 'humanities',
    susi: {
      type: '학생부종합 (미래인재)',
      cutGrade: 2.20,
      minCriteria: '3개 합 6등급 이내',
      competition: '6.0 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '91.8%',
      cutGrade: 2.15,
      weights: '국 30% / 수 30% / 탐 25%',
      competition: '3.7 : 1'
    },
    info: '사범대 명문, 수시 수능최저 충족 시 실질 경쟁률 급감'
  },

  // 2등급 중반 ~ 3등급 초반
  {
    name: '건국대학교',
    region: '서울 광진',
    symbol: '건국',
    colorHex: '#005a36',
    major: '스마트운행체공학과',
    track: 'engineering',
    susi: {
      type: '학생부종합 (KU자기추천)',
      cutGrade: 2.40,
      minCriteria: '수능최저 없음',
      competition: '9.4 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '90.2%',
      cutGrade: 2.30,
      weights: '국 20% / 수 35% / 탐 35%',
      competition: '5.2 : 1'
    },
    info: '항공우주 및 자율주행 모빌리티 특화, 수시 면접 역전 가능'
  },
  {
    name: '동국대학교',
    region: '서울 중구',
    symbol: '동국',
    colorHex: '#d85800',
    major: '경찰행정학부',
    track: 'social',
    susi: {
      type: '학생부교과(학교장추천) / Do Dream',
      cutGrade: 2.35,
      minCriteria: '2개 합 4등급 이내',
      competition: '11.2 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '91.0%',
      cutGrade: 2.25,
      weights: '국 30% / 수 25% / 탐 25%',
      competition: '4.8 : 1'
    },
    info: '경찰 간부 및 로스쿨 전통의 산실, 내신과 수능 모두 탄탄해야 함'
  },
  {
    name: '홍익대학교',
    region: '서울 마포',
    symbol: '홍익',
    colorHex: '#003366',
    major: '기계·시스템디자인공학',
    track: 'engineering',
    susi: {
      type: '학생부교과(학교장추천) / 우수자',
      cutGrade: 2.65,
      minCriteria: '3개 합 8등급 이내',
      competition: '7.8 : 1'
    },
    jeongsi: {
      group: '다군',
      cutPercentile: '88.5%',
      cutGrade: 2.55,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '9.2 : 1'
    },
    info: '정시 다군 인기 대학, 공학과 디자인 융합 커리큘럼'
  },
  {
    name: '숙명여자대학교',
    region: '서울 용산',
    symbol: '숙명',
    colorHex: '#002053',
    major: '미디어학부',
    track: 'social',
    susi: {
      type: '학생부종합 (숙명인재)',
      cutGrade: 2.70,
      minCriteria: '수능최저 없음',
      competition: '8.4 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '87.8%',
      cutGrade: 2.65,
      weights: '국 35% / 수 25% / 탐 20%',
      competition: '4.1 : 1'
    },
    info: '언론·방송 및 영상 미디어 특화, 정시 국어·영어 반영 우수'
  },
  {
    name: '국민대학교',
    region: '서울 성북',
    symbol: '국민',
    colorHex: '#002855',
    major: '자동차IT융합학과',
    track: 'engineering',
    susi: {
      type: '학생부종합 (국민프런티어)',
      cutGrade: 2.80,
      minCriteria: '수능최저 없음',
      competition: '7.5 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '87.2%',
      cutGrade: 2.75,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '4.4 : 1'
    },
    info: '자동차공학 국내 최고 수준 인지도, 대기업 취업률 우수'
  },
  {
    name: '숭실대학교',
    region: '서울 동작',
    symbol: '숭실',
    colorHex: '#004785',
    major: '컴퓨터학부',
    track: 'engineering',
    susi: {
      type: '학생부종합 (SSU미래인재)',
      cutGrade: 2.75,
      minCriteria: '수능최저 없음',
      competition: '8.9 : 1'
    },
    jeongsi: {
      group: '다군',
      cutPercentile: '88.0%',
      cutGrade: 2.60,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '6.8 : 1'
    },
    info: '대한민국 최초 컴퓨터학과, 소프트웨어 실무 개발 역량 강세'
  },
  {
    name: '세종대학교',
    region: '서울 광진',
    symbol: '세종',
    colorHex: '#a71930',
    major: '인공지능데이터사이언스학과',
    track: 'engineering',
    susi: {
      type: '학생부교과(지역균형) / 창의인재',
      cutGrade: 2.95,
      minCriteria: '2개 합 6등급 이내',
      competition: '8.1 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '86.5%',
      cutGrade: 2.85,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '5.4 : 1'
    },
    info: 'AI 및 빅데이터 첨단 학과 신설, 연구 인프라 집중 투자'
  },
  {
    name: '부산대학교',
    region: '부산 금정',
    symbol: '부산',
    colorHex: '#003876',
    major: '기계공학부',
    track: 'engineering',
    susi: {
      type: '학생부교과(지역인재·일반)',
      cutGrade: 2.85,
      minCriteria: '2개 합 5등급 이내',
      competition: '6.4 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '86.0%',
      cutGrade: 2.80,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '3.6 : 1'
    },
    info: '동남권 제1 거점국립대, 공기업 및 대기업 지역할당제 혜택'
  },
  {
    name: '경북대학교',
    region: '대구 북구',
    symbol: '경북',
    colorHex: '#d2232a',
    major: '전자공학부',
    track: 'engineering',
    susi: {
      type: '학생부교과 / 일반학생',
      cutGrade: 2.70,
      minCriteria: '2개 합 5등급 이내',
      competition: '7.1 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '87.5%',
      cutGrade: 2.65,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '3.9 : 1'
    },
    info: '삼성전자 및 SK하이닉스 최다 배출 거점 국립대 전자 명문'
  },

  // 3등급 중반 ~ 4등급 초반
  {
    name: '광운대학교',
    region: '서울 노원',
    symbol: '광운',
    colorHex: '#800000',
    major: '전자융합공학과',
    track: 'engineering',
    susi: {
      type: '학생부종합 (광운참빛인재)',
      cutGrade: 3.20,
      minCriteria: '수능최저 없음',
      competition: '7.4 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '84.0%',
      cutGrade: 3.10,
      weights: '국 20% / 수 35% / 탐 30%',
      competition: '5.1 : 1'
    },
    info: '전자·IT 공학 전통 강호, 반도체 및 무선통신 특성화'
  },
  {
    name: '가천대학교',
    region: '경기 성남',
    symbol: '가천',
    colorHex: '#003865',
    major: '간호학과',
    track: 'medical',
    susi: {
      type: '학생부교과(지역균형) / 가천바람개비',
      cutGrade: 3.10,
      minCriteria: '2개 합 6등급 이내',
      competition: '14.2 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '85.5%',
      cutGrade: 2.95,
      weights: '우수 4과목 순차 반영 (35-25-25-15)',
      competition: '6.9 : 1'
    },
    info: '길병원 연계 종합의료 실습, 수도권 지하철 직결 편리한 통학'
  },
  {
    name: '인천대학교',
    region: '인천 연수',
    symbol: '인천',
    colorHex: '#003087',
    major: '동북아통상학부',
    track: 'social',
    susi: {
      type: '학생부교과 / 자기추천',
      cutGrade: 3.30,
      minCriteria: '2개 합 6등급 이내',
      competition: '7.8 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '83.2%',
      cutGrade: 3.20,
      weights: '국 30% / 수 30% / 탐 20%',
      competition: '4.6 : 1'
    },
    info: '송도 신도시 국립대학, 전액 장학금 및 해외 교환학생 지원'
  },
  {
    name: '충남대학교',
    region: '대전 유성',
    symbol: '충남',
    colorHex: '#003876',
    major: '신소재공학과',
    track: 'engineering',
    susi: {
      type: '학생부교과 / PRISM인재',
      cutGrade: 3.35,
      minCriteria: '수학 포함 2합 7등급',
      competition: '5.8 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '82.0%',
      cutGrade: 3.30,
      weights: '국 25% / 수 35% / 탐 25%',
      competition: '4.3 : 1'
    },
    info: '대덕연구단지 정부출연연구기관 인턴십 및 공기업 채용'
  },
  {
    name: '명지대학교',
    region: '서울/경기',
    symbol: '명지',
    colorHex: '#002855',
    major: '경영학과',
    track: 'social',
    susi: {
      type: '학생부교과 / 명지인재',
      cutGrade: 3.40,
      minCriteria: '수능최저 없음',
      competition: '6.8 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '81.5%',
      cutGrade: 3.35,
      weights: '국 30% / 수 30% / 탐 20%',
      competition: '4.7 : 1'
    },
    info: '실무형 경영학 및 자격증 특강 연계, 수시 무최저 전형'
  },

  // 4등급 ~ 5등급대
  {
    name: '한성대학교',
    region: '서울 성북',
    symbol: '한성',
    colorHex: '#003087',
    major: 'IT공과대학 (컴퓨터·기계)',
    track: 'engineering',
    susi: {
      type: '학생부교과 / 한성인재',
      cutGrade: 4.10,
      minCriteria: '수능최저 없음',
      competition: '8.5 : 1'
    },
    jeongsi: {
      group: '다군',
      cutPercentile: '76.0%',
      cutGrade: 4.00,
      weights: '우수 3영역 선택 반영',
      competition: '6.2 : 1'
    },
    info: '인서울 4호선 역세권, 입학 후 전공을 자유롭게 선택하는 트랙제'
  },
  {
    name: '서경대학교',
    region: '서울 성북',
    symbol: '서경',
    colorHex: '#004098',
    major: '광고홍보콘텐츠학과',
    track: 'social',
    susi: {
      type: '학생부교과 / 일반학생',
      cutGrade: 4.25,
      minCriteria: '수능최저 없음',
      competition: '7.8 : 1'
    },
    jeongsi: {
      group: '다군',
      cutPercentile: '74.5%',
      cutGrade: 4.15,
      weights: '국 35% / 영 30% / 탐 20%',
      competition: '5.9 : 1'
    },
    info: '실무 크리에이터 및 광고 영상 제작 프로젝트 중심 교육'
  },
  {
    name: '삼육대학교',
    region: '서울 노원',
    symbol: '삼육',
    colorHex: '#002053',
    major: '인공지능융합학부',
    track: 'engineering',
    susi: {
      type: '학생부교과 / 세움인재',
      cutGrade: 4.30,
      minCriteria: '수능최저 없음',
      competition: '7.2 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '74.0%',
      cutGrade: 4.20,
      weights: '우수 3과목 반영 (40-30-20)',
      competition: '6.1 : 1'
    },
    info: '서울 노원구 위치, 취약 영역 제외 우수 과목 반영으로 역전 가능'
  },
  {
    name: '강원대학교',
    region: '강원 춘천',
    symbol: '강원',
    colorHex: '#003876',
    major: '전자공학과',
    track: 'engineering',
    susi: {
      type: '학생부교과 / 미래인재',
      cutGrade: 4.20,
      minCriteria: '수능최저 없음',
      competition: '5.2 : 1'
    },
    jeongsi: {
      group: '가군',
      cutPercentile: '75.0%',
      cutGrade: 4.10,
      weights: '국 20% / 수 35% / 탐 25%',
      competition: '4.1 : 1'
    },
    info: '국립 거점대, 저렴한 등록금과 기숙사 / IT 혁신융합대학'
  },
  {
    name: '수원대학교',
    region: '경기 화성',
    symbol: '수원',
    colorHex: '#003366',
    major: '데이터과학부',
    track: 'engineering',
    susi: {
      type: '학생부교과 / 미래혁신',
      cutGrade: 4.60,
      minCriteria: '수능최저 없음',
      competition: '6.4 : 1'
    },
    jeongsi: {
      group: '나군',
      cutPercentile: '70.5%',
      cutGrade: 4.50,
      weights: '우수 3개 영역 반영',
      competition: '5.2 : 1'
    },
    info: '수도권 통학권, 빅데이터 및 인공지능 실습 중심'
  }
];

// University Filters
let univFilter = {
  admType: 'all', // 'all' (수시·정시 비교) | 'susi' (수시 위주) | 'jeongsi' (정시 위주)
  prob: 'all',    // 'all' | 'safe' | 'fit' | 'reach'
  major: 'all'    // 'all' | 'engineering' | 'natural' | 'humanities' | 'social' | 'medical'
};

// Calculate student's weighted grade
function calculateStudentAvgGrade() {
  const g = state.profile.grades || {};
  const k = parseFloat(g.korean) || 3.0;
  const m = parseFloat(g.math) || 3.5;
  const e = parseFloat(g.english) || 2.5;
  const h = parseFloat(g.history) || 3.0;
  const sci = parseFloat(g.science) || 3.0;
  const soc = parseFloat(g.society) || 3.0;

  const totalWeight = 1.0 + 1.0 + 1.0 + 0.7 + 0.7 + 0.7;
  const weightedSum = (k * 1.0) + (m * 1.0) + (e * 1.0) + (h * 0.7) + (sci * 0.7) + (soc * 0.7);
  return +(weightedSum / totalWeight).toFixed(2);
}

// Admission Type Selector Trigger
function setAdmissionType(type) {
  univFilter.admType = type;
  
  const hintEl = document.getElementById('admissionTypeHint');
  const ids = ['all', 'susi', 'jeongsi'];
  
  ids.forEach(id => {
    const btn = document.getElementById(`admTypeBtn-${id}`);
    if (btn) {
      if (id === type) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  if (hintEl) {
    if (type === 'susi') hintEl.innerText = '📋 수시(내신·학종 6장) 기준 추천';
    else if (type === 'jeongsi') hintEl.innerText = '🎯 정시(수능위주 가·나·다군) 기준 추천';
    else hintEl.innerText = '⚖️ 수시 vs 정시 나란히 비교 중';
  }

  renderUniversityRecommendations();
}

// Filter triggers
function filterUnivProbability(prob) {
  univFilter.prob = prob;
  ['all', 'safe', 'fit', 'reach'].forEach(id => {
    const btn = document.getElementById(`probBtn-${id}`);
    if (btn) {
      if (id === prob) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  renderUniversityRecommendations();
}

function filterUnivMajor(major) {
  univFilter.major = major;
  ['all', 'engineering', 'natural', 'humanities', 'social', 'medical'].forEach(id => {
    const btn = document.getElementById(`majorBtn-${id}`);
    if (btn) {
      if (id === major) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  renderUniversityRecommendations();
}

// Render University Recommendations (with 수시 vs 정시 breakdown)
function renderUniversityRecommendations() {
  const container = document.getElementById('univListContainer');
  const nameEl = document.getElementById('univStudentName');
  const avgBadge = document.getElementById('univAvgGradeBadge');
  const targetEl = document.getElementById('univCurrentTarget');
  const simAdvice = document.getElementById('univSimulatorAdvice');

  const p = state.profile;
  const studentAvg = calculateStudentAvgGrade();

  if (nameEl) nameEl.innerText = p.name;
  if (avgBadge) avgBadge.innerText = `${studentAvg}등급`;
  if (targetEl) targetEl.innerText = p.target || '목표 설정 중';

  if (simAdvice) {
    const higherGrade = Math.max(1.0, +(studentAvg - 0.7).toFixed(1));
    simAdvice.innerHTML = `현재 <b>${studentAvg}등급</b>에서 취약 과목('${p.weakSubject}')을 집중 보완하여 <b>${higherGrade}등급</b> 도달 시, 수시·정시 모두 1단계 상위 대학 라인으로 진입 가능합니다!`;
  }

  if (!container) return;

  // Evaluate each university for Susi and Jeongsi
  let evaluatedList = UNIVERSITY_DATABASE.map(item => {
    // 1. Susi evaluation
    const susiDiff = +(item.susi.cutGrade - studentAvg).toFixed(2);
    let susiStatus = 'fit';
    let susiLabel = '적정';
    if (susiDiff >= 0.45) { susiStatus = 'safe'; susiLabel = '안정'; }
    else if (susiDiff >= -0.15) { susiStatus = 'fit'; susiLabel = '적정'; }
    else { susiStatus = 'reach'; susiLabel = '소신/도전'; }

    // 2. Jeongsi evaluation
    const jeongsiDiff = +(item.jeongsi.cutGrade - studentAvg).toFixed(2);
    let jeongsiStatus = 'fit';
    let jeongsiLabel = '적정';
    if (jeongsiDiff >= 0.45) { jeongsiStatus = 'safe'; jeongsiLabel = '안정'; }
    else if (jeongsiDiff >= -0.15) { jeongsiStatus = 'fit'; jeongsiLabel = '적정'; }
    else { jeongsiStatus = 'reach'; jeongsiLabel = '소신/도전'; }

    // Overall status according to active admType filter
    let activeStatus = susiStatus;
    let activeLabel = '적정 지원권';
    let activeProb = '합격 확률 60~80%';
    let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    let dotColor = 'bg-blue-500';

    if (univFilter.admType === 'susi') {
      activeStatus = susiStatus;
      if (susiStatus === 'safe') {
        activeLabel = '수시 안정권';
        activeProb = '수시 합격률 85%↑';
        badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotColor = 'bg-emerald-500';
      } else if (susiStatus === 'fit') {
        activeLabel = '수시 적정권';
        activeProb = '수시 합격률 65~80%';
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
        dotColor = 'bg-blue-500';
      } else {
        activeLabel = '수시 소신/상향';
        activeProb = '수시 합격률 35~50%';
        badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
        dotColor = 'bg-amber-500';
      }
    } else if (univFilter.admType === 'jeongsi') {
      activeStatus = jeongsiStatus;
      if (jeongsiStatus === 'safe') {
        activeLabel = '정시 안정권';
        activeProb = '정시 합격률 85%↑';
        badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotColor = 'bg-emerald-500';
      } else if (jeongsiStatus === 'fit') {
        activeLabel = '정시 적정권';
        activeProb = '정시 합격률 65~80%';
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
        dotColor = 'bg-blue-500';
      } else {
        activeLabel = '정시 소신/상향';
        activeProb = '정시 합격률 35~50%';
        badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
        dotColor = 'bg-amber-500';
      }
    } else {
      // Comparison mode (choose best viable)
      const isSusiBetter = susiDiff > jeongsiDiff;
      if (susiStatus === 'safe' && jeongsiStatus === 'safe') {
        activeStatus = 'safe';
        activeLabel = '수시·정시 모두 안정';
        badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotColor = 'bg-emerald-500';
      } else if (isSusiBetter) {
        activeStatus = susiStatus;
        activeLabel = `수시가 더 유리 (${susiLabel})`;
        badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        dotColor = 'bg-indigo-500';
      } else {
        activeStatus = jeongsiStatus;
        activeLabel = `정시가 더 유리 (${jeongsiLabel})`;
        badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
        dotColor = 'bg-purple-500';
      }
    }

    return {
      ...item,
      susiDiff,
      jeongsiDiff,
      susiStatus,
      jeongsiStatus,
      activeStatus,
      activeLabel,
      activeProb,
      badgeColor,
      dotColor
    };
  });

  // Apply Probability Filter
  if (univFilter.prob !== 'all') {
    evaluatedList = evaluatedList.filter(item => item.activeStatus === univFilter.prob);
  }

  // Apply Major Filter
  if (univFilter.major !== 'all') {
    evaluatedList = evaluatedList.filter(item => item.track === univFilter.major);
  }

  // Sort
  evaluatedList.sort((a, b) => a.susi.cutGrade - b.susi.cutGrade);

  if (evaluatedList.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200 p-4">
        <i data-lucide="school" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
        <p class="text-xs font-bold text-slate-700">해당 조건에 일치하는 추천 대학이 없습니다.</p>
        <p class="text-[11px] text-slate-400 mt-0.5">상단 전형 필터나 계열 필터를 변경해보세요.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  let html = '';
  evaluatedList.forEach(univ => {
    const isSusiOnly = univFilter.admType === 'susi';
    const isJeongsiOnly = univFilter.admType === 'jeongsi';

    html += `
      <div class="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition space-y-2.5">
        
        <!-- Header: University Title & Probability Badge -->
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-xs shadow-sm shrink-0" style="background-color: ${univ.colorHex}">
              ${univ.symbol}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h4 class="font-black text-slate-900 text-sm tracking-tight">${univ.name}</h4>
                <span class="text-[10px] text-slate-400 font-medium">${univ.region}</span>
              </div>
              <p class="text-xs font-extrabold text-indigo-700 mt-0.2">${univ.major}</p>
            </div>
          </div>

          <!-- Overall Verdict Badge -->
          <div class="flex flex-col items-end shrink-0">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${univ.badgeColor}">
              <span class="w-1.5 h-1.5 rounded-full ${univ.dotColor}"></span>
              <span>${univ.activeLabel}</span>
            </span>
            <span class="text-[9px] text-slate-400 mt-0.5 font-medium">${univ.activeProb}</span>
          </div>
        </div>

        <!-- Susi vs Jeongsi Detailed Comparison Box -->
        <div class="grid ${isSusiOnly || isJeongsiOnly ? 'grid-cols-1' : 'grid-cols-2'} gap-2 text-[11px]">
          
          <!-- 1. 수시 상세 카드 -->
          ${!isJeongsiOnly ? `
            <div class="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100/80 space-y-1">
              <div class="flex items-center justify-between text-indigo-900 font-bold text-[10px]">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                  <span>수시 (학생부)</span>
                </span>
                <span class="text-indigo-600 font-mono text-[9px]">${univ.susi.competition}</span>
              </div>
              <div class="text-[11px]">
                <span class="text-slate-500 text-[10px] block">70% 합격컷:</span>
                <span class="font-black text-indigo-900 font-mono text-xs">${univ.susi.cutGrade}등급</span>
                <span class="text-[9px] text-slate-500 ml-1">내신</span>
              </div>
              <div class="text-[10px] text-slate-600 line-clamp-1" title="${univ.susi.minCriteria}">
                <b>최저</b>: ${univ.susi.minCriteria}
              </div>
              <div class="text-[9px] text-indigo-700 font-medium truncate">
                ${univ.susi.type}
              </div>
            </div>
          ` : ''}

          <!-- 2. 정시 상세 카드 -->
          ${!isSusiOnly ? `
            <div class="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100/80 space-y-1">
              <div class="flex items-center justify-between text-purple-900 font-bold text-[10px]">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                  <span>정시 (수능위주)</span>
                </span>
                <span class="text-purple-600 font-mono text-[9px]">${univ.jeongsi.group} (${univ.jeongsi.competition})</span>
              </div>
              <div class="text-[11px]">
                <span class="text-slate-500 text-[10px] block">70% 환산컷:</span>
                <span class="font-black text-purple-900 font-mono text-xs">${univ.jeongsi.cutPercentile}</span>
                <span class="text-[9px] text-slate-500 ml-1">(${univ.jeongsi.cutGrade}등급)</span>
              </div>
              <div class="text-[10px] text-slate-600 truncate" title="${univ.jeongsi.weights}">
                <b>반영</b>: ${univ.jeongsi.weights}
              </div>
              <div class="text-[9px] text-purple-700 font-medium truncate">
                수능 100% 선발
              </div>
            </div>
          ` : ''}

        </div>

        <p class="text-[10px] text-slate-500 leading-relaxed">
          💡 ${univ.info}
        </p>

        <!-- Actions -->
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
          <button onclick="setAsTargetUniversity('${univ.name}', '${univ.major}')" class="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 border border-indigo-100">
            <i data-lucide="target" class="w-3.5 h-3.5"></i>
            <span>목표로 설정</span>
          </button>
          <button onclick="askAiAboutUnivSusiJeongsi('${univ.name}', '${univ.major}', '${univ.susi.cutGrade}', '${univ.jeongsi.cutPercentile}')" class="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-sm">
            <i data-lucide="bot" class="w-3.5 h-3.5"></i>
            <span>수시·정시 전략상담</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons();
}

// Ask AI about detailed Susi vs Jeongsi strategy for this university
function askAiAboutUnivSusiJeongsi(univName, majorName, susiCut, jeongsiCut) {
  const studentAvg = calculateStudentAvgGrade();
  const prompt = `내 현재 평균 성적이 ${studentAvg}등급인데, '${univName} ${majorName}' (수시 컷 ${susiCut}등급 / 정시 컷 ${jeongsiCut})에 합격하기 위해선 수시(학생부)와 정시(수능) 중 어느 전형을 메인으로 삼아야 할지, 그리고 수능최저 충족 및 수능 반영 과목 대비 전략을 알려줘!`;

  switchTab('ai');
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = prompt;
    handleAiChatSubmit(new Event('submit'));
  }
}

// Set clicked university as student's primary target
function setAsTargetUniversity(univName, majorName) {
  const newTarget = `${univName} ${majorName}`;
  state.profile.target = newTarget;
  saveProfile();
  updateProfileUI();

  const currentTargetEl = document.getElementById('univCurrentTarget');
  if (currentTargetEl) currentTargetEl.innerText = newTarget;

  alert(`🎯 성취 목표가 [${newTarget}]으로 설정되었습니다!\nAI 플래너와 학습 멘토가 이 목표에 맞추어 최적화됩니다.`);
}
