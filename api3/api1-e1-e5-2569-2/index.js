/**
 * ══════════════════════════════════════════════════════════════════════════
 *  index.js
 *  BPES-App — Backend BASIC สำหรับสอนครูและนักเรียน ปวช.
 *
 *  วัตถุประสงค์: ให้นักเรียนเห็น "ภาพรวม" ของ Backend ทั้งระบบในที่เดียว
 *  Version 1: เรียนรู้ Backend และ API ในไฟล์เดียวก่อน
 *  Version 2: จึงค่อยแยก API Routing เป็นหลายไฟล์
 *
 *  โครงสร้างไฟล์นี้แบ่งเป็น 6 ส่วน:
 *  ┌─ ส่วนที่ 1: Setup — require packages + สร้าง Express app
 *  ├─ ส่วนที่ 2: Database — เชื่อมต่อ MySQL + ฟังก์ชันคำนวณ
 *  ├─ ส่วนที่ 3: Middleware — ตรวจสอบ JWT + สิทธิ์ role
 *  ├─ ส่วนที่ 4: Auth Routes — /api/auth/login, /api/auth/me
 *  ├─ ส่วนที่ 5: Users Routes — /api/users (CRUD)
 *  ├─ ส่วนที่ 6: Criteria Routes — /api/criteria (CRUD)
 *  ├─ ส่วนที่ 7: Evaluations Routes — /api/evaluations (self + evaluator)
 *  ├─ ส่วนที่ 8: Report Route — /api/report
 *  └─ ส่วนที่ 9: Static files + เปิด Server
 *
 *  รัน: npm start  หรือ  node index.js
 * ══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 1: SETUP
//  — โหลด packages ที่จำเป็น และตั้งค่า Express app
// ════════════════════════════════════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mysql   = require('mysql2/promise');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const app  = express();
const PORT = process.env.PORT || 7002;

// Middleware พื้นฐาน
app.use(cors({ origin: true }));           // อนุญาต Cross-Origin Request
app.use(express.json());                   // รับ body เป็น JSON
app.use(express.static(path.join(__dirname, 'public'))); // serve หน้าเว็บ

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 2: DATABASE
//  — เชื่อมต่อ MySQL และฟังก์ชันคำนวณผลประเมิน
//  ปกติแยกไปอยู่ที่: db.js
// ════════════════════════════════════════════════════════════════════════════

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'bpes_db',
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
});
 async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ เชื่อมต่อ MySQL สำเร็จ');
    conn.release();
  } catch (err) {
    console.error('❌ ไม่สามารถเชื่อมต่อ MySQL ได้:', err.message);
    process.exit(1);
  }
}
testConnection();

// ─── ฟังก์ชันคำนวณผลประเมิน ──────────────────────────────────────────────────

const SCALE_MAX = 4; // คะแนนสูงสุดต่อตัวชี้วัด (สเกล 1-4)

/**
 * แปลงเปอร์เซ็นต์ → ผลประเมิน
 * @param {number} pct  0–100
 * @returns {string}   'ดีเยี่ยม' | 'ดี' | 'ผ่าน' | 'ไม่ผ่าน'
 */
function calculateResult(pct) {
  if (pct >= 90) return 'ดีเยี่ยม';
  if (pct >= 75) return 'ดี';
  if (pct >= 60) return 'ผ่าน';
  return 'ไม่ผ่าน';
}

// ฟังก์ชันช่วยจัดข้อความ เพื่อลด syntax เช่น ?. และ ternary ซ้อน
function textOrNull(value) {
  if (!value) return null;
  return value.trim();
}

