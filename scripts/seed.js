// scripts/seed.js — Populate database with realistic demo data
'use strict';
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { run, get, all, exec } = require('../db');

console.log('🌱 Seeding CyberShield database...\n');

// ─── Clear existing data ──────────────────────────────────────────────────────
exec(`
  DELETE FROM simulation_events;
  DELETE FROM simulations;
  DELETE FROM certificates;
  DELETE FROM quiz_results;
  DELETE FROM user_module_progress;
  DELETE FROM org_module_assignments;
  DELETE FROM quiz_questions;
  DELETE FROM quizzes;
  DELETE FROM lessons;
  DELETE FROM training_modules;
  DELETE FROM users;
  DELETE FROM organizations;
`);

// ─── Organizations ────────────────────────────────────────────────────────────
const orgs = [
  { id: uuid(), name: 'TechCorp Industries', plan: 'Enterprise', industry: 'Technology', status: 'active' },
  { id: uuid(), name: 'FinSecure Bank', plan: 'Enterprise', industry: 'Finance', status: 'active' },
  { id: uuid(), name: 'MedDataSystems', plan: 'Professional', industry: 'Healthcare', status: 'active' },
  { id: uuid(), name: 'RetailChain Ltd', plan: 'Professional', industry: 'Retail', status: 'trial' },
  { id: uuid(), name: 'CloudNative Inc', plan: 'Starter', industry: 'Technology', status: 'active' },
];
for (const o of orgs) {
  run('INSERT INTO organizations (id, name, plan, industry, status) VALUES (?, ?, ?, ?, ?)',
    [o.id, o.name, o.plan, o.industry, o.status]);
}
console.log(`✅ Created ${orgs.length} organizations`);

// ─── Users ────────────────────────────────────────────────────────────────────
const hash = (p) => bcrypt.hashSync(p, 10);

