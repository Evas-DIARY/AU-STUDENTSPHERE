/**
 * AU StudentSphere - Express Application Server & REST API
 * Africa University - College of Engineering and Applied Sciences
 */

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const { db, hashPassword } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist
const uploadDir = path.join(__dirname, 'uploads');
const evidenceDir = path.join(uploadDir, 'evidence');
const avatarDir = path.join(uploadDir, 'avatars');
[uploadDir, evidenceDir, avatarDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer storage for evidence uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, evidenceDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `evidence_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files (.png, .jpg, .jpeg) are permitted as evidence.'));
    }
  }
});

// Static assets
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'views')));

// Request logger & simple token session middleware
function logAudit(userId, action, entityType, entityId, details, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    db.prepare(`
      INSERT INTO AuditLogs (user_id, action, entity_type, entity_id, details, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(userId || null, action, entityType, entityId || null, details || null, String(ip));
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ----------------------------------------------------------------------------
// AUTHENTICATION ROUTES (/api/auth)
// ----------------------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
  const { identifier, password, role } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const hashedPassword = hashPassword(password);

  // Search user by email or username
  let query = 'SELECT * FROM Users WHERE (email = ? OR username = ?)';
  let params = [identifier.trim().toLowerCase(), identifier.trim().toLowerCase()];

  if (role) {
    query += ' AND role = ?';
    params.push(role.toLowerCase());
  }

  const user = db.prepare(query).get(...params);

  if (!user || user.password_hash !== hashedPassword) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify your email/username and password.' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact CEAS administration.' });
  }

  // Update last login
  db.prepare("UPDATE Users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // Fetch role-specific profile details
  let profile = null;
  if (user.role === 'student') {
    profile = db.prepare('SELECT * FROM Students WHERE user_id = ?').get(user.id);
  } else if (user.role === 'lecturer') {
    profile = db.prepare('SELECT * FROM Lecturers WHERE user_id = ?').get(user.id);
  } else if (user.role === 'admin') {
    profile = db.prepare('SELECT * FROM Administrators WHERE user_id = ?').get(user.id);
  }

  logAudit(user.id, 'USER_LOGIN', 'User', user.id, `Logged in successfully as ${user.role}`, req);

  // Simple token generation (base64 payload for demo)
  const token = Buffer.from(JSON.stringify({ id: user.id, role: user.role, timestamp: Date.now() })).toString('base64');

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const { userId } = req.body;
  if (userId) {
    logAudit(userId, 'USER_LOGOUT', 'User', userId, 'User logged out', req);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = db.prepare('SELECT id, email FROM Users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    // Return friendly generic message for security
    return res.json({ success: true, message: 'If this email is registered in AU StudentSphere, password reset instructions have been dispatched.' });
  }

  logAudit(user.id, 'PASSWORD_RESET_REQUEST', 'User', user.id, 'Password reset requested', req);
  return res.json({ success: true, message: `Reset link dispatched to ${email}. For demonstration, you may sign in with default password 'Password123!'.` });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    const user = db.prepare('SELECT id, username, email, role, is_active FROM Users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    let profile = null;
    if (user.role === 'student') {
      profile = db.prepare('SELECT * FROM Students WHERE user_id = ?').get(user.id);
    } else if (user.role === 'lecturer') {
      profile = db.prepare('SELECT * FROM Lecturers WHERE user_id = ?').get(user.id);
    } else if (user.role === 'admin') {
      profile = db.prepare('SELECT * FROM Administrators WHERE user_id = ?').get(user.id);
    }

    res.json({ user: { ...user, profile } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid session.' });
  }
});

// ----------------------------------------------------------------------------
// STUDENTS API (/api/students)
// ----------------------------------------------------------------------------

// List all students (with search and filtering)
app.get('/api/students', (req, res) => {
  const { search, programme } = req.query;
  let query = `
    SELECT s.*, u.email, u.username,
      (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Verified') AS verified_count,
      (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Pending Verification') AS pending_count,
      (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Rejected') AS rejected_count,
      (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Resubmission Required') AS resubmission_count
    FROM Students s
    INNER JOIN Users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (s.full_name LIKE ? OR s.reg_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (programme) {
    query += ' AND s.programme LIKE ?';
    params.push(`%${programme}%`);
  }

  query += ' ORDER BY s.full_name ASC';
  const students = db.prepare(query).all(...params);
  res.json({ students });
});

// Get single student profile by ID
app.get('/api/students/:id', (req, res) => {
  const student = db.prepare(`
    SELECT s.*, u.email, u.username
    FROM Students s
    INNER JOIN Users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!student) return res.status(404).json({ error: 'Student not found.' });

  // Verification counts
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'Pending Verification' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'Resubmission Required' THEN 1 ELSE 0 END) as resubmission,
      COUNT(*) as total
    FROM Achievements
    WHERE student_id = ?
  `).get(student.id);

  res.json({ student, stats });
});

// Update student permitted profile details
app.put('/api/students/:id', (req, res) => {
  const { phone, bio, avatar_url, date_of_birth } = req.body;
  const studentId = req.params.id;

  const existing = db.prepare('SELECT * FROM Students WHERE id = ?').get(studentId);
  if (!existing) return res.status(404).json({ error: 'Student record not found.' });

  db.prepare(`
    UPDATE Students 
    SET phone = COALESCE(?, phone),
        bio = COALESCE(?, bio),
        avatar_url = COALESCE(?, avatar_url),
        date_of_birth = COALESCE(?, date_of_birth)
    WHERE id = ?
  `).run(phone, bio, avatar_url, date_of_birth, studentId);

  logAudit(existing.user_id, 'UPDATE_PROFILE', 'Student', studentId, 'Updated personal profile contact/bio', req);
  res.json({ success: true, message: 'Student profile updated successfully.' });
});

// Get academic records for a student
app.get('/api/students/:id/academic-records', (req, res) => {
  const records = db.prepare(`
    SELECT * FROM AcademicRecords
    WHERE student_id = ?
    ORDER BY academic_year DESC, semester DESC, course_code ASC
  `).all(req.params.id);

  res.json({ records });
});

// Get achievements for a student
app.get('/api/students/:id/achievements', (req, res) => {
  const { status, category } = req.query;
  let query = `
    SELECT a.*, 
           ae.id as evidence_id, ae.file_name, ae.file_path, ae.file_type, ae.file_size,
           av.decision as verification_decision, av.comments as verification_comments, 
           av.rejection_reason, av.verified_at, adm.full_name as verified_by_name
    FROM Achievements a
    LEFT JOIN AchievementEvidence ae ON a.id = ae.achievement_id
    LEFT JOIN AchievementVerifications av ON a.id = av.achievement_id
    LEFT JOIN Administrators adm ON av.admin_id = adm.id
    WHERE a.student_id = ?
  `;
  const params = [req.params.id];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  if (category) {
    query += ' AND a.category = ?';
    params.push(category);
  }

  query += ' ORDER BY a.submitted_at DESC';
  const achievements = db.prepare(query).all(...params);
  res.json({ achievements });
});

// ----------------------------------------------------------------------------
// ACHIEVEMENTS & EVIDENCE SUBMISSION (/api/achievements)
// ----------------------------------------------------------------------------

// Submit a new achievement (Starts strictly as 'Pending Verification')
app.post('/api/achievements', upload.single('evidence'), (req, res) => {
  const { student_id, title, category, description, date_achieved, issuing_organization } = req.body;

  if (!student_id || !title || !category || !description || !date_achieved || !issuing_organization) {
    return res.status(400).json({ error: 'All achievement fields are required.' });
  }

  const validCategories = ['Academic', 'Leadership', 'Extracurricular', 'Volunteering', 'Competition', 'Certificate'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
  }

  // Insert achievement with mandatory status 'Pending Verification'
  const result = db.prepare(`
    INSERT INTO Achievements (student_id, title, category, description, date_achieved, issuing_organization, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending Verification', datetime('now'))
  `).run(student_id, title.trim(), category, description.trim(), date_achieved, issuing_organization.trim());

  const achievementId = result.lastInsertRowid;

  // Insert evidence file if provided
  if (req.file) {
    const filePath = `/uploads/evidence/${req.file.filename}`;
    db.prepare(`
      INSERT INTO AchievementEvidence (achievement_id, file_name, file_path, file_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `).run(achievementId, req.file.originalname, filePath, req.file.mimetype, req.file.size);
  }

  // Find student user for audit and notification
  const student = db.prepare('SELECT * FROM Students WHERE id = ?').get(student_id);
  if (student) {
    logAudit(student.user_id, 'SUBMIT_ACHIEVEMENT', 'Achievement', achievementId, `Submitted achievement: ${title} (${category})`, req);

    // Notify administrators
    const adminUser = db.prepare("SELECT id FROM Users WHERE role = 'admin' LIMIT 1").get();
    if (adminUser) {
      db.prepare(`
        INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
        VALUES (?, 'New Achievement Submitted', ?, 'info', 0, datetime('now'))
      `).run(adminUser.id, `${student.full_name} submitted '${title}' for verification.`);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Achievement submitted successfully and placed in Administrator Verification Queue.',
    achievementId
  });
});

// Resubmit or edit achievement (e.g. after Resubmission Required)
app.put('/api/achievements/:id', upload.single('evidence'), (req, res) => {
  const achievementId = req.params.id;
  const { title, category, description, date_achieved, issuing_organization } = req.body;

  const existing = db.prepare('SELECT * FROM Achievements WHERE id = ?').get(achievementId);
  if (!existing) return res.status(404).json({ error: 'Achievement not found.' });

  // Update record and reset status to 'Pending Verification'
  db.prepare(`
    UPDATE Achievements
    SET title = COALESCE(?, title),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        date_achieved = COALESCE(?, date_achieved),
        issuing_organization = COALESCE(?, issuing_organization),
        status = 'Pending Verification',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(title, category, description, date_achieved, issuing_organization, achievementId);

  // If new file attached, replace evidence
  if (req.file) {
    db.prepare('DELETE FROM AchievementEvidence WHERE achievement_id = ?').run(achievementId);
    const filePath = `/uploads/evidence/${req.file.filename}`;
    db.prepare(`
      INSERT INTO AchievementEvidence (achievement_id, file_name, file_path, file_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `).run(achievementId, req.file.originalname, filePath, req.file.mimetype, req.file.size);
  }

  // Audit
  const student = db.prepare('SELECT * FROM Students WHERE id = ?').get(existing.student_id);
  if (student) {
    logAudit(student.user_id, 'RESUBMIT_ACHIEVEMENT', 'Achievement', achievementId, `Resubmitted achievement: ${existing.title}`, req);
  }

  res.json({ success: true, message: 'Achievement resubmitted for verification.' });
});

// Delete achievement (only pending or rejected)
app.delete('/api/achievements/:id', (req, res) => {
  const achievementId = req.params.id;
  const existing = db.prepare('SELECT * FROM Achievements WHERE id = ?').get(achievementId);
  if (!existing) return res.status(404).json({ error: 'Achievement not found.' });

  if (existing.status === 'Verified') {
    return res.status(403).json({ error: 'Verified achievements are permanent institutional records and cannot be deleted by students.' });
  }

  db.prepare('DELETE FROM Achievements WHERE id = ?').run(achievementId);
  res.json({ success: true, message: 'Achievement removed.' });
});

// ----------------------------------------------------------------------------
// ADMINISTRATOR & VERIFICATION QUEUE API (/api/admin)
// ----------------------------------------------------------------------------

// Get full verification queue with student info & evidence
app.get('/api/admin/verifications', (req, res) => {
  const { status, student_id } = req.query;
  let query = `
    SELECT 
      a.id AS achievement_id,
      a.title,
      a.category,
      a.description,
      a.date_achieved,
      a.issuing_organization,
      a.status,
      a.submitted_at,
      a.updated_at,
      s.id AS student_id,
      s.full_name AS student_name,
      s.reg_number,
      s.programme,
      s.year_of_study,
      s.avatar_url AS student_avatar,
      ae.id AS evidence_id,
      ae.file_name,
      ae.file_path,
      ae.file_type,
      ae.file_size,
      av.decision,
      av.comments AS admin_comments,
      av.rejection_reason,
      av.verified_at,
      adm.full_name AS verified_by_name
    FROM Achievements a
    INNER JOIN Students s ON a.student_id = s.id
    LEFT JOIN AchievementEvidence ae ON a.id = ae.achievement_id
    LEFT JOIN AchievementVerifications av ON a.id = av.achievement_id
    LEFT JOIN Administrators adm ON av.admin_id = adm.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  if (student_id) {
    query += ' AND a.student_id = ?';
    params.push(student_id);
  }

  query += " ORDER BY CASE WHEN a.status = 'Pending Verification' THEN 1 WHEN a.status = 'Resubmission Required' THEN 2 ELSE 3 END, a.submitted_at DESC";

  const verifications = db.prepare(query).all(...params);
  res.json({ verifications });
});

// Perform Verification Action: VERIFY, REJECT, or REQUEST RESUBMISSION
app.post('/api/admin/verifications/:id', (req, res) => {
  const achievementId = req.params.id;
  const { decision, comments, rejection_reason, admin_id } = req.body;

  if (!decision || !['Verified', 'Rejected', 'Resubmission Required'].includes(decision)) {
    return res.status(400).json({ error: "Decision must be 'Verified', 'Rejected', or 'Resubmission Required'." });
  }

  const achievement = db.prepare('SELECT * FROM Achievements WHERE id = ?').get(achievementId);
  if (!achievement) return res.status(404).json({ error: 'Achievement record not found.' });

  // Get active admin ID
  let activeAdminId = admin_id;
  if (!activeAdminId) {
    const defaultAdmin = db.prepare('SELECT id FROM Administrators LIMIT 1').get();
    activeAdminId = defaultAdmin ? defaultAdmin.id : 1;
  }

  // 1. Update achievement status
  db.prepare(`
    UPDATE Achievements 
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(decision, achievementId);

  // 2. Insert or replace verification decision record
  db.prepare('DELETE FROM AchievementVerifications WHERE achievement_id = ?').run(achievementId);
  db.prepare(`
    INSERT INTO AchievementVerifications (achievement_id, admin_id, decision, comments, rejection_reason, verified_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(achievementId, activeAdminId, decision, comments || null, rejection_reason || null);

  // 3. Notify the student
  const student = db.prepare('SELECT s.*, u.id as user_id FROM Students s JOIN Users u ON s.user_id = u.id WHERE s.id = ?').get(achievement.student_id);
  if (student) {
    let notifType = decision === 'Verified' ? 'success' : (decision === 'Rejected' ? 'error' : 'warning');
    let notifTitle = `Achievement ${decision}`;
    let notifMsg = `Your achievement '${achievement.title}' has been marked as ${decision}.`;
    if (decision === 'Rejected' && rejection_reason) {
      notifMsg += ` Reason: ${rejection_reason}`;
    } else if (decision === 'Resubmission Required' && comments) {
      notifMsg += ` Instructions: ${comments}`;
    }

    db.prepare(`
      INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).run(student.user_id, notifTitle, notifMsg, notifType);

    // Audit log
    const admin = db.prepare('SELECT * FROM Administrators WHERE id = ?').get(activeAdminId);
    const adminName = admin ? admin.full_name : 'Administrator';
    logAudit(admin ? admin.user_id : null, `VERIFICATION_${decision.toUpperCase()}`, 'Achievement', achievementId, `${adminName} marked achievement '${achievement.title}' as ${decision}. Comments: ${comments || rejection_reason || 'None'}`, req);
  }

  res.json({
    success: true,
    message: `Achievement successfully marked as '${decision}'.`,
    decision
  });
});

// Admin Dashboard KPI Stats
app.get('/api/admin/stats', (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM Students').get().count;
  const totalLecturers = db.prepare('SELECT COUNT(*) as count FROM Lecturers').get().count;
  const totalAchievements = db.prepare('SELECT COUNT(*) as count FROM Achievements').get().count;

  const verifiedCount = db.prepare("SELECT COUNT(*) as count FROM Achievements WHERE status = 'Verified'").get().count;
  const pendingCount = db.prepare("SELECT COUNT(*) as count FROM Achievements WHERE status = 'Pending Verification'").get().count;
  const rejectedCount = db.prepare("SELECT COUNT(*) as count FROM Achievements WHERE status = 'Rejected'").get().count;
  const resubmissionCount = db.prepare("SELECT COUNT(*) as count FROM Achievements WHERE status = 'Resubmission Required'").get().count;

  const totalRecommendations = db.prepare('SELECT COUNT(*) as count FROM RecommendationLetters').get().count;
  const issuedRecommendations = db.prepare("SELECT COUNT(*) as count FROM RecommendationLetters WHERE status = 'Issued'").get().count;

  res.json({
    totalStudents,
    totalLecturers,
    totalAchievements,
    verifiedCount,
    pendingCount,
    rejectedCount,
    resubmissionCount,
    totalRecommendations,
    issuedRecommendations
  });
});

// Admin Audit Logs
app.get('/api/admin/audit-logs', (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.username, u.email, u.role
    FROM AuditLogs a
    LEFT JOIN Users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC
    LIMIT 100
  `).all();
  res.json({ logs });
});

// Admin Users Management List
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.is_active, u.last_login, u.created_at,
           COALESCE(s.full_name, l.full_name, a.full_name) as full_name,
           COALESCE(s.reg_number, l.staff_id, a.admin_id) as identifier
    FROM Users u
    LEFT JOIN Students s ON u.id = s.user_id
    LEFT JOIN Lecturers l ON u.id = l.user_id
    LEFT JOIN Administrators a ON u.id = a.user_id
    ORDER BY u.role DESC, u.created_at DESC
  `).all();
  res.json({ users });
});