function textOrEmpty(value) {
  if (!value) return '';
  return value.trim();
}

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 3: MIDDLEWARE
//  — ตรวจสอบ JWT Token และ Role-based Access Control
//  ปกติแยกไปอยู่ที่: middleware/auth.js
// ════════════════════════════════════════════════════════════════════════════

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/**
 * verifyToken — ตรวจ Bearer Token ใน Header
 * ถ้าผ่าน: ใส่ req.user แล้วไปต่อ (next)
 * ถ้าไม่ผ่าน: ส่ง 401
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token)
    return res.status(401).json({ status: 'error', message: 'กรุณาเข้าสู่ระบบก่อน (ไม่พบ Token)', data: null });

  try {
    req.user = jwt.verify(token, JWT_SECRET); // ถอดรหัส token → ได้ payload
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Token ไม่ถูกต้องหรือหมดอายุ', data: null });
  }
}

// สำหรับผู้เริ่มต้น ใช้ middleware แยกตามหน้าที่ตรง ๆ
// อ่านง่ายกว่า requireRole(...) ที่เป็นฟังก์ชันคืนฟังก์ชัน
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'สำหรับ admin เท่านั้น', data: null });
  }
  next();
}

function evaluateeOnly(req, res, next) {
  if (req.user.role !== 'evaluatee') {
    return res.status(403).json({ status: 'error', message: 'สำหรับผู้รับการประเมินเท่านั้น', data: null });
  }
  next();
}

function evaluatorOrAdmin(req, res, next) {
  const role = req.user.role;

  if (role !== 'evaluator' && role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้', data: null });
  }
  next();
}

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 4: AUTH ROUTES
//  Version 2 จะแยกส่วนนี้ไปเป็น Auth Router
//
//  POST /api/auth/login  — เข้าสู่ระบบ → ได้ JWT Token
//  GET  /api/auth/me     — ดูข้อมูลตัวเองจาก Token
// ════════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ status: 'error', message: 'กรุณากรอก username และ password', data: null });

    // 1. หา user จาก DB
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (rows.length === 0)
      return res.status(401).json({ status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', data: null });

    const user = rows[0];

    // 2. ตรวจ password ด้วย bcrypt
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', data: null });

    // 3. สร้าง JWT Token (มีอายุ 1 ชั่วโมง)
    const payload = {
      id:         user.id,
      username:   user.username,
      full_name:  user.full_name,
      role:       user.role,
      department: user.department || '',
      position:   user.position   || '',
    };
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });

    return res.status(200).json({ status: 'success', message: 'เข้าสู่ระบบสำเร็จ', data: { token, user: payload } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// GET /api/auth/me — ดูข้อมูลตัวเอง (ต้อง login ก่อน)
app.get('/api/auth/me', verifyToken, (req, res) => {
  return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: req.user });
});

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 5: USERS ROUTES  (admin เท่านั้น)
//  Version 2 จะแยกส่วนนี้ไปเป็น Users Router
//
//  GET    /api/users?role=evaluatee  — ดูรายชื่อ users
//  POST   /api/users                 — เพิ่ม user ใหม่
//  PUT    /api/users/:id             — แก้ไข user
//  DELETE /api/users/:id             — ลบ user
// ════════════════════════════════════════════════════════════════════════════

const ALLOWED_ROLES = ['evaluatee', 'evaluator'];

// GET /api/users?role=evaluatee|evaluator
app.get('/api/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const { role } = req.query;
    let sql = 'SELECT id, username, full_name, role, department, position, created_at FROM users WHERE role != "admin"';
    const params = [];
    if (role && ALLOWED_ROLES.includes(role)) {
      sql += ' AND role = ?';
      params.push(role);
    }
    sql += ' ORDER BY id';
    const [rows] = await pool.query(sql, params);
    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// POST /api/users — เพิ่ม user
app.post('/api/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const { username, password, full_name, role, department, position } = req.body;
    if (!username || !password || !full_name || !role)
      return res.status(400).json({ status: 'error', message: 'ข้อมูลไม่ครบ (username, password, full_name, role)', data: null });
    if (!ALLOWED_ROLES.includes(role))
      return res.status(400).json({ status: 'error', message: 'role ต้องเป็น evaluatee หรือ evaluator', data: null });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO users (username, password, full_name, role, department, position) VALUES (?,?,?,?,?,?)',
      [username.trim(), hash, full_name.trim(), role, textOrNull(department), textOrNull(position)]
    );
    return res.status(201).json({ status: 'success', message: 'เพิ่มผู้ใช้งานสำเร็จ', data: { id: r.insertId, username, full_name, role } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ status: 'error', message: 'username นี้มีอยู่แล้ว', data: null });
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// PUT /api/users/:id — แก้ไข user
app.put('/api/users/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { full_name, department, position, password } = req.body;
    if (!full_name) return res.status(400).json({ status: 'error', message: 'กรุณากรอกชื่อ-นามสกุล', data: null });

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET full_name=?, department=?, position=?, password=? WHERE id=? AND role != "admin"',
        [full_name.trim(), textOrNull(department), textOrNull(position), hash, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET full_name=?, department=?, position=? WHERE id=? AND role != "admin"',
        [full_name.trim(), textOrNull(department), textOrNull(position), req.params.id]
      );
    }
    return res.status(200).json({ status: 'success', message: 'แก้ไขสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// DELETE /api/users/:id — ลบ user
app.delete('/api/users/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM users WHERE id=? AND role != "admin"',
      [req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบผู้ใช้งาน', data: null });
    return res.status(200).json({ status: 'success', message: 'ลบสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 6: CRITERIA ROUTES
//  Version 2 จะแยกส่วนนี้ไปเป็น Criteria Router
//
//  GET    /api/criteria      — ดูหัวข้อการประเมิน (ทุก role)
//  POST   /api/criteria      — เพิ่มหัวข้อ (admin)
//  PUT    /api/criteria/:id  — แก้ไขหัวข้อ (admin)
//  DELETE /api/criteria/:id  — ลบหัวข้อ (admin)
// ════════════════════════════════════════════════════════════════════════════

const FIXED_WEIGHT = 1; // น้ำหนักคงที่ทุกหัวข้อ (ทุกหัวข้อมีน้ำหนักเท่ากัน)

// GET /api/criteria
app.get('/api/criteria', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM criteria ORDER BY id');
    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// POST /api/criteria
app.post('/api/criteria', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ status: 'error', message: 'กรุณากรอกชื่อหัวข้อ', data: null });
    const [r] = await pool.query(
      'INSERT INTO criteria (name, description, weight) VALUES (?,?,?)',
      [name.trim(), textOrEmpty(description), FIXED_WEIGHT]
    );
    return res.status(201).json({ status: 'success', message: 'เพิ่มหัวข้อสำเร็จ', data: { id: r.insertId, name, description, weight: FIXED_WEIGHT } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// PUT /api/criteria/:id
app.put('/api/criteria/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ status: 'error', message: 'กรุณากรอกชื่อหัวข้อ', data: null });
    const [r] = await pool.query(
      'UPDATE criteria SET name=?, description=? WHERE id=?',
      [name.trim(), textOrEmpty(description), req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบหัวข้อ', data: null });
    return res.status(200).json({ status: 'success', message: 'แก้ไขสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// DELETE /api/criteria/:id
app.delete('/api/criteria/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM criteria WHERE id=?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบหัวข้อ', data: null });
    return res.status(200).json({ status: 'success', message: 'ลบหัวข้อสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 7: EVALUATIONS ROUTES
//  Version 2 จะแยกส่วนนี้ไปเป็น Evaluations Router
//
//  [evaluatee] GET  /api/evaluations/me              — ดูแบบฟอร์มตนเอง
//  [evaluatee] PUT  /api/evaluations/me              — บันทึกคะแนนตนเอง (UPSERT)
//  [evaluatee] GET  /api/evaluations/me/summary      — ดูสรุปผลตนเอง
//  [eval/admin] GET  /api/evaluations/evaluatees     — รายชื่อ evaluatee + progress
//  [eval/admin] GET  /api/evaluations/:evaluateeId   — รายละเอียดคนหนึ่ง
//  [eval/admin] PUT  /api/evaluations/:evaluateeId   — ให้คะแนน (UPSERT)
//  [eval/admin] POST /api/evaluations/:evaluateeId/submit — ยืนยันส่งผล
// ════════════════════════════════════════════════════════════════════════════

function currentYear() { return new Date().getFullYear(); }

function validScore(v) {
  const n = parseInt(v);
  return Number.isInteger(n) && n >= 1 && n <= SCALE_MAX;
}

// GET /api/evaluations/me — ดูแบบฟอร์มตนเอง (evaluatee)
app.get('/api/evaluations/me', verifyToken, evaluateeOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || currentYear();
    const [rows] = await pool.query(`
      SELECT c.id AS criterion_id, c.name AS criterion_name, c.description, c.weight,
             e.self_score, e.evidence_url, e.evaluator_score
      FROM   criteria c
      LEFT JOIN evaluations e
             ON e.criterion_id = c.id AND e.evaluatee_id = ? AND e.eval_year = ?
      ORDER BY c.id
    `, [req.user.id, year]);
    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// PUT /api/evaluations/me — บันทึกคะแนนตนเอง (UPSERT)
app.put('/api/evaluations/me', verifyToken, evaluateeOnly, async (req, res) => {
  try {
    const { criterion_id, self_score, evidence_url, eval_year } = req.body;
    if (!criterion_id || self_score === undefined)
      return res.status(400).json({ status: 'error', message: 'ข้อมูลไม่ครบ (criterion_id, self_score)', data: null });
    if (!validScore(self_score))
      return res.status(400).json({ status: 'error', message: `คะแนนต้องเป็นจำนวนเต็ม 1-${SCALE_MAX}`, data: null });

    const [[crit]] = await pool.query('SELECT id FROM criteria WHERE id=?', [criterion_id]);
    if (!crit) return res.status(404).json({ status: 'error', message: 'ไม่พบหัวข้อการประเมิน', data: null });

    const year = parseInt(eval_year) || currentYear();
    await pool.query(`
      INSERT INTO evaluations (evaluatee_id, criterion_id, eval_year, self_score, evidence_url)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE self_score = VALUES(self_score), evidence_url = VALUES(evidence_url)
    `, [req.user.id, criterion_id, year, parseInt(self_score), textOrNull(evidence_url)]);

    return res.status(201).json({ status: 'success', message: 'บันทึกคะแนนประเมินตนเองสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// GET /api/evaluations/me/summary — ดูสรุปผลตนเอง
app.get('/api/evaluations/me/summary', verifyToken, evaluateeOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || currentYear();
    const [[summary]] = await pool.query(
      'SELECT overall_feedback, submitted_at FROM evaluation_summaries WHERE evaluatee_id=? AND eval_year=?',
      [req.user.id, year]
    );
    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: summary || null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// GET /api/evaluations/evaluatees — รายชื่อ evaluatee + progress
app.get('/api/evaluations/evaluatees', verifyToken, evaluatorOrAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || currentYear();
    const [rows] = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.department, u.position,
             COUNT(DISTINCT CASE WHEN e.self_score      IS NOT NULL THEN e.criterion_id END) AS self_filled,
             COUNT(DISTINCT CASE WHEN e.evaluator_score IS NOT NULL THEN e.criterion_id END) AS evaluator_filled,
             (SELECT COUNT(*) FROM criteria) AS criteria_total,
             s.submitted_at
      FROM users u
      LEFT JOIN evaluations e ON e.evaluatee_id = u.id AND e.eval_year = ?
      LEFT JOIN evaluation_summaries s ON s.evaluatee_id = u.id AND s.eval_year = ?
      WHERE u.role = 'evaluatee'
      GROUP BY u.id
      ORDER BY u.id
    `, [year, year]);
    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// GET /api/evaluations/:evaluateeId — รายละเอียดของ evaluatee คนหนึ่ง
app.get('/api/evaluations/:evaluateeId', verifyToken, evaluatorOrAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || currentYear();
    const { evaluateeId } = req.params;

    const [[evaluatee]] = await pool.query(
      'SELECT id, username, full_name, department, position FROM users WHERE id=? AND role="evaluatee"',
      [evaluateeId]
    );
    if (!evaluatee) return res.status(404).json({ status: 'error', message: 'ไม่พบผู้รับการประเมิน', data: null });

    const [rows] = await pool.query(`
      SELECT c.id AS criterion_id, c.name AS criterion_name, c.description, c.weight,
             e.self_score, e.evidence_url, e.evaluator_score
      FROM   criteria c
      LEFT JOIN evaluations e
             ON e.criterion_id = c.id AND e.evaluatee_id = ? AND e.eval_year = ?
      ORDER BY c.id
    `, [evaluateeId, year]);

    const [[summary]] = await pool.query(
      'SELECT overall_feedback, submitted_at FROM evaluation_summaries WHERE evaluatee_id=? AND eval_year=?',
      [evaluateeId, year]
    );

    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: { evaluatee, criteria: rows, summary: summary || null } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// PUT /api/evaluations/:evaluateeId — ให้คะแนน (UPSERT)
app.put('/api/evaluations/:evaluateeId', verifyToken, evaluatorOrAdmin, async (req, res) => {
  try {
    const { criterion_id, evaluator_score, eval_year } = req.body;
    if (!criterion_id || evaluator_score === undefined)
      return res.status(400).json({ status: 'error', message: 'ข้อมูลไม่ครบ (criterion_id, evaluator_score)', data: null });
    if (!validScore(evaluator_score))
      return res.status(400).json({ status: 'error', message: `คะแนนต้องเป็นจำนวนเต็ม 1-${SCALE_MAX}`, data: null });

    const { evaluateeId } = req.params;
    const [[evaluatee]] = await pool.query(
      'SELECT id FROM users WHERE id=? AND role="evaluatee"', [evaluateeId]
    );
    if (!evaluatee) return res.status(404).json({ status: 'error', message: 'ไม่พบผู้รับการประเมิน', data: null });

    const [[crit]] = await pool.query('SELECT id FROM criteria WHERE id=?', [criterion_id]);
    if (!crit) return res.status(404).json({ status: 'error', message: 'ไม่พบหัวข้อการประเมิน', data: null });

    const year = parseInt(eval_year) || currentYear();
    await pool.query(`
      INSERT INTO evaluations (evaluatee_id, criterion_id, eval_year, evaluator_score)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE evaluator_score = VALUES(evaluator_score)
    `, [evaluateeId, criterion_id, year, parseInt(evaluator_score)]);

    return res.status(201).json({ status: 'success', message: 'บันทึกคะแนนสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// POST /api/evaluations/:evaluateeId/submit — ยืนยันส่งผลการประเมิน
app.post('/api/evaluations/:evaluateeId/submit', verifyToken, evaluatorOrAdmin, async (req, res) => {
  try {
    const { evaluateeId } = req.params;
    const { overall_feedback, eval_year } = req.body;

    const [[evaluatee]] = await pool.query(
      'SELECT id FROM users WHERE id=? AND role="evaluatee"', [evaluateeId]
    );
    if (!evaluatee) return res.status(404).json({ status: 'error', message: 'ไม่พบผู้รับการประเมิน', data: null });

    const year = parseInt(eval_year) || currentYear();

    // ตรวจว่าให้คะแนนกรรมการครบทุกหัวข้อแล้ว
    const [[{ criteria_total }]] = await pool.query('SELECT COUNT(*) AS criteria_total FROM criteria');
    const [[{ evaluator_filled }]] = await pool.query(
      'SELECT COUNT(*) AS evaluator_filled FROM evaluations WHERE evaluatee_id=? AND eval_year=? AND evaluator_score IS NOT NULL',
      [evaluateeId, year]
    );
    if (criteria_total === 0 || evaluator_filled < criteria_total)
      return res.status(400).json({ status: 'error', message: `กรุณาให้คะแนนกรรมการให้ครบทุกหัวข้อก่อน (${evaluator_filled}/${criteria_total})`, data: null });

    await pool.query(`
      INSERT INTO evaluation_summaries (evaluatee_id, evaluator_id, eval_year, overall_feedback)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE overall_feedback = VALUES(overall_feedback),
                               evaluator_id = VALUES(evaluator_id),
                               submitted_at = CURRENT_TIMESTAMP
    `, [evaluateeId, req.user.id, year, textOrEmpty(overall_feedback)]);

    return res.status(201).json({ status: 'success', message: 'ยืนยันและส่งผลการประเมินสำเร็จ', data: null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 8: REPORT ROUTE
//  Version 2 จะแยกส่วนนี้ไปเป็น Report Router
//
//  GET /api/report?year=Y — รายงานผลรวมทุก evaluatee (admin, evaluator)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/report', verifyToken, evaluatorOrAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const [rows] = await pool.query(`
      SELECT u.id AS evaluatee_id, u.full_name,
             AVG(e.self_score)      AS self_avg,
             AVG(e.evaluator_score) AS evaluator_avg
      FROM users u
      LEFT JOIN evaluations e ON e.evaluatee_id = u.id AND e.eval_year = ?
      WHERE u.role = 'evaluatee'
      GROUP BY u.id
      ORDER BY u.id
    `, [year]);

    const report = rows.map(row => {
      const percentage = row.evaluator_avg !== null
        ? parseFloat(((row.evaluator_avg / SCALE_MAX) * 100).toFixed(1))
        : null;

      return {
        evaluatee_id:  row.evaluatee_id,
        full_name:     row.full_name,
        self_avg:      row.self_avg
          ? parseFloat(parseFloat(row.self_avg).toFixed(2))
          : null,
        evaluator_avg: row.evaluator_avg
          ? parseFloat(parseFloat(row.evaluator_avg).toFixed(2))
          : null,
        result: percentage !== null
          ? calculateResult(percentage)
          : 'ยังไม่ประเมิน',
      };
    });

    return res.status(200).json({ status: 'success', message: 'สำเร็จ', data: report });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, data: null });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ส่วนที่ 9: STATIC FILES + เปิด SERVER
//  — serve หน้าเว็บใน public/ และเปิด port
// ════════════════════════════════════════════════════════════════════════════

// Catch-all: ทุก URL ที่ไม่ใช่ /api → ส่ง index.html (SPA)
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ BPES-App (Basic Backend — Single File) → http://localhost:${PORT}`);
    console.log(`   admin  / admin1234   (ฝ่ายบุคลากร)`);
    console.log(`   eval01 / eval1234    (กรรมการ)`);
    console.log(`   emp001 / emp1234     (ผู้รับการประเมิน)`);
    console.log('');
    console.log('📄 Backend และ API ทั้งหมดอยู่ในไฟล์: index.js');
    console.log('   ส่วนที่ 1: Setup');
    console.log('   ส่วนที่ 2: Database (pool + calculate)');
    console.log('   ส่วนที่ 3: Middleware (verifyToken, requireRole)');
    console.log('   ส่วนที่ 4: Auth Routes');
    console.log('   ส่วนที่ 5: Users Routes');
    console.log('   ส่วนที่ 6: Criteria Routes');
    console.log('   ส่วนที่ 7: Evaluations Routes');
    console.log('   ส่วนที่ 8: Report Route');
    console.log('   ส่วนที่ 9: Static + Start');
  });
}

module.exports = app;