const users = [
  // Super Admin
  { id: uuid(), org_id: null, name: 'Alex Carter', email: 'alex@cybershield.io', password: 'Admin@1234', role: 'super_admin', dept: null, risk: null, avatar: 'AC' },

  // TechCorp (org[0])
  { id: uuid(), org_id: orgs[0].id, name: 'Sarah Mitchell', email: 'sarah@techcorp.com', password: 'Admin@1234', role: 'org_admin', dept: 'Management', risk: 85, avatar: 'SM' },
  { id: uuid(), org_id: orgs[0].id, name: 'James Rivera', email: 'james@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Engineering', risk: 72, avatar: 'JR' },
  { id: uuid(), org_id: orgs[0].id, name: 'Lisa Chen', email: 'lisa@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Marketing', risk: 45, avatar: 'LC' },
  { id: uuid(), org_id: orgs[0].id, name: 'Marcus Thompson', email: 'marcus@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Finance', risk: 88, avatar: 'MT' },
  { id: uuid(), org_id: orgs[0].id, name: 'Priya Nair', email: 'priya@techcorp.com', password: 'Pass@1234', role: 'analyst', dept: 'Security', risk: 95, avatar: 'PN' },
  { id: uuid(), org_id: orgs[0].id, name: 'David Kim', email: 'david@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'HR', risk: 22, avatar: 'DK' },
  { id: uuid(), org_id: orgs[0].id, name: 'Emma Wilson', email: 'emma@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Sales', risk: 61, avatar: 'EW' },
  { id: uuid(), org_id: orgs[0].id, name: 'Noah Garcia', email: 'noah@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Engineering', risk: 78, avatar: 'NG' },
  { id: uuid(), org_id: orgs[0].id, name: 'Zoe Adams', email: 'zoe@techcorp.com', password: 'Pass@1234', role: 'employee', dept: 'Marketing', risk: 35, avatar: 'ZA' },

  // FinSecure (org[1])
  { id: uuid(), org_id: orgs[1].id, name: 'Robert Chang', email: 'robert@finsecure.com', password: 'Admin@1234', role: 'org_admin', dept: 'Management', risk: 90, avatar: 'RC' },
  { id: uuid(), org_id: orgs[1].id, name: 'Fatima Al-Hassan', email: 'fatima@finsecure.com', password: 'Pass@1234', role: 'analyst', dept: 'Security', risk: 93, avatar: 'FA' },
  { id: uuid(), org_id: orgs[1].id, name: 'Tom Bradley', email: 'tom@finsecure.com', password: 'Pass@1234', role: 'employee', dept: 'Operations', risk: 54, avatar: 'TB' },

  // CloudNative (org[4])
  { id: uuid(), org_id: orgs[4].id, name: 'Yuki Tanaka', email: 'yuki@cloudnative.io', password: 'Admin@1234', role: 'org_admin', dept: 'Engineering', risk: 92, avatar: 'YT' },
  { id: uuid(), org_id: orgs[4].id, name: 'Sam Okonkwo', email: 'sam@cloudnative.io', password: 'Pass@1234', role: 'employee', dept: 'Engineering', risk: 89, avatar: 'SO' },
];

for (const u of users) {
  run(`INSERT INTO users (id, org_id, name, email, password_hash, role, department, avatar, risk_score, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || (abs(random()) % 72) || ' hours'))`,
    [u.id, u.org_id, u.name, u.email, hash(u.password), u.role, u.dept, u.avatar, u.risk ?? 70]);
}
console.log(`✅ Created ${users.length} users`);

const superAdmin = users[0];
const techcorpAdmin = users[1];
const techcorpUsers = users.slice(2, 10);
const finsecureAdmin = users[10];
const cloudAdmin = users[13];

// ─── Training Modules ─────────────────────────────────────────────────────────
const modules = [
  {
    id: uuid(), title: 'Phishing Awareness Fundamentals',
    description: 'Master identification of phishing attacks across email, SMS, voice, and social channels.',
    category: 'Phishing', difficulty: 'Beginner', duration: '45 min', status: 'published',
  },
  {
    id: uuid(), title: 'Password Security & MFA',
    description: 'Create unbreakable passwords, use password managers, and enforce multi-factor authentication.',
    category: 'Password Security', difficulty: 'Beginner', duration: '30 min', status: 'published',
  },
  {
    id: uuid(), title: 'Social Engineering Defense',
    description: 'Recognize pretexting, baiting, quid pro quo, and tailgating attacks before they succeed.',
    category: 'Social Engineering', difficulty: 'Intermediate', duration: '60 min', status: 'published',
  },
  {
    id: uuid(), title: 'Data Protection & GDPR Compliance',
    description: 'Handle PII, sensitive data classification, breach reporting, and regulatory compliance.',
    category: 'Data Protection', difficulty: 'Intermediate', duration: '90 min', status: 'published',
  },
  {
    id: uuid(), title: 'Advanced Threat Intelligence',
    description: 'Analyze indicators of compromise, threat actor TTPs, and conduct threat hunting.',
    category: 'Phishing', difficulty: 'Advanced', duration: '120 min', status: 'published',
  },
  {
    id: uuid(), title: 'Ransomware Response & Recovery',
    description: 'Incident response procedures, containment strategies, and recovery playbooks.',
    category: 'Social Engineering', difficulty: 'Advanced', duration: '75 min', status: 'draft',
  },
];

for (const m of modules) {
  run(`INSERT INTO training_modules (id, title, description, category, difficulty, duration, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.id, m.title, m.description, m.category, m.difficulty, m.duration, m.status, superAdmin.id]);
}
console.log(`✅ Created ${modules.length} training modules`);

// ─── Lessons ─────────────────────────────────────────────────────────────────
const lessonSets = [
  // Module 0: Phishing Awareness
  [
    { title: 'What is Phishing?', content: 'Phishing is a cyberattack using deceptive emails, messages, or websites to steal credentials or install malware. Attackers impersonate trusted entities — banks, executives, IT support — to manipulate victims into revealing sensitive information.\n\n**Key insight:** 91% of cyberattacks start with a phishing email.', duration: '8 min' },
    { title: 'Anatomy of a Phishing Email', content: 'Learn to dissect suspicious emails: examine sender addresses carefully (spoofed domains like "paypa1.com"), identify urgent language ("Your account will be suspended!"), scrutinize hover-over URLs that differ from display text, and spot generic greetings ("Dear Customer").', duration: '10 min' },
    { title: 'Spear Phishing & Whaling', content: 'Spear phishing targets specific individuals using personal information harvested from social media. Whaling targets C-suite executives. These attacks are far more convincing because they use your name, title, colleagues\' names, and relevant business context.', duration: '8 min' },
    { title: 'Smishing & Vishing', content: 'SMS phishing (smishing) delivers malicious links via text message, often mimicking delivery notifications or banking alerts. Voice phishing (vishing) uses phone calls where attackers impersonate IT support, government agencies, or financial institutions.', duration: '7 min' },
    { title: 'Reporting Procedures', content: 'When you suspect phishing: (1) Do NOT click any links or download attachments. (2) Report using your organization\'s Phish Alert Button or forward to security@[yourorg].com. (3) Delete the email. (4) If you clicked, immediately contact IT Security. Time is critical.', duration: '6 min' },
    { title: 'Real-World Case Studies', content: 'Analysis of major phishing incidents: the 2016 Democratic National Committee hack (spear phishing via Google Docs), the $120M Facebook/Google invoice fraud (BEC), and the Colonial Pipeline ransomware attack that began with a single compromised password from a phishing email.', duration: '9 min' },
  ],
  // Module 1: Password Security
  [
    { title: 'Password Strength Fundamentals', content: 'Strong passwords use 16+ characters combining uppercase, lowercase, numbers, and symbols. Avoid dictionary words, personal info, and common substitutions (p@ssw0rd is NOT secure). The math: a 16-char random password has 95^16 possible combinations — cracking it would take millions of years.', duration: '7 min' },
    { title: 'Password Managers', content: 'Password managers (1Password, Bitwarden, LastPass) generate and store unique, complex passwords for every account. You only need to remember one master password. They also warn about reused passwords, data breaches, and weak credentials across your accounts.', duration: '8 min' },
    { title: 'Multi-Factor Authentication', content: 'MFA adds a second verification layer beyond your password: something you know (PIN), something you have (authenticator app, hardware key), or something you are (biometrics). Even if your password is stolen, MFA blocks 99.9% of automated attacks.', duration: '8 min' },
    { title: 'Passphrase Strategies', content: 'Passphrases like "correct-horse-battery-staple" are memorable and secure. Four random words create 44+ bits of entropy. Use a consistent method: pick 4 random words from a dictionary, separate with dashes or symbols, and optionally add a number.', duration: '7 min' },
  ],
  // Module 2: Social Engineering
  [
    { title: 'Psychology of Manipulation', content: 'Social engineers exploit cognitive biases: authority (impersonating executives), urgency (time pressure), scarcity (limited access), social proof (everyone else did it), and reciprocity (I did something for you). Understanding these biases is your first defense.', duration: '10 min' },
    { title: 'Pretexting Attacks', content: 'Pretexting involves creating a fabricated scenario to extract information. Examples: calling IT helpdesk claiming to be a new employee needing access, or emailing finance claiming to be the CEO requesting an urgent wire transfer. Verify identity through out-of-band channels.', duration: '8 min' },
    { title: 'Physical Security', content: 'Tailgating (following someone through a secure door) and baiting (leaving infected USB drives) are physical social engineering attacks. Always challenge unfamiliar individuals in secure areas, never prop doors open, and treat found USB drives as potential weapons.', duration: '8 min' },
    { title: 'Business Email Compromise', content: 'BEC attacks cost businesses $50 billion globally since 2013. Attackers compromise or spoof executive email accounts to request wire transfers, gift card purchases, or sensitive data. Implement verification procedures for any financial request received via email alone.', duration: '10 min' },
    { title: 'Social Media OSINT', content: 'Attackers harvest your LinkedIn, Facebook, and Twitter for attack ammunition: your manager\'s name, company projects, travel plans, and colleague relationships. Audit your public social media exposure and be selective about what professional information you share publicly.', duration: '9 min' },
    { title: 'Incident Reporting', content: 'Report all social engineering attempts, even unsuccessful ones. Your report might be the pattern that identifies an active campaign targeting your organization. Use the incident reporting system, include the exact conversation or email, and never feel embarrassed — reporting is heroic.', duration: '7 min' },
    { title: 'Building a Security Culture', content: 'Security culture means every employee feels empowered to question suspicious requests, verify identities, and report concerns without fear of consequences. Leadership must model secure behavior. Security is everyone\'s responsibility, not just IT\'s.', duration: '8 min' },
    { title: 'Red Team Exercises', content: 'Red team exercises simulate real social engineering attacks against your organization to test defenses. Participate actively, learn from results, and understand that being caught in a simulation is valuable training, not punishment.', duration: '7 min' },
  ],
];

let totalLessons = 0;
for (let i = 0; i < Math.min(lessonSets.length, modules.length); i++) {
  for (let j = 0; j < lessonSets[i].length; j++) {
    const l = lessonSets[i][j];
    run('INSERT INTO lessons (id, module_id, title, content, order_index, duration) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), modules[i].id, l.title, l.content, j, l.duration]);
    totalLessons++;
  }
  // Update lesson count
  run('UPDATE training_modules SET lessons = ? WHERE id = ?', [lessonSets[i].length, modules[i].id]);
}
console.log(`✅ Created ${totalLessons} lessons`);

// ─── Quizzes ─────────────────────────────────────────────────────────────────
const quizData = [
  {
    moduleId: modules[0].id,
    title: 'Phishing Awareness Assessment',
    pass_score: 70,
    questions: [
      { question: 'Which of the following is the strongest indicator of a phishing email?', options: ['The email contains your first name', 'Urgent language demanding immediate account action', 'The email arrives on a Monday morning', 'The sender works at a well-known company'], answer: 1 },
      { question: 'You receive an email from "support@paypa1.com" asking you to verify your account. What do you do?', options: ['Click the link and log in to check', 'Reply asking for more information', 'Report it as phishing and delete it', 'Forward it to a colleague to verify'], answer: 2 },
      { question: 'What distinguishes a spear phishing attack from a generic phishing email?', options: ['It arrives via SMS instead of email', 'It targets specific individuals with personalized content', 'It only targets mobile devices', 'It always contains malware attachments'], answer: 1 },
      { question: 'You hover over a hyperlink in an email that displays "Click here to reset your password" and the URL shows "http://microsoft.resetaccount.xyz". What should you do?', options: ['Click it — Microsoft has many domains', 'Navigate directly to microsoft.com instead', 'Call the sender to ask if it\'s legitimate', 'Share the email with your team for a second opinion'], answer: 1 },
      { question: 'Which attack type uses SMS messages to deliver phishing content?', options: ['Vishing', 'Smishing', 'Whaling', 'Clone phishing'], answer: 1 },
      { question: 'Your manager sends you a WhatsApp message from an unknown number asking for 10 gift card codes urgently. What is your first action?', options: ['Purchase the gift cards and send codes immediately', 'Verify by calling your manager on their known work number', 'Send a reply asking for more details', 'Ignore the message'], answer: 1 },
      { question: 'What percentage of cyberattacks start with a phishing email?', options: ['45%', '67%', '91%', '78%'], answer: 2 },
    ]
  },
  {
    moduleId: modules[1].id,
    title: 'Password Security Assessment',
    pass_score: 70,
    questions: [
      { question: 'Which password is the strongest?', options: ['Password123!', 'P@ssw0rd', 'correct-horse-battery-staple-97', 'Tr0ub4dor&3'], answer: 2 },
      { question: 'What is the primary benefit of using a password manager?', options: ['It makes passwords shorter and easier to remember', 'It generates and stores unique complex passwords for each account', 'It eliminates the need for multi-factor authentication', 'It automatically changes your passwords daily'], answer: 1 },
      { question: 'Multi-factor authentication blocks approximately what percentage of automated attacks?', options: ['50%', '75%', '85%', '99.9%'], answer: 3 },
      { question: 'You receive a text message with a 6-digit authentication code that you did not request. What should you do?', options: ['Enter the code on the login page you\'re on', 'Share the code with the support agent who called', 'Ignore the text message', 'Immediately change your password and report it to IT'], answer: 3 },
      { question: 'Which of these represents a good passphrase strategy?', options: ['Substituting letters with numbers: P@ssw0rd', 'Using your pet\'s name with your birth year', 'Combining 4+ random unrelated words with separators', 'Using the same strong password across all accounts'], answer: 2 },
    ]
  },
  {
    moduleId: modules[2].id,
    title: 'Social Engineering Defense Assessment',
    pass_score: 70,
    questions: [
      { question: 'An attacker calls pretending to be from IT support and asks for your password to fix an urgent system issue. What do you do?', options: ['Provide it — IT legitimately needs access to fix things', 'Hang up and call IT support back on the known official number', 'Ask them to send an email instead', 'Give them a temporary password you\'ll change later'], answer: 1 },
      { question: 'Someone in a suit follows you through a badge-access door claiming to be from the auditing firm. What is the correct action?', options: ['Let them in — they look professional', 'Ask them to badge in themselves or wait for an escort', 'Report it later in your end-of-day update', 'Ask a colleague to deal with it'], answer: 1 },
      { question: 'Which cognitive bias do attackers exploit when they say "Your CEO sent me and this is extremely time-sensitive"?', options: ['Scarcity', 'Reciprocity', 'Authority and urgency combined', 'Social proof'], answer: 2 },
      { question: 'You find a USB drive in the company parking lot labeled "Q4 Salary Review". What do you do?', options: ['Plug it in to identify the owner', 'Leave it in the lost and found', 'Hand it directly to IT security without plugging it in', 'Plug it into an isolated machine to check contents safely'], answer: 2 },
      { question: 'Business Email Compromise (BEC) attacks primarily target which department?', options: ['HR and payroll', 'Finance and accounts payable', 'IT and security teams', 'Marketing and communications'], answer: 1 },
    ]
  },
  {
    moduleId: modules[3].id,
    title: 'Data Protection & GDPR Assessment',
    pass_score: 75,
    questions: [
      { question: 'Under GDPR, what is the maximum time allowed to report a personal data breach to the supervisory authority?', options: ['24 hours', '48 hours', '72 hours', '7 days'], answer: 2 },
      { question: 'Which of the following is considered Personally Identifiable Information (PII)?', options: ['Company revenue figures', 'Job titles without names', 'IP addresses combined with browsing history', 'Generic product descriptions'], answer: 2 },
      { question: 'A colleague asks you to email a spreadsheet with customer credit card numbers. What should you do?', options: ['Email it using company email — it\'s internal', 'Encrypt the file before emailing', 'Deny the request and report the need through proper data access channels', 'Share via WhatsApp instead of email'], answer: 2 },
      { question: 'What is data minimization?', options: ['Using the smallest possible file formats', 'Collecting only the minimum personal data necessary for a specific purpose', 'Deleting all data after 30 days', 'Limiting data access to senior management only'], answer: 1 },
    ]
  },
];

let totalQuestions = 0;
for (const qd of quizData) {
  const quizId = uuid();
  run('INSERT INTO quizzes (id, module_id, title, pass_score) VALUES (?, ?, ?, ?)',
    [quizId, qd.moduleId, qd.title, qd.pass_score]);

  for (let i = 0; i < qd.questions.length; i++) {
    const q = qd.questions[i];
    run('INSERT INTO quiz_questions (id, quiz_id, question, options, answer_index, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), quizId, q.question, JSON.stringify(q.options), q.answer, i]);
    totalQuestions++;
  }
}
console.log(`✅ Created ${quizData.length} quizzes with ${totalQuestions} questions`);

// ─── Org Module Assignments ───────────────────────────────────────────────────
const publishedModules = modules.filter(m => m.status === 'published');
// Assign all published modules to TechCorp and FinSecure
for (const org of [orgs[0], orgs[1]]) {
  for (const m of publishedModules) {
    run('INSERT OR IGNORE INTO org_module_assignments (id, org_id, module_id, assigned_by) VALUES (?, ?, ?, ?)',
      [uuid(), org.id, m.id, superAdmin.id]);
  }
}
// Assign first 3 to smaller orgs
for (const org of [orgs[2], orgs[3], orgs[4]]) {
  for (const m of publishedModules.slice(0, 3)) {
    run('INSERT OR IGNORE INTO org_module_assignments (id, org_id, module_id, assigned_by) VALUES (?, ?, ?, ?)',
      [uuid(), org.id, m.id, superAdmin.id]);
  }
}
console.log(`✅ Assigned modules to organizations`);

// ─── User Progress & Quiz Results ────────────────────────────────────────────
const quizzes = all('SELECT * FROM quizzes');
const quizMap = {};
for (const q of quizzes) quizMap[q.module_id] = q;

// Progress for TechCorp employees
const progressData = [
  // James Rivera — 3 modules done
  { user: techcorpUsers[0], moduleIdx: 0, progress: 100, score: 94, completed: true },
  { user: techcorpUsers[0], moduleIdx: 1, progress: 100, score: 98, completed: true },
  { user: techcorpUsers[0], moduleIdx: 2, progress: 40, score: null, completed: false },
  // Lisa Chen — 1 module done
  { user: techcorpUsers[1], moduleIdx: 1, progress: 100, score: 76, completed: true },
  { user: techcorpUsers[1], moduleIdx: 0, progress: 20, score: null, completed: false },
  // Marcus Thompson — all 5 done
  { user: techcorpUsers[2], moduleIdx: 0, progress: 100, score: 97, completed: true },
  { user: techcorpUsers[2], moduleIdx: 1, progress: 100, score: 100, completed: true },
  { user: techcorpUsers[2], moduleIdx: 2, progress: 100, score: 88, completed: true },
  { user: techcorpUsers[2], moduleIdx: 3, progress: 100, score: 82, completed: true },
  { user: techcorpUsers[2], moduleIdx: 4, progress: 100, score: 91, completed: true },
  // Priya Nair (analyst) — all done
  { user: techcorpUsers[3], moduleIdx: 0, progress: 100, score: 100, completed: true },
  { user: techcorpUsers[3], moduleIdx: 1, progress: 100, score: 100, completed: true },
  { user: techcorpUsers[3], moduleIdx: 2, progress: 100, score: 96, completed: true },
  { user: techcorpUsers[3], moduleIdx: 3, progress: 100, score: 93, completed: true },
  { user: techcorpUsers[3], moduleIdx: 4, progress: 100, score: 98, completed: true },
  // Emma Wilson — 2 done
  { user: techcorpUsers[5], moduleIdx: 0, progress: 100, score: 80, completed: true },
  { user: techcorpUsers[5], moduleIdx: 1, progress: 60, score: null, completed: false },
];

for (const pd of progressData) {
  const progressId = uuid();
  run(`INSERT OR IGNORE INTO user_module_progress
    (id, user_id, module_id, progress, completed, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [progressId, pd.user.id, modules[pd.moduleIdx].id, pd.progress,
     pd.completed ? 1 : 0,
     pd.completed ? `datetime('now', '-${Math.floor(Math.random() * 30)} days')` : null]
  );

  // Create quiz result if completed with score
  if (pd.completed && pd.score !== null && quizMap[modules[pd.moduleIdx].id]) {
    const quizId = quizMap[modules[pd.moduleIdx].id].id;
    const resultId = uuid();
    const passed = pd.score >= quizMap[modules[pd.moduleIdx].id].pass_score ? 1 : 0;

    run('INSERT INTO quiz_results (id, user_id, quiz_id, score, passed) VALUES (?, ?, ?, ?, ?)',
      [resultId, pd.user.id, quizId, pd.score, passed]);

    // Issue certificate if passed
    if (passed) {
      run('INSERT OR IGNORE INTO certificates (id, user_id, module_id, quiz_result_id, score) VALUES (?, ?, ?, ?, ?)',
        [uuid(), pd.user.id, modules[pd.moduleIdx].id, resultId, pd.score]);
    }
  }
}
console.log(`✅ Created user progress and quiz results`);

// ─── Simulations ──────────────────────────────────────────────────────────────
const simulations = [
  { id: uuid(), org_id: orgs[0].id, name: 'Q4 Phishing Campaign', type: 'Phishing', status: 'completed' },
  { id: uuid(), org_id: orgs[0].id, name: 'Finance Spear-Phishing', type: 'Spear Phishing', status: 'completed' },
  { id: uuid(), org_id: orgs[0].id, name: 'Q1 Security Awareness', type: 'Phishing', status: 'active' },
  { id: uuid(), org_id: orgs[1].id, name: 'FinSecure Q3 Phish Test', type: 'Phishing', status: 'completed' },
];

for (const s of simulations) {
  run(`INSERT INTO simulations (id, org_id, name, type, status, created_by, launched_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-' || (abs(random()) % 60) || ' days'))`,
    [s.id, s.org_id, s.name, s.type, s.status, superAdmin.id]);
}

// Add simulation events for TechCorp employees in first simulation
const techcorpEmployees = users.filter(u => u.org_id === orgs[0].id && u.role === 'employee');
for (const emp of techcorpEmployees) {
  run("INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'sent')",
    [uuid(), simulations[0].id, emp.id]);

  // 85% open rate
  if (Math.random() < 0.85) {
    run("INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'opened')",
      [uuid(), simulations[0].id, emp.id]);
  }

  // 30% click rate
  if (Math.random() < 0.30) {
    run("INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'clicked')",
      [uuid(), simulations[0].id, emp.id]);
    // Lower their risk score
    run('UPDATE users SET risk_score = MAX(0, risk_score - 12) WHERE id = ?', [emp.id]);

    // 30% of clickers submit credentials
    if (Math.random() < 0.30) {
      run("INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'submitted')",
        [uuid(), simulations[0].id, emp.id]);
      run('UPDATE users SET risk_score = MAX(0, risk_score - 8) WHERE id = ?', [emp.id]);
    }
  }
}

// Force David Kim (high-risk) to have clicked
const davidKim = users.find(u => u.email === 'david@techcorp.com');
if (davidKim) {
  run("INSERT OR IGNORE INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'clicked')",
    [uuid(), simulations[0].id, davidKim.id]);
}
// Force Lisa Chen to have clicked
const lisaChen = users.find(u => u.email === 'lisa@techcorp.com');
if (lisaChen) {
  run("INSERT OR IGNORE INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'clicked')",
    [uuid(), simulations[0].id, lisaChen.id]);
}

// Q1 active simulation — just sent events
for (const emp of techcorpEmployees) {
  run("INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'sent')",
    [uuid(), simulations[2].id, emp.id]);
}

// Update module ratings
run("UPDATE training_modules SET rating = 4.8 WHERE id = ?", [modules[0].id]);
run("UPDATE training_modules SET rating = 4.7 WHERE id = ?", [modules[1].id]);
run("UPDATE training_modules SET rating = 4.6 WHERE id = ?", [modules[2].id]);
run("UPDATE training_modules SET rating = 4.5 WHERE id = ?", [modules[3].id]);
run("UPDATE training_modules SET rating = 4.9 WHERE id = ?", [modules[4].id]);
run("UPDATE training_modules SET rating = 4.7 WHERE id = ?", [modules[5].id]);

console.log(`✅ Created ${simulations.length} simulations with tracking events`);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n✅ Database seeded successfully!\n');
console.log('━'.repeat(50));
console.log('Demo Credentials:');
console.log('━'.repeat(50));
console.log('  Super Admin:   alex@cybershield.io      / Admin@1234');
console.log('  Org Admin:     sarah@techcorp.com        / Admin@1234');
console.log('  Employee:      james@techcorp.com        / Pass@1234');
console.log('  Analyst:       priya@techcorp.com        / Pass@1234');
console.log('  High-Risk:     david@techcorp.com        / Pass@1234');
console.log('  FinSecure:     robert@finsecure.com      / Admin@1234');
console.log('━'.repeat(50));