// ----------------------------------------------------------------------------
// LECTURERS & RECOMMENDATION LETTER SYSTEM (/api/lecturers, /api/recommendations)
// ----------------------------------------------------------------------------

// Get assigned demonstration students for lecturer dashboard switcher
app.get('/api/lecturers/:id/students', (req, res) => {
  const students = db.prepare(`
    SELECT s.*, u.email,
           (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Verified') AS verified_count,
           (SELECT COUNT(*) FROM Achievements a WHERE a.student_id = s.id AND a.status = 'Pending Verification') AS pending_count,
           (SELECT COUNT(*) FROM RecommendationLetters r WHERE r.student_id = s.id AND r.status = 'Issued') AS issued_recommendations
    FROM Students s
    INNER JOIN Users u ON s.user_id = u.id
    ORDER BY s.full_name ASC
  `).all();

  res.json({ students });
});

// List recommendation letters (filter by student_id or lecturer_id)
app.get('/api/recommendations', (req, res) => {
  const { student_id, lecturer_id, status } = req.query;
  let query = `
    SELECT r.*, 
           s.full_name as student_name, s.reg_number, s.programme, s.gpa,
           l.full_name as lecturer_name, l.title as lecturer_title, l.department as lecturer_department
    FROM RecommendationLetters r
    INNER JOIN Students s ON r.student_id = s.id
    INNER JOIN Lecturers l ON r.lecturer_id = l.id
    WHERE 1=1
  `;
  const params = [];

  if (student_id) {
    query += ' AND r.student_id = ?';
    params.push(student_id);
  }

  if (lecturer_id) {
    query += ' AND r.lecturer_id = ?';
    params.push(lecturer_id);
  }

  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }

  query += ' ORDER BY r.created_at DESC';
  const recommendations = db.prepare(query).all(...params);

  res.json({ recommendations });
});

// Get single recommendation letter details with included verified achievements
app.get('/api/recommendations/:id', (req, res) => {
  const recommendation = db.prepare(`
    SELECT r.*, 
           s.full_name as student_name, s.reg_number, s.programme, s.gpa, s.college as student_college,
           l.full_name as lecturer_name, l.title as lecturer_title, l.department as lecturer_department,
           l.office_location, l.phone as lecturer_phone, lu.email as lecturer_email
    FROM RecommendationLetters r
    INNER JOIN Students s ON r.student_id = s.id
    INNER JOIN Lecturers l ON r.lecturer_id = l.id
    INNER JOIN Users lu ON l.user_id = lu.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!recommendation) return res.status(404).json({ error: 'Recommendation letter not found.' });

  // Get achievements linked to this recommendation letter
  const achievements = db.prepare(`
    SELECT a.*
    FROM RecommendationLetterAchievements rla
    INNER JOIN Achievements a ON rla.achievement_id = a.id
    WHERE rla.recommendation_letter_id = ?
  `).all(recommendation.id);

  res.json({ recommendation, achievements });
});

// Create recommendation letter (Draft or Issued)
app.post('/api/recommendations', (req, res) => {
  const { student_id, lecturer_id, purpose, recipient_name, recipient_institution, recipient_address, date_issued, letter_content, status, selected_achievement_ids } = req.body;

  if (!student_id || !purpose || !recipient_institution || !letter_content) {
    return res.status(400).json({ error: 'Student, purpose, recipient institution, and letter content are required.' });
  }

  // Get active lecturer ID
  let activeLecturerId = lecturer_id;
  if (!activeLecturerId) {
    const defaultLecturer = db.prepare('SELECT id FROM Lecturers LIMIT 1').get();
    activeLecturerId = defaultLecturer ? defaultLecturer.id : 1;
  }

  // Generate official institutional reference number
  const year = new Date().getFullYear();
  const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
  const student = db.prepare('SELECT * FROM Students WHERE id = ?').get(student_id);
  const studentCode = student ? student.reg_number.replace(/[^A-Za-z0-9]/g, '') : 'REC';
  const referenceNumber = `AU/CEAS/REC/${year}/${studentCode}-${randomSeq}`;

  const letterStatus = status === 'Issued' ? 'Issued' : 'Draft';
  const issueDate = date_issued || new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    INSERT INTO RecommendationLetters (reference_number, student_id, lecturer_id, purpose, recipient_name, recipient_institution, recipient_address, date_issued, letter_content, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(referenceNumber, student_id, activeLecturerId, purpose, recipient_name || null, recipient_institution, recipient_address || null, issueDate, letter_content, letterStatus);

  const recommendationId = result.lastInsertRowid;

  // Insert verified achievements links
  if (Array.isArray(selected_achievement_ids) && selected_achievement_ids.length > 0) {
    const insertAch = db.prepare(`
      INSERT INTO RecommendationLetterAchievements (recommendation_letter_id, achievement_id)
      VALUES (?, ?)
    `);

    // Strict rule: Only include achievements that are VERIFIED
    for (const achId of selected_achievement_ids) {
      const isVerified = db.prepare("SELECT id FROM Achievements WHERE id = ? AND status = 'Verified'").get(achId);
      if (isVerified) {
        insertAch.run(recommendationId, achId);
      }
    }
  }

  // If issued, notify student and record audit log
  if (letterStatus === 'Issued' && student) {
    db.prepare(`
      INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
      VALUES (?, 'Official Recommendation Letter Issued', ?, 'success', 0, datetime('now'))
    `).run(student.user_id, `An official recommendation letter for '${purpose}' has been issued and is available for PDF download.`);

    const lecturer = db.prepare('SELECT * FROM Lecturers WHERE id = ?').get(activeLecturerId);
    logAudit(lecturer ? lecturer.user_id : null, 'ISSUE_RECOMMENDATION_LETTER', 'RecommendationLetter', recommendationId, `Issued letter ${referenceNumber} for ${student.full_name}`, req);
  }

  res.status(201).json({
    success: true,
    message: letterStatus === 'Issued' ? 'Recommendation letter issued successfully!' : 'Recommendation letter draft saved successfully.',
    recommendationId,
    referenceNumber
  });
});

// Update recommendation letter (edit draft or content)
app.put('/api/recommendations/:id', (req, res) => {
  const recId = req.params.id;
  const { purpose, recipient_name, recipient_institution, recipient_address, date_issued, letter_content, status, selected_achievement_ids } = req.body;

  const existing = db.prepare('SELECT * FROM RecommendationLetters WHERE id = ?').get(recId);
  if (!existing) return res.status(404).json({ error: 'Recommendation letter not found.' });

  db.prepare(`
    UPDATE RecommendationLetters
    SET purpose = COALESCE(?, purpose),
        recipient_name = COALESCE(?, recipient_name),
        recipient_institution = COALESCE(?, recipient_institution),
        recipient_address = COALESCE(?, recipient_address),
        date_issued = COALESCE(?, date_issued),
        letter_content = COALESCE(?, letter_content),
        status = COALESCE(?, status),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(purpose, recipient_name, recipient_institution, recipient_address, date_issued, letter_content, status, recId);

  // Update linked achievements if provided
  if (Array.isArray(selected_achievement_ids)) {
    db.prepare('DELETE FROM RecommendationLetterAchievements WHERE recommendation_letter_id = ?').run(recId);
    const insertAch = db.prepare(`
      INSERT INTO RecommendationLetterAchievements (recommendation_letter_id, achievement_id)
      VALUES (?, ?)
    `);
    for (const achId of selected_achievement_ids) {
      const isVerified = db.prepare("SELECT id FROM Achievements WHERE id = ? AND status = 'Verified'").get(achId);
      if (isVerified) {
        insertAch.run(recId, achId);
      }
    }
  }

  res.json({ success: true, message: 'Recommendation letter updated successfully.' });
});

// Issue a draft recommendation letter
app.post('/api/recommendations/:id/issue', (req, res) => {
  const recId = req.params.id;
  const existing = db.prepare('SELECT * FROM RecommendationLetters WHERE id = ?').get(recId);
  if (!existing) return res.status(404).json({ error: 'Recommendation letter not found.' });

  db.prepare("UPDATE RecommendationLetters SET status = 'Issued', updated_at = datetime('now') WHERE id = ?").run(recId);

  // Notify student
  const student = db.prepare('SELECT s.*, u.id as user_id FROM Students s JOIN Users u ON s.user_id = u.id WHERE s.id = ?').get(existing.student_id);
  if (student) {
    db.prepare(`
      INSERT INTO Notifications (user_id, title, message, type, is_read, created_at)
      VALUES (?, 'Recommendation Letter Issued', ?, 'success', 0, datetime('now'))
    `).run(student.user_id, `Your recommendation letter (Ref: ${existing.reference_number}) has been finalized and issued.`);
  }

  res.json({ success: true, message: 'Recommendation letter has been officially issued.' });
});

// ----------------------------------------------------------------------------
// NOTIFICATIONS API (/api/notifications)
// ----------------------------------------------------------------------------

app.get('/api/notifications', (req, res) => {
  const { user_id } = req.query;
  let query = 'SELECT * FROM Notifications';
  const params = [];

  if (user_id) {
    query += ' WHERE user_id = ?';
    params.push(user_id);
  }

  query += ' ORDER BY created_at DESC LIMIT 50';
  const notifications = db.prepare(query).all(...params);
  res.json({ notifications });
});

app.put('/api/notifications/:id/read', (req, res) => {
  db.prepare('UPDATE Notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/notifications/read-all', (req, res) => {
  const { user_id } = req.body;
  if (user_id) {
    db.prepare('UPDATE Notifications SET is_read = 1 WHERE user_id = ?').run(user_id);
  }
  res.json({ success: true });
});

// ----------------------------------------------------------------------------
// PAGE ROUTING & HTML VIEWS
// ----------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student-dashboard.html'));
});

app.get('/lecturer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'lecturer-dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/recommendation-preview', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'recommendation-preview.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` AU StudentSphere Server running at http://localhost:${PORT}`);
  console.log(` Africa University - College of Engineering & Applied Sciences`);
  console.log(` Relational database: SQLite (studentsphere.db)`);
  console.log(`=======================================================`);
});
